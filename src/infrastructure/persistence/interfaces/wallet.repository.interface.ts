import { Wallet } from '@/domain/entities/wallet.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { EntityManager } from 'typeorm';

export interface WalletRepositoryInterface {
  findById(id: string, manager?: EntityManager): Promise<Wallet | null>;
  findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
    manager?: EntityManager
  ): Promise<Wallet | null>;
  findByIdWithLock(
    id: string,
    manager: EntityManager,
    lockMode?: string
  ): Promise<Wallet | null>;
  findByPlayerIdAndCurrencyWithLock(
    playerId: string,
    currency: string,
    manager: EntityManager
  ): Promise<Wallet | null>;
  save(wallet: Wallet, manager?: EntityManager): Promise<Wallet>;
  createWithOpeningTransaction(
    playerId: string,
    currency: string,
    initialAmount: Money,
    manager: EntityManager
  ): Promise<Wallet>;
  exists(playerId: string, currency: string): Promise<boolean>;
}