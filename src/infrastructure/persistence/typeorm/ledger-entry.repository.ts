import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LedgerEntry, LedgerEntryType } from '@/domain/entities/ledger-entry.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { LedgerEntryRepositoryInterface } from '../interfaces/ledger-entry.repository.interface';

@Injectable()
export class LedgerEntryRepository implements LedgerEntryRepositoryInterface {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly repository: Repository<LedgerEntry>
  ) {}

  get manager(): EntityManager | undefined {
    return this.repository.manager;
  }

  /**
   * Finds ledger entry by transaction ID.
   */
  async findByTransactionId(
    transactionId: string,
    manager?: EntityManager
  ): Promise<LedgerEntry | null> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    return repo.findOne({ where: { transactionId } });
  }

  /**
   * Finds ledger entries by wallet ID with cursor pagination.
   */
  async findByWalletId(
    walletId: string,
    cursor?: string,
    limit?: number,
    manager?: EntityManager
  ): Promise<LedgerEntry[]> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const qb = repo
      .createQueryBuilder('entry')
      .where('entry.walletId = :walletId', { walletId })
      .orderBy('entry.createdAt', 'DESC')
      .limit((limit ?? 50) + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      qb.andWhere('entry.createdAt < :cursor', { cursor: cursorDate });
    }

    const entries = await qb.getMany();
    const hasMore = entries.length > (limit ?? 50);
    return hasMore ? entries.slice(0, limit ?? 50) : entries;
  }

  /**
   * Finds ledger entries by wallet ID with cursor pagination (returns cursor).
   */
  async findByWalletIdCursor(
    walletId: string,
    cursor?: string,
    limit?: number,
    manager?: EntityManager
  ): Promise<{ entries: LedgerEntry[]; nextCursor: string | null }> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const effectiveLimit = (limit ?? 50) + 1;
    const qb = repo
      .createQueryBuilder('entry')
      .where('entry.walletId = :walletId', { walletId })
      .orderBy('entry.createdAt', 'DESC')
      .limit(effectiveLimit);

    if (cursor) {
      const cursorDate = new Date(cursor);
      qb.andWhere('entry.createdAt < :cursor', { cursor: cursorDate });
    }

    const entries = await qb.getMany();
    const hasMore = entries.length > (limit ?? 50);
    const resultEntries = hasMore ? entries.slice(0, limit ?? 50) : entries;
    const nextCursor = hasMore ? resultEntries[resultEntries.length - 1].createdAt.toISOString() : null;

    return { entries: resultEntries, nextCursor };
  }

  /**
   * Creates a new ledger entry.
   * Must be called within the same transaction as wallet balance update.
   */
  async create(
    walletId: string,
    transactionId: string,
    entryType: LedgerEntryType,
    amount: Money,
    balanceBefore: Money,
    balanceAfter: Money,
    manager?: EntityManager
  ): Promise<LedgerEntry> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const entry = LedgerEntry.create(
      walletId,
      transactionId,
      entryType,
      amount,
      balanceBefore,
      balanceAfter
    );
    return repo.save(entry);
  }

  /**
   * Saves an existing ledger entry (create or update).
   */
  async save(entry: LedgerEntry, manager?: EntityManager): Promise<LedgerEntry> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    return repo.save(entry);
  }

  /**
   * Gets last ledger entry for a wallet (for balance verification).
   */
  async findLastByWalletId(walletId: string, manager?: EntityManager): Promise<LedgerEntry | null> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    return repo
      .createQueryBuilder('entry')
      .where('entry.walletId = :walletId', { walletId })
      .orderBy('entry.createdAt', 'DESC')
      .getOne();
  }

  /**
   * Calculates balance from ledger entries (for reconciliation).
   */
  async calculateBalanceFromLedger(walletId: string, manager?: EntityManager): Promise<Money> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const result = await repo
      .createQueryBuilder('entry')
      .select('SUM(CASE WHEN entry.entryType = :credit THEN entry.amountCents ELSE -entry.amountCents END)', 'total')
      .where('entry.walletId = :walletId', { walletId })
      .setParameter('credit', LedgerEntryType.CREDIT)
      .getRawOne();

    const totalCents = result?.total ? parseInt(result.total, 10) : 0;
    return Money.fromCents(totalCents);
  }

  /**
   * Gets last ledger entry for a wallet.
   */
  async getLastEntry(walletId: string, manager?: EntityManager): Promise<LedgerEntry | null> {
    return this.findLastByWalletId(walletId, manager);
  }
}