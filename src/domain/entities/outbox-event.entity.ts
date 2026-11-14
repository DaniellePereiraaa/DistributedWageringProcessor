import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Outbox event for transactional event publishing.
 * Events are written to outbox within the same transaction as domain changes.
 * A separate worker publishes events to message broker AFTER commit.
 * Uses FOR UPDATE SKIP LOCKED for concurrent worker safety.
 */
@Entity('outbox_events')
@Index(['processedAt'])
@Index(['aggregateId', 'aggregateType'])
@Index(['eventType'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ type: 'varchar', length: 100 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  correlationId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  causationId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  /**
   * Creates a new outbox event.
   */
  static create(
    eventType: string,
    payload: Record<string, unknown>,
    aggregateId: string,
    aggregateType: string,
    correlationId?: string,
    causationId?: string
  ): OutboxEvent {
    const event = new OutboxEvent();
    event.eventType = eventType;
    event.payload = payload;
    event.aggregateId = aggregateId;
    event.aggregateType = aggregateType;
    event.correlationId = correlationId || null;
    event.causationId = causationId || null;
    event.retryCount = 0;
    event.lastError = null;
    return event;
  }

  /**
   * Marks event as successfully published.
   */
  markProcessed(): void {
    this.processedAt = new Date();
    this.lastError = null;
  }

  /**
   * Records a publish failure for retry.
   */
  recordFailure(error: string): void {
    this.retryCount += 1;
    this.lastError = error;
  }
}