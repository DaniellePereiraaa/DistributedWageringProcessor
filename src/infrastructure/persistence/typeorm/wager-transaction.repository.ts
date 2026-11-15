import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, FindOptionsWhere } from 'typeorm';
import { WagerTransaction, TransactionStatus, TransactionKind } from '@/domain/entities/wager-transaction.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { WagerTransactionRepositoryInterface } from '../interfaces/wager-transaction.repository.interface';

@Injectable()
export class WagerTransactionRepository implements WagerTransactionRepositoryInterface {
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
      relations: ['wallet', 'ledgerEntry', 'referenceTransaction'],
    });
  }

  /**
   * Finds reference transaction by ID with only needed fields (no wallet to avoid circular loading).
   */
  async findReferenceById(id: string, manager?: EntityManager): Promise<WagerTransaction | null> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    return repo
      .createQueryBuilder('tx')
      .where('tx.id = :id', { id })
      .select([
        'tx.id',
        'tx.kind',
        'tx.amount',
        'tx.status',
        'tx.referenceTransactionId',
      ])
      .getOne();
  }

  /**
   * Finds transactions by wallet ID with pagination.
   */
  async findByWalletId(
    walletId: string,
    options: { limit?: number; offset?: number; status?: TransactionStatus },
    manager?: EntityManager
  ): Promise<[WagerTransaction[], number]> {
    const repo = manager ? manager.getRepository(WagerTransaction) : this.repository;
    const qb = repo.createQueryBuilder('tx').where('tx.walletId = :walletId', { walletId });

    if (options.status) {
      qb.andWhere('tx.status = :status', { status: options.status });
    }

    qb.orderBy('tx.createdAt', 'DESC');

    if (options.offset) {
      qb.skip(options.offset);
    }

    if (options.limit) {
      qb.take(options.limit);
    }

    return qb.getManyAndCount();
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
}