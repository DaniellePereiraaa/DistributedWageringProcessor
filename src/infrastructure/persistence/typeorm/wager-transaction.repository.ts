import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, FindOptionsWhere } from 'typeorm';
import { WagerTransaction, TransactionStatus, TransactionKind } from '@/domain/entities/wager-transaction.entity';
import { Money } from '@/common/value-objects/money.value-object';

@Injectable()
export class WagerTransactionRepository {
  constructor(
    @InjectRepository(WagerTransaction)
    private readonly repository: Repository<WagerTransaction>
  ) {}

  get manager(): EntityManager | undefined {
    return this.repository.manager;
  }

  /**
   * Finds transaction by ID.
   */
  async findById(id: string, manager?: EntityManager): Promise<WagerTransaction | null> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo.findOne({
      where: { id },
      relations: ['wallet', 'referenceTransaction', 'ledgerEntry'],
    });
  }

  /**
   * Finds transaction by idempotency key.
   */
  async findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager
  ): Promise<WagerTransaction | null> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo.findOne({ where: { idempotencyKey } });
  }

  /**
   * Finds transactions by wallet ID with pagination.
   */
  async findByWalletId(
    walletId: string,
    options: { limit?: number; offset?: number; status?: TransactionStatus } = {},
    manager?: EntityManager
  ): Promise<[WagerTransaction[], number]> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    const qb = repo.createQueryBuilder('tx').where('tx.walletId = :walletId', { walletId });

    if (options.status) {
      qb.andWhere('tx.status = :status', { status: options.status });
    }

    qb.orderBy('tx.createdAt', 'DESC');

    if (options.limit) {
      qb.limit(options.limit);
    }
    if (options.offset) {
      qb.offset(options.offset);
    }

    return qb.getManyAndCount();
  }

  /**
   * Finds pending reference transactions for a specific reference.
   * Used by retry worker to process REFUND/ROLLBACK when reference becomes available.
   */
  async findPendingReferenceByReferenceId(
    referenceTransactionId: string,
    manager?: EntityManager
  ): Promise<WagerTransaction[]> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo.find({
      where: {
        referenceTransactionId,
        status: TransactionStatus.PENDING_REFERENCE,
      },
      relations: ['wallet'],
    });
  }

  /**
   * Finds all pending reference transactions (for retry worker).
   */
  async findAllPendingReference(
    limit: number,
    manager?: EntityManager
  ): Promise<WagerTransaction[]> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo
      .createQueryBuilder('tx')
      .where('tx.status = :status', { status: TransactionStatus.PENDING_REFERENCE })
      .orderBy('tx.createdAt', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * Saves transaction (create or update).
   */
  async save(transaction: WagerTransaction, manager?: EntityManager): Promise<WagerTransaction> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo.save(transaction);
  }

  /**
   * Creates a new transaction.
   * Must be called within a transaction.
   */
  async create(
    walletId: string,
    kind: TransactionKind,
    amount: Money,
    idempotencyKey?: string,
    referenceTransactionId?: string,
    description?: string,
    metadata?: Record<string, unknown>,
    manager?: EntityManager
  ): Promise<WagerTransaction> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    const tx = WagerTransaction.create(
      walletId,
      kind,
      amount,
      idempotencyKey,
      referenceTransactionId,
      description,
      metadata
    );
    return repo.save(tx);
  }

  /**
   * Checks if idempotency key exists.
   */
  async existsByIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const count = await this.repository.count({ where: { idempotencyKey } });
    return count > 0;
  }
}