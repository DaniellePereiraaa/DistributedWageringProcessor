import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { WagerTransactionRepository } from '@/infrastructure/persistence/typeorm/wager-transaction.repository';
import { ProcessWagerTransactionUseCase, ProcessWagerTransactionCommand } from '@/application/use-cases/process-wager-transaction.use-case';
import { WagerTransaction, TransactionStatus, TransactionKind } from '@/domain/entities/wager-transaction.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class RetryWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetryWorkerService.name);
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly processTransactionUseCase: ProcessWagerTransactionUseCase,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPolling();
  }

  async startPolling(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Starting Retry Worker polling...');

    process.on('SIGTERM', () => this.handleShutdown());
    process.on('SIGINT', () => this.handleShutdown());

    this.pollPendingReferences();
  }

  private async pollPendingReferences(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.configService.get('RETRY_WORKER_BATCH_SIZE', 50);
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const pendingTransactions = await this.transactionRepository.findAllPendingReference(
          batchSize,
          queryRunner.manager
        );

        if (pendingTransactions.length > 0) {
          this.logger.debug(`Retrying ${pendingTransactions.length} pending reference transactions`);
          await this.retryTransactions(pendingTransactions, queryRunner.manager);
        }

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error('Error in retry worker', error);
    } finally {
      if (this.isRunning) {
        const interval = this.configService.get('RETRY_WORKER_INTERVAL_MS', 30000);
        this.pollInterval = setTimeout(() => this.pollPendingReferences(), interval);
      }
    }
  }

  private async retryTransactions(
    transactions: WagerTransaction[],
    manager: EntityManager
  ): Promise<void> {
    for (const tx of transactions) {
      try {
        // Check if reference transaction is now processed
        if (!tx.referenceTransactionId) {
          this.logger.warn(`Transaction ${tx.id} has no reference, marking as failed`);
          tx.markFailed();
          await this.transactionRepository.save(tx, manager);
          continue;
        }

        const referenceTx = await this.transactionRepository.findById(
          tx.referenceTransactionId,
          manager
        );

        if (!referenceTx) {
          this.logger.warn(`Reference ${tx.referenceTransactionId} not found for transaction ${tx.id}`);
          // Keep as pending reference - might be created later
          continue;
        }

        if (referenceTx.status !== TransactionStatus.PROCESSED) {
          // Reference still not processed - keep pending
          this.logger.debug(`Reference ${tx.referenceTransactionId} still ${referenceTx.status} for transaction ${tx.id}`);
          continue;
        }

        // Reference is now processed - retry the transaction
        this.logger.log(`Retrying transaction ${tx.id} (reference ${tx.referenceTransactionId} is now processed)`);

        // Create a command to reprocess
        const command: ProcessWagerTransactionCommand = {
          walletId: tx.walletId,
          kind: tx.kind,
          amount: tx.amount.toString(),
          idempotencyKey: tx.idempotencyKey || `retry-${tx.id}`,
          referenceTransactionId: tx.referenceTransactionId,
          description: tx.description ?? undefined,
          metadata: tx.metadata ?? undefined,
          consumerName: 'retry-worker',
          messageId: `retry-${tx.id}-${Date.now()}`,
        };

        await this.processTransactionUseCase.execute(command);
      } catch (error) {
        this.logger.error(`Failed to retry transaction ${tx.id}`, error);
        // Keep as pending reference for next retry cycle
        // Don't mark as failed unless permanent error
        if (error instanceof Error && error.message.includes('PERMANENT')) {
          tx.markFailed();
          await this.transactionRepository.save(tx, manager);
        }
      }
    }
  }

  private handleShutdown(): void {
    this.logger.log('Received shutdown signal, stopping retry worker...');
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async stopPolling(): Promise<void> {
    this.handleShutdown();
    this.logger.log('Retry worker stopped');
  }
}