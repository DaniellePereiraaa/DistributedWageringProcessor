import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToOne,
} from 'typeorm';
import { Money } from '../../common/value-objects/money.value-object';
import { Wallet } from './wallet.entity';
import { WagerTransaction } from './wager-transaction.entity';

export enum LedgerEntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Immutable ledger entry capturing balance before/after each transaction.
 * One entry per wallet per transaction (except LOSS which has no ledger entry).
 * Provides full audit trail for reconciliation.
 */
@Entity('ledger_entries')
@Index(['walletId', 'createdAt'])
@Index(['transactionId'], { unique: true })
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.ledgerEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'uuid', unique: true })
  transactionId: string;

  @OneToOne(() => WagerTransaction, (tx) => tx.ledgerEntry)
  @JoinColumn({ name: 'transaction_id' })
  transaction: WagerTransaction;

  @Column({
    type: 'enum',
    enum: LedgerEntryType,
  })
  entryType: LedgerEntryType;

  @Column({
    type: 'decimal',
    precision: 19,
    scale: 2,
    transformer: {
      to: (value: Money) => value.toString(),
      from: (value: string) => Money.fromString(value),
    },
  })
  amount: Money;

  @Column({
    type: 'decimal',
    precision: 19,
    scale: 2,
    transformer: {
      to: (value: Money) => value.toString(),
      from: (value: string) => Money.fromString(value),
    },
  })
  balanceBefore: Money;

  @Column({
    type: 'decimal',
    precision: 19,
    scale: 2,
    transformer: {
      to: (value: Money) => value.toString(),
      from: (value: string) => Money.fromString(value),
    },
  })
  balanceAfter: Money;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Creates a new ledger entry.
   * Immutable after creation.
   */
  static create(
    walletId: string,
    transactionId: string,
    entryType: LedgerEntryType,
    amount: Money,
    balanceBefore: Money,
    balanceAfter: Money
  ): LedgerEntry {
    const entry = new LedgerEntry();
    entry.walletId = walletId;
    entry.transactionId = transactionId;
    entry.entryType = entryType;
    entry.amount = amount;
    entry.balanceBefore = balanceBefore;
    entry.balanceAfter = balanceAfter;
    return entry;
  }
}