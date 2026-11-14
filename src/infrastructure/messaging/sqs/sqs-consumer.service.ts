import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { ProcessWagerTransactionUseCase, ProcessWagerTransactionCommand } from '@/application/use-cases/process-wager-transaction.use-case';
import {
  TransientException,
  PermanentException,
  DomainException,
} from '@/common/exceptions/domain.exceptions';

interface SqsMessageBody {
  walletId: string;
  kind: string;
  amount: string;
  idempotencyKey: string;
  referenceTransactionId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private client: SQSClient;
  private queueUrl: string;
  private dlqUrl: string;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly consumerName = 'wagering-processor';

  constructor(
    private readonly configService: ConfigService,
    private readonly processTransactionUseCase: ProcessWagerTransactionUseCase
  ) {}

  async onModuleInit(): Promise<void> {
    this.initializeClient();
    await this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPolling();
  }

  private initializeClient(): void {
    this.client = new SQSClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      endpoint: this.configService.get('SQS_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', 'test'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', 'test'),
      },
    });

    this.queueUrl = this.configService.get('SQS_QUEUE_URL', '');
    this.dlqUrl = this.configService.get('SQS_DLQ_URL', '');

    if (!this.queueUrl) {
      this.logger.warn('SQS_QUEUE_URL not configured, consumer will not start');
    }
  }

  async startPolling(): Promise<void> {
    if (this.isRunning || !this.queueUrl) return;

    this.isRunning = true;
    this.logger.log('Starting SQS consumer polling...');

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.handleShutdown());
    process.on('SIGINT', () => this.handleShutdown());

    this.pollMessages();
  }

  private async pollMessages(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.configService.get('CONSUMER_BATCH_SIZE', 10);
      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: batchSize,
        WaitTimeSeconds: 20, // Long polling
        VisibilityTimeout: 60, // Message hidden for 60s while processing
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      });

      const response = await this.client.send(command);
      const messages = response.Messages || [];

      if (messages.length > 0) {
        this.logger.debug(`Received ${messages.length} messages from SQS`);
        await this.processMessages(messages);
      }
    } catch (error) {
      this.logger.error('Error polling SQS messages', error);
    } finally {
      if (this.isRunning) {
        const interval = this.configService.get('CONSUMER_POLL_INTERVAL_MS', 1000);
        this.pollInterval = setTimeout(() => this.pollMessages(), interval);
      }
    }
  }

  private async processMessages(messages: Message[]): Promise<void> {
    for (const message of messages) {
      if (!this.isRunning) break;

      try {
        await this.processMessage(message);
        // Delete message after successful processing
        await this.deleteMessage(message);
      } catch (error) {
        await this.handleMessageError(message, error);
      }
    }
  }

  private async processMessage(message: Message): Promise<void> {
    const messageId = message.MessageId || 'unknown';
    const body = message.Body;

    if (!body) {
      this.logger.warn(`Message ${messageId} has no body, skipping`);
      return;
    }

    let parsedBody: SqsMessageBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (error) {
      this.logger.error(`Failed to parse message ${messageId}`, error);
      throw new PermanentException('Invalid message format');
    }

    // Validate required fields
    if (!parsedBody.walletId || !parsedBody.kind || !parsedBody.amount || !parsedBody.idempotencyKey) {
      this.logger.warn(`Message ${messageId} missing required fields`);
      throw new PermanentException('Missing required fields');
    }

    const command: ProcessWagerTransactionCommand = {
      walletId: parsedBody.walletId,
      kind: parsedBody.kind as any,
      amount: parsedBody.amount,
      idempotencyKey: parsedBody.idempotencyKey,
      referenceTransactionId: parsedBody.referenceTransactionId,
      description: parsedBody.description,
      metadata: parsedBody.metadata,
      consumerName: this.consumerName,
      messageId,
    };

    this.logger.debug(`Processing message ${messageId} for wallet ${command.walletId}`);
    await this.processTransactionUseCase.execute(command);
  }

  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) return;

    try {
      await this.client.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        })
      );
    } catch (error) {
      this.logger.error('Failed to delete message from SQS', error);
    }
  }

  private async handleMessageError(message: Message, error: unknown): Promise<void> {
    const messageId = message.MessageId || 'unknown';

    if (error instanceof DomainException) {
      switch (error.code) {
        case 'TRANSIENT_ERROR':
          // Transient error - don't delete, let it become visible again for retry
          this.logger.warn(`Transient error for message ${messageId}: ${error.message}`);
          // Message will reappear after visibility timeout
          break;

        case 'DUPLICATE_MESSAGE':
        case 'IDEMPOTENCY_CONFLICT':
        case 'INSUFFICIENT_FUNDS':
        case 'WALLET_NOT_FOUND':
        case 'REFERENCED_TRANSACTION_NOT_FOUND':
        case 'REFERENCED_TRANSACTION_NOT_PROCESSED':
        case 'INVALID_TRANSACTION_STATE':
        case 'OPTIMISTIC_LOCK_FAILED':
        case 'INVALID_CURRENCY':
        case 'PERMANENT_ERROR':
          // Business errors - ack (delete) message, don't retry
          this.logger.warn(`Business error for message ${messageId}: ${error.message}`);
          await this.deleteMessage(message);
          break;

        default:
          // Unknown domain error - treat as permanent
          this.logger.error(`Unknown domain error for message ${messageId}: ${error.message}`);
          await this.deleteMessage(message);
      }
    } else {
      // Unexpected error - treat as transient, let it retry
      this.logger.error(`Unexpected error for message ${messageId}`, error);
      // Don't delete - let it retry
    }
  }

  private handleShutdown(): void {
    this.logger.log('Received shutdown signal, stopping consumer...');
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async stopPolling(): Promise<void> {
    this.handleShutdown();
    this.logger.log('SQS consumer stopped');
  }
}