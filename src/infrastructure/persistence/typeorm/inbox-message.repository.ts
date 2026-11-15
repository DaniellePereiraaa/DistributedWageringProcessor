import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InboxMessage } from '@/domain/entities/inbox-message.entity';
import { InboxMessageRepositoryInterface } from '../interfaces/inbox-message.repository.interface';

@Injectable()
export class InboxMessageRepository implements InboxMessageRepositoryInterface {
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
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager
  ): Promise<InboxMessage | null> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    return repo.findOne({
      where: { idempotencyKey },
    });
  }

  /**
   * Saves inbox message (updates status).
   */
  async save(message: InboxMessage, manager?: EntityManager): Promise<InboxMessage> {
    const repo = manager ? manager.getRepository(InboxMessage) : this.repository;
    return repo.save(message);
  }
}