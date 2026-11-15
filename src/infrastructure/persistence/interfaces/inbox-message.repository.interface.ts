import { InboxMessage } from '@/domain/entities/inbox-message.entity';
import { EntityManager } from 'typeorm';

export interface InboxMessageRepositoryInterface {
  findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
    manager?: EntityManager
  ): Promise<InboxMessage | null>;
  findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager
  ): Promise<InboxMessage | null>;
  save(message: InboxMessage, manager?: EntityManager): Promise<InboxMessage>;
}