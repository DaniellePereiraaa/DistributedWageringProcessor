import { OutboxEvent } from '@/domain/entities/outbox-event.entity';
import { EntityManager } from 'typeorm';

export interface OutboxEventRepositoryInterface {
  getUnprocessedEvents(limit: number, manager: EntityManager): Promise<OutboxEvent[]>;
  markAsProcessed(eventIds: string[], manager: EntityManager): Promise<void>;
  recordFailure(eventId: string, error: string, manager: EntityManager): Promise<void>;
  create(
    eventType: string,
    payload: Record<string, unknown>,
    aggregateId: string,
    aggregateType: string,
    correlationId?: string,
    causationId?: string,
    manager?: EntityManager
  ): Promise<OutboxEvent>;
  getUnprocessedCount(): Promise<number>;
}