import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { OutboxEvent } from '@/domain/entities/outbox-event.entity';
import { OutboxEventRepositoryInterface } from '../interfaces/outbox-event.repository.interface';

@Injectable()
export class OutboxEventRepository implements OutboxEventRepositoryInterface {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly repository: Repository<OutboxEvent>
  ) {}

  get manager(): EntityManager | undefined {
    return this.repository.manager;
  }

  /**
   * Gets unprocessed events for publishing.
   * Uses FOR UPDATE SKIP LOCKED for concurrent worker safety.
   */
  async getUnprocessedEvents(
    limit: number,
    manager: EntityManager
  ): Promise<OutboxEvent[]> {
    // TypeORM não suporta queryHint diretamente, usamos raw query para FOR UPDATE SKIP LOCKED
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
  async markAsProcessed(eventIds: string[], manager: EntityManager): Promise<void> {
    if (eventIds.length === 0) return;

    await manager
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ processedAt: new Date() })
      .whereInIds(eventIds)
      .execute();
  }

  /**
   * Records a publish failure for retry.
   */
  async recordFailure(eventId: string, error: string, manager: EntityManager): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({
        retryCount: () => 'retry_count + 1',
        lastError: error,
      })
      .where('id = :id', { id: eventId })
      .execute();
  }

  /**
   * Creates a new outbox event within a transaction.
   */
  async create(
    eventType: string,
    payload: Record<string, unknown>,
    aggregateId: string,
    aggregateType: string,
    correlationId?: string,
    causationId?: string,
    manager?: EntityManager
  ): Promise<OutboxEvent> {
    const repo = manager ? manager.getRepository(OutboxEvent) : this.repository;
    const event = OutboxEvent.create(
      eventType,
      payload,
      aggregateId,
      aggregateType,
      correlationId,
      causationId
    );
    return repo.save(event);
  }

  /**
   * Gets count of unprocessed events (for monitoring).
   */
  async getUnprocessedCount(): Promise<number> {
    return this.repository.count({ where: { processedAt: null as any } });
  }
}