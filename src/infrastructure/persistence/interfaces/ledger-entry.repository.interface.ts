import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { EntityManager } from 'typeorm';
import { Money } from '@/common/value-objects/money.value-object';

export interface LedgerEntryRepositoryInterface {
  save(entry: LedgerEntry, manager?: EntityManager): Promise<LedgerEntry>;
  findByWalletId(
    walletId: string,
    cursor?: string,
    limit?: number,
    manager?: EntityManager
  ): Promise<LedgerEntry[]>;
  findByWalletIdCursor(
    walletId: string,
    cursor?: string,
    limit?: number,
    manager?: EntityManager
  ): Promise<{ entries: LedgerEntry[]; nextCursor: string | null }>;
  findLastByWalletId(walletId: string, manager?: EntityManager): Promise<LedgerEntry | null>;
  calculateBalanceFromLedger(walletId: string, manager?: EntityManager): Promise<Money>;
  create(
    walletId: string,
    transactionId: string,
    entryType: any,
    amount: Money,
    balanceBefore: Money,
    balanceAfter: Money,
    manager?: EntityManager
  ): Promise<LedgerEntry>;
  getLastEntry(walletId: string, manager?: EntityManager): Promise<LedgerEntry | null>;
}