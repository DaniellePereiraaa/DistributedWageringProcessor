import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Inbox message for persistent idempotency (consumer-side deduplication).
 * Uses composite key: consumerName + messageId.
 * Same idempotency key with different payload = conflict (409).
 */
@Entity('inbox_messages')
@Unique(['consumerName', 'messageId'])
@Index(['idempotencyKey'])
@Index(['processedAt'])
export class InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  consumerName: string;

  @Column({ type: 'varchar', length: 255 })
  messageId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: string; // PENDING, PROCESSED, FAILED

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;

  /**
   * Creates a new inbox message for tracking.
   */
  static create(
    consumerName: string,
    messageId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): InboxMessage {
    const message = new InboxMessage();
    message.consumerName = consumerName;
    message.messageId = messageId;
    message.payload = payload;
    message.idempotencyKey = idempotencyKey || null;
    message.status = 'PENDING';
    return message;
  }

  /**
   * Marks message as successfully processed.
   */
  markProcessed(): void {
    this.status = 'PROCESSED';
    this.processedAt = new Date();
    this.errorMessage = null;
  }

  /**
   * Marks message as failed.
   */
  markFailed(error: string): void {
    this.status = 'FAILED';
    this.processedAt = new Date();
    this.errorMessage = error;
  }
}