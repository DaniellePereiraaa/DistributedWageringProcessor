import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { OutboxEvent } from '@/domain/entities/outbox-event.entity';

/**
 * Transactional Outbox Pattern Implementation
 *
 * Ensures events are published ONLY after the database transaction commits.
 * Events are stored in an outbox table within the same transaction as the domain changes.
 * A separate worker process reads from the outbox and publishes events to the message broker.
 */

export interface OutboxEventData {
  eventType: string;
  payload: Record<string, unknown>;
  aggregateId: string;
  aggregateType: string;
  correlationId?: string;
  causationId?: string;
}

export class TransactionalOutbox {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Adds an event to the outbox within the current transaction.
   * Must be called within an active QueryRunner/EntityManager transaction.
   */
  async addEvent(
    manager: EntityManager,
    eventData: OutboxEventData
  ): Promise<OutboxEvent> {
    const outboxEvent = new OutboxEvent();
    outboxEvent.eventType = eventData.eventType;
    outboxEvent.payload = eventData.payload;
    outboxEvent.aggregateId = eventData.aggregateId;
    outboxEvent.aggregateType = eventData.aggregateType;
    outboxEvent.correlationId = eventData.correlationId ?? null;
    outboxEvent.causationId = eventData.causationId ?? null;
    outboxEvent.createdAt = new Date();
    outboxEvent.processedAt = null;

    return manager.save(OutboxEvent, outboxEvent);
  }

  /**
   * Gets unprocessed events for publishing.
   * Uses FOR UPDATE SKIP LOCKED to prevent multiple workers processing the same events.
   */
  async getUnprocessedEvents(
    manager: EntityManager,
    limit: number = 100
  ): Promise<OutboxEvent[]> {
    // TypeORM não suporta queryHint diretamente, usamos raw query
    const query = `
      SELECT * FROM outbox_events
      WHERE processed_at IS NULL
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;
    return manager.query(query, [limit]);
  }

  /**
   * Marks events as processed after successful publishing.
   */
  async markAsProcessed(
    manager: EntityManager,
    eventIds: string[]
  ): Promise<void> {
    if (eventIds.length === 0) return;

    await manager
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ processedAt: new Date() })
      .whereInIds(eventIds)
      .execute();
  }

  /**
   * Executes a function within a transaction that automatically handles outbox events.
   * The callback receives an EntityManager that tracks outbox events.
   */
  async executeInTransaction<T>(
    callback: (manager: EntityManager, outbox: TransactionalOutbox) => Promise<T>
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await callback(queryRunner.manager, this);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

/**
 * Decorator to automatically add outbox events to the current transaction.
 * Usage: @AddToOutbox({ eventType: 'WalletCreated', aggregateType: 'Wallet' })
 */
export function AddToOutbox(eventData: Partial<OutboxEventData>) {
  return function (
    target: Object,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<any>
  ) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      // This would require integration with a transaction context
      // For now, manual usage via TransactionalOutbox.addEvent is preferred
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}