import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { Money } from '../../common/value-objects/money.value-object';
import { WagerTransaction } from './wager-transaction.entity';
import { LedgerEntry } from './ledger-entry.entity';

export enum Currency {
  BRL = 'BRL',
  USD = 'USD',
  EUR = 'EUR',
}

/**
 * Wallet aggregate root.
 * One wallet per playerId + currency combination.
 * Versioned for optimistic locking.
 */
@Entity('wallets')
@Unique(['playerId', 'currency'])
@Index(['playerId'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  playerId: string;

  @Column({
    type: 'enum',
    enum: Currency,
    default: Currency.BRL,
  })
  currency: Currency;

  @Column({
    type: 'decimal',
    precision: 19,
    scale: 2,
    default: '0.00',
    transformer: {
      to: (value: Money) => value.toString(),
      from: (value: string) => Money.fromString(value),
    },
  })
  balance: Money;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WagerTransaction, (tx) => tx.wallet)
  transactions: WagerTransaction[];

  @OneToMany(() => LedgerEntry, (entry) => entry.wallet)
  ledgerEntries: LedgerEntry[];

  /**
   * Creates a new wallet with zero balance.
   */
  static create(playerId: string, currency: Currency = Currency.BRL): Wallet {
    const wallet = new Wallet();
    wallet.playerId = playerId;
    wallet.currency = currency;
    wallet.balance = Money.zero();
    wallet.version = 0;
    return wallet;
  }

  /**
   * Applies a credit to the wallet balance.
   * Returns new balance.
   */
  credit(amount: Money): Money {
    this.balance = this.balance.add(amount);
    return this.balance;
  }

  /**
   * Applies a debit to the wallet balance.
   * Throws if insufficient funds.
   * Returns new balance.
   */
  debit(amount: Money): Money {
    if (this.balance.lessThan(amount)) {
      throw new Error(`Insufficient funds. Available: ${this.balance}, Required: ${amount}`);
    }
    this.balance = this.balance.subtract(amount);
    return this.balance;
  }

  /**
   * Checks if wallet has sufficient balance for amount.
   */
  hasSufficientBalance(amount: Money): boolean {
    return this.balance.greaterThanOrEqual(amount);
  }
}