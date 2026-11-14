import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InboxMessage } from '@/domain/entities/inbox-message.entity';

@Injectable()
export class InboxMessageRepository {
  constructor(
    @InjectRepository(InboxMessage)
    private readonly repository: Repository<InboxMessage>
  ) {}

  get manager(): EntityManager | undefined {
    return this.repository.manager;
  }

  /**
   * Finds inbox message by consumer name and message ID.
   * This is the primary deduplication check.
   */
  async findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
    manager?: EntityManager
  ): Promise<InboxMessage | null> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    return repo.findOne({
      where: { consumerName, messageId },
    });
  }

  /**
   * Finds inbox message by idempotency key.
   * Used to detect idempotency key conflicts (same key, different payload).
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager
  ): Promise<InboxMessage | null> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    return repo.findOne({ where: { idempotencyKey } });
  }

  /**
   * Creates a new inbox message for tracking.
   * Must be called within the transaction.
   */
  async create(
    consumerName: string,
    messageId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
    manager?: EntityManager
  ): Promise<InboxMessage> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    const message = InboxMessage.create(consumerName, messageId, payload, idempotencyKey);
    return repo.save(message);
  }

  /**
   * Saves inbox message (updates status).
   */
  async save(message: InboxMessage, manager?: EntityManager): Promise<InboxMessage> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    return repo.save(message);
  }

  /**
   * Checks if message was already processed (idempotent consumer).
   */
  async isProcessed(consumerName: string, messageId: string): Promise<boolean> {
    const message = await this.findByConsumerAndMessageId(consumerName, messageId);
    return message?.status === 'PROCESSED';
  }
}