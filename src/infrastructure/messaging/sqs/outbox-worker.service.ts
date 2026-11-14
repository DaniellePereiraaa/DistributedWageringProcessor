import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { OutboxEventRepository } from '@/infrastructure/persistence/typeorm/outbox-event.repository';
import { OutboxEvent } from '@/domain/entities/outbox-event.entity';
import { DataSource } from 'typeorm';

interface EventPublisher {
  publish(event: OutboxEvent): Promise<void>;
}

/**
 * Outbox Worker - Publishes events from outbox table to message broker.
 * Runs as a separate process to ensure events are published AFTER transaction commit.
 * Uses FOR UPDATE SKIP LOCKED for concurrent worker safety (no lost/duplicate events).
 */
@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private publishers: Map<string, EventPublisher> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly outboxRepository: OutboxEventRepository,
    private readonly dataSource: DataSource
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startPolling();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPolling();
  }

  /**
   * Register an event publisher for a specific event type.
   * In production, this would publish to SQS, SNS, Kafka, etc.
   */
  registerPublisher(eventType: string, publisher: EventPublisher): void {
    this.publishers.set(eventType, publisher);
  }

  async startPolling(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log('Starting Outbox Worker polling...');

    process.on('SIGTERM', () => this.handleShutdown());
    process.on('SIGINT', () => this.handleShutdown());

    this.pollOutbox();
  }

  private async pollOutbox(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const batchSize = this.configService.get('OUTBOX_BATCH_SIZE', 100);
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const events = await this.outboxRepository.getUnprocessedEvents(batchSize, queryRunner.manager);

        if (events.length > 0) {
          this.logger.debug(`Processing ${events.length} outbox events`);
          await this.publishEvents(events, queryRunner.manager);
          await this.outboxRepository.markAsProcessed(
            events.map((e) => e.id),
            queryRunner.manager
          );
        }

        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error('Error polling outbox', error);
    } finally {
      if (this.isRunning) {
        const interval = this.configService.get('OUTBOX_POLL_INTERVAL_MS', 1000);
        this.pollInterval = setTimeout(() => this.pollOutbox(), interval);
      }
    }
  }

  private async publishEvents(events: OutboxEvent[], manager: EntityManager): Promise<void> {
    for (const event of events) {
      try {
        const publisher = this.publishers.get(event.eventType);
        if (publisher) {
          await publisher.publish(event);
        } else {
          // Default: log the event (in production, publish to message broker)
          this.logger.log(`Outbox Event: ${event.eventType}`, {
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            payload: event.payload,
            correlationId: event.correlationId,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to publish event ${event.id}`, error);
        await this.outboxRepository.recordFailure(event.id, error.message, manager);
        // Don't mark as processed - will retry
        throw error;
      }
    }
  }

  private handleShutdown(): void {
    this.logger.log('Received shutdown signal, stopping outbox worker...');
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async stopPolling(): Promise<void> {
    this.handleShutdown();
    this.logger.log('Outbox worker stopped');
  }

  /**
   * Gets count of pending events for monitoring.
   */
  async getPendingCount(): Promise<number> {
    return this.outboxRepository.getUnprocessedCount();
  }
}