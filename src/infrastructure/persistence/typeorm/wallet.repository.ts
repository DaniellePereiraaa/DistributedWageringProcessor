import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, QueryRunner } from 'typeorm';
import { Wallet } from '@/domain/entities/wallet.entity';
import { Money } from '@/common/value-objects/money.value-object';

// TypeORM LockMode type - using string literal that matches TypeORM's internal type
type LockMode = 'pessimistic_write' | 'pessimistic_read' | 'dirty_read' | 'pessimistic_partial_write' | 'pessimistic_write_or_fail' | 'for_no_key_update' | 'for_key_share';

@Injectable()
export class WalletRepository {
  constructor(
    @InjectRepository(Wallet)
    private readonly repository: Repository<Wallet>
  ) {}

  get manager(): EntityManager | undefined {
    return this.repository.manager;
  }

  /**
   * Finds wallet by ID.
   */
  async findById(id: string, manager?: EntityManager): Promise<Wallet | null> {
    const repo = manager ? manager.getRepository(Wallet) : this.repository;
    return repo.findOne({ where: { id } });
  }

  /**
   * Finds wallet by playerId and currency.
   */
  async findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
    manager?: EntityManager
  ): Promise<Wallet | null> {
    const repo = manager ? manager.getRepository(Wallet) : this.repository;
    return repo.findOne({ where: { playerId, currency: currency as any } });
  }

  /**
   * Finds wallet by ID with pessimistic lock for concurrent updates.
   * Unit of concurrency is walletId - prevents race conditions on same wallet.
   */
  async findByIdWithLock(
    id: string,
    manager: EntityManager,
    lockMode: LockMode = 'pessimistic_write'
  ): Promise<Wallet | null> {
    return manager
      .getRepository(Wallet)
      .createQueryBuilder('wallet')
      .setLock(lockMode)
      .where('wallet.id = :id', { id })
      .getOne();
  }

  /**
   * Finds wallet by playerId and currency with pessimistic lock.
   */
  async findByPlayerIdAndCurrencyWithLock(
    playerId: string,
    currency: string,
    manager: EntityManager
  ): Promise<Wallet | null> {
    return manager
      .getRepository(Wallet)
      .createQueryBuilder('wallet')
      .setLock('pessimistic_write')
      .where('wallet.playerId = :playerId', { playerId })
      .andWhere('wallet.currency = :currency', { currency })
      .getOne();
  }

  /**
   * Saves wallet (create or update).
   */
  async save(wallet: Wallet, manager?: EntityManager): Promise<Wallet> {
    const repo = manager ? manager.getRepository(Wallet) : this.repository;
    return repo.save(wallet);
  }

  /**
   * Creates a new wallet with initial OPENING transaction.
   * Must be called within a transaction.
   */
  async createWithOpeningTransaction(
    playerId: string,
    currency: string,
    initialAmount: Money,
    manager: EntityManager
  ): Promise<Wallet> {
    const wallet = Wallet.create(playerId, currency as any);
    wallet.credit(initialAmount);
    return manager.save(Wallet, wallet);
  }

  /**
   * Checks if wallet exists for playerId and currency.
   */
  async exists(playerId: string, currency: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { playerId, currency: currency as any },
    });
    return count > 0;
  }
}