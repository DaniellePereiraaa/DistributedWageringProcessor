import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LedgerEntry, LedgerEntryType } from '@/domain/entities/ledger-entry.entity';
import { Money } from '@/common/value-objects/money.value-object';

@Injectable()
export class LedgerEntryRepository {
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
  async findByWalletIdCursor(
    walletId: string,
    cursor?: string,
    limit: number = 50,
    manager?: EntityManager
  ): Promise<{ entries: LedgerEntry[]; nextCursor: string | null }> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const qb = repo
      .createQueryBuilder('entry')
      .where('entry.walletId = :walletId', { walletId })
      .orderBy('entry.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      const cursorDate = new Date(cursor);
      qb.andWhere('entry.createdAt < :cursor', { cursor: cursorDate });
    }

    const entries = await qb.getMany();
    const hasMore = entries.length > limit;
    const result = hasMore ? entries.slice(0, limit) : entries;
    const nextCursor = hasMore ? result[result.length - 1].createdAt.toISOString() : null;

    return { entries: result, nextCursor };
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
    manager: EntityManager
  ): Promise<LedgerEntry> {
    const entry = LedgerEntry.create(
      walletId,
      transactionId,
      entryType,
      amount,
      balanceBefore,
      balanceAfter
    );
    return manager.save(LedgerEntry, entry);
  }

  /**
   * Calculates current balance from ledger entries.
   * Used for reconciliation.
   */
  async calculateBalanceFromLedger(walletId: string, manager?: EntityManager): Promise<Money> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    const result = await repo
      .createQueryBuilder('entry')
      .select('SUM(CASE WHEN entry.entryType = :credit THEN entry.amount ELSE -entry.amount END)', 'balance')
      .setParameter('credit', LedgerEntryType.CREDIT)
      .where('entry.walletId = :walletId', { walletId })
      .getRawOne();

    const balanceStr = result?.balance || '0.00';
    return Money.fromString(balanceStr);
  }

  /**
   * Gets last ledger entry for a wallet (for balance verification).
   */
  async getLastEntry(walletId: string, manager?: EntityManager): Promise<LedgerEntry | null> {
    const repo = manager ? manager.getRepository(LedgerEntry) : this.repository;
    return repo
      .createQueryBuilder('entry')
      .where('entry.walletId = :walletId', { walletId })
      .orderBy('entry.createdAt', 'DESC')
      .getOne();
  }
}