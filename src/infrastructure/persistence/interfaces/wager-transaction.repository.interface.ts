import { WagerTransaction } from '@/domain/entities/wager-transaction.entity';
import { EntityManager } from 'typeorm';
import { TransactionStatus } from '@/domain/entities/wager-transaction.entity';

export interface WagerTransactionRepositoryInterface {
  findById(id: string, manager?: EntityManager): Promise<WagerTransaction | null>;
  findByWalletId(
    walletId: string,
    options: { limit?: number; offset?: number; status?: TransactionStatus },
    manager?: EntityManager
  ): Promise<[WagerTransaction[], number]>;
  findAllPendingReference(
    limit: number,
    manager: EntityManager
  ): Promise<WagerTransaction[]>;
  save(transaction: WagerTransaction, manager?: EntityManager): Promise<WagerTransaction>;
  findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager
  ): Promise<WagerTransaction | null>;
  findReferenceById(
    id: string,
    manager?: EntityManager
  ): Promise<WagerTransaction | null>;
}