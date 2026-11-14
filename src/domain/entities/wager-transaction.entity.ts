import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToOne,
} from 'typeorm';
import { Money } from '../../common/value-objects/money.value-object';
import { Wallet } from './wallet.entity';
import { LedgerEntry } from './ledger-entry.entity';

export enum TransactionKind {
  BET = 'BET',
  WIN = 'WIN',
  LOSS = 'LOSS',
  REFUND = 'REFUND',
  ROLLBACK = 'ROLLBACK',
  OPENING = 'OPENING',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  PENDING_REFERENCE = 'PENDING_REFERENCE',
  PROCESSED = 'PROCESSED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

/**
 * WagerTransaction represents a financial transaction on a wallet.
 * Terminal states (PROCESSED, REJECTED, FAILED) are immutable.
 * PENDING_REFERENCE is used for out-of-order REFUND/ROLLBACK processing.
 */
@Entity('wager_transactions')
@Index(['walletId', 'status'])
@Index(['idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
@Index(['referenceTransactionId'])
export class WagerTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: TransactionKind,
  })
  kind: TransactionKind;

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
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'uuid', nullable: true })
  referenceTransactionId: string | null;

  @OneToOne(() => WagerTransaction, { nullable: true })
  @JoinColumn({ name: 'referenceTransactionId' })
  referenceTransaction: WagerTransaction | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => LedgerEntry, (entry) => entry.transaction)
  ledgerEntry: LedgerEntry | null;

  /**
   * Creates a new transaction in PENDING state.
   */
  static create(
    walletId: string,
    kind: TransactionKind,
    amount: Money,
    idempotencyKey?: string,
    referenceTransactionId?: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): WagerTransaction {
    const tx = new WagerTransaction();
    tx.walletId = walletId;
    tx.kind = kind;
    tx.amount = amount;
    tx.status = TransactionStatus.PENDING;
    tx.idempotencyKey = idempotencyKey || null;
    tx.referenceTransactionId = referenceTransactionId || null;
    tx.description = description || null;
    tx.metadata = metadata || null;
    return tx;
  }

  /**
   * Checks if transaction is in a terminal state.
   */
  isTerminal(): boolean {
    return [
      TransactionStatus.PROCESSED,
      TransactionStatus.REJECTED,
      TransactionStatus.FAILED,
    ].includes(this.status);
  }

  /**
   * Checks if transaction can be processed (not terminal, not pending reference).
   */
  canProcess(): boolean {
    return this.status === TransactionStatus.PENDING;
  }

  /**
   * Checks if transaction is waiting for a reference.
   */
  isPendingReference(): boolean {
    return this.status === TransactionStatus.PENDING_REFERENCE;
  }

  /**
   * Marks transaction as pending reference (for out-of-order REFUND/ROLLBACK).
   */
  markPendingReference(): void {
    if (this.isTerminal()) {
      throw new Error('Cannot change status of terminal transaction');
    }
    this.status = TransactionStatus.PENDING_REFERENCE;
  }

  /**
   * Marks transaction as processed.
   */
  markProcessed(): void {
    if (this.isTerminal()) {
      throw new Error('Cannot change status of terminal transaction');
    }
    this.status = TransactionStatus.PROCESSED;
  }

  /**
   * Marks transaction as rejected.
   */
  markRejected(): void {
    if (this.isTerminal()) {
      throw new Error('Cannot change status of terminal transaction');
    }
    this.status = TransactionStatus.REJECTED;
  }

  /**
   * Marks transaction as failed.
   */
  markFailed(): void {
    if (this.isTerminal()) {
      throw new Error('Cannot change status of terminal transaction');
    }
    this.status = TransactionStatus.FAILED;
  }

  /**
   * Checks if this transaction requires a reference (REFUND, ROLLBACK).
   */
  requiresReference(): boolean {
    return this.kind === TransactionKind.REFUND || this.kind === TransactionKind.ROLLBACK;
  }

  /**
   * Checks if this is a credit transaction (WIN, REFUND, OPENING).
   */
  isCredit(): boolean {
    return [
      TransactionKind.WIN,
      TransactionKind.REFUND,
      TransactionKind.OPENING,
    ].includes(this.kind);
  }

  /**
   * Checks if this is a debit transaction (BET).
   */
  isDebit(): boolean {
    return this.kind === TransactionKind.BET;
  }

  /**
   * Checks if this is a no-ledger transaction (LOSS).
   */
  isNoLedger(): boolean {
    return this.kind === TransactionKind.LOSS;
  }
}