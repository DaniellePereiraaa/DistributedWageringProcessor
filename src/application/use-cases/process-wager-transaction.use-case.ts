import { Injectable } from '@nestjs/common';
import { WalletRepository } from '@/infrastructure/persistence/typeorm/wallet.repository';
import { WagerTransactionRepository } from '@/infrastructure/persistence/typeorm/wager-transaction.repository';
import { LedgerEntryRepository } from '@/infrastructure/persistence/typeorm/ledger-entry.repository';
import { OutboxEventRepository } from '@/infrastructure/persistence/typeorm/outbox-event.repository';
import { InboxMessageRepository } from '@/infrastructure/persistence/typeorm/inbox-message.repository';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction, TransactionKind, TransactionStatus } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry, LedgerEntryType } from '@/domain/entities/ledger-entry.entity';
import { InboxMessage } from '@/domain/entities/inbox-message.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  WalletNotFoundException,
  InsufficientFundsException,
  IdempotencyConflictException,
  ReferencedTransactionNotFoundException,
  ReferencedTransactionNotProcessedException,
  InvalidTransactionStateException,
  OptimisticLockException,
} from '../../common/exceptions/domain.exceptions';

export interface ProcessWagerTransactionCommand {
  walletId: string;
  kind: TransactionKind;
  amount: string; // String to avoid float issues
  idempotencyKey: string;
  referenceTransactionId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  consumerName: string;
  messageId: string;
}

export interface ProcessWagerTransactionResult {
  transaction: WagerTransaction;
  wallet: Wallet;
  isDuplicate: boolean;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: LedgerEntryRepository,
    private readonly outboxRepository: OutboxEventRepository,
    private readonly inboxRepository: InboxMessageRepository,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async execute(command: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    const amount = Money.fromString(command.amount);

    // Check inbox for duplicate message (consumer-side deduplication)
    const existingInbox = await this.inboxRepository.findByConsumerAndMessageId(
      command.consumerName,
      command.messageId
    );

    if (existingInbox) {
      if (existingInbox.status === 'PROCESSED') {
        // Already processed - return existing transaction
        const existingTx = await this.transactionRepository.findByIdempotencyKey(
          command.idempotencyKey
        );
        if (existingTx) {
          const wallet = await this.walletRepository.findById(existingTx.walletId);
          return {
            transaction: existingTx,
            wallet: wallet!,
            isDuplicate: true,
          };
        }
      } else if (existingInbox.status === 'FAILED') {
        // Previously failed - allow retry
      }
    }

    // Check idempotency key conflict (same key, different payload)
    const existingByIdempotency = await this.inboxRepository.findByIdempotencyKey(command.idempotencyKey);
    if (existingByIdempotency && existingByIdempotency.messageId !== command.messageId) {
      throw new IdempotencyConflictException(command.idempotencyKey, existingByIdempotency.messageId);
    }

    // Execute in single transaction using DataSource
    return this.dataSource.transaction(async (manager: EntityManager) => {
      return this.executeInTransaction(command, amount, manager);
    });
  }

  private async executeInTransaction(
    command: ProcessWagerTransactionCommand,
    amount: Money,
    manager: EntityManager
  ): Promise<ProcessWagerTransactionResult> {
    // Lock wallet for update (pessimistic locking - unit of concurrency is walletId)
    const wallet = await this.walletRepository.findByIdWithLock(command.walletId, manager);
    if (!wallet) {
      throw new WalletNotFoundException(command.walletId);
    }

    // Check idempotency key at transaction level too
    const existingTx = await this.transactionRepository.findByIdempotencyKey(command.idempotencyKey, manager);
    if (existingTx) {
      // Mark inbox as processed if not already
      const inboxMsg = await this.inboxRepository.findByConsumerAndMessageId(
        command.consumerName,
        command.messageId,
        manager
      );
      if (inboxMsg && inboxMsg.status !== 'PROCESSED') {
        inboxMsg.markProcessed();
        await this.inboxRepository.save(inboxMsg, manager);
      }
      return {
        transaction: existingTx,
        wallet,
        isDuplicate: true,
      };
    }

    // Create transaction record
    const tx = WagerTransaction.create(
      wallet.id,
      command.kind,
      amount,
      command.idempotencyKey,
      command.referenceTransactionId,
      command.description,
      command.metadata
    );

    // Handle reference transaction validation for REFUND/ROLLBACK
    let referenceTx: WagerTransaction | null = null;
    if (command.referenceTransactionId) {
      referenceTx = await this.transactionRepository.findById(command.referenceTransactionId, manager);
      if (!referenceTx) {
        tx.markRejected();
        await this.transactionRepository.save(tx, manager);
        await this.createInboxRecord(command, manager);
        throw new ReferencedTransactionNotFoundException(command.referenceTransactionId);
      }

      // Check if reference is processed
      if (referenceTx.status !== TransactionStatus.PROCESSED) {
        // Mark as pending reference - will be retried by retry worker
        tx.markPendingReference();
        await this.transactionRepository.save(tx, manager);
        await this.createInboxRecord(command, manager);
        throw new ReferencedTransactionNotProcessedException(
          command.referenceTransactionId,
          referenceTx.status
        );
      }

      // Validate reference compatibility
      this.validateReference(tx, referenceTx);
    }

    // Process transaction based on kind
    let balanceBefore = wallet.balance;
    let balanceAfter: Money;
    let ledgerEntryType: LedgerEntryType | null = null;

    switch (command.kind) {
      case TransactionKind.BET:
        // Debit
        if (!wallet.hasSufficientBalance(amount)) {
          tx.markRejected();
          await this.transactionRepository.save(tx, manager);
          await this.createInboxRecord(command, manager);
          throw new InsufficientFundsException(wallet.balance.toString(), amount.toString());
        }
        balanceAfter = wallet.debit(amount);
        ledgerEntryType = LedgerEntryType.DEBIT;
        break;

      case TransactionKind.WIN:
      case TransactionKind.REFUND:
      case TransactionKind.OPENING:
        // Credit
        balanceAfter = wallet.credit(amount);
        ledgerEntryType = LedgerEntryType.CREDIT;
        break;

      case TransactionKind.LOSS:
        // No balance change, no ledger entry
        balanceAfter = wallet.balance;
        tx.markProcessed();
        await this.transactionRepository.save(tx, manager);
        await this.createInboxRecord(command, manager);
        await this.publishEvents(tx, wallet, balanceBefore, balanceAfter, manager);
        return { transaction: tx, wallet, isDuplicate: false };

      case TransactionKind.ROLLBACK:
        // Inverse of REFUND - debit the refund amount
        if (!wallet.hasSufficientBalance(amount)) {
          tx.markRejected();
          await this.transactionRepository.save(tx, manager);
          await this.createInboxRecord(command, manager);
          throw new InsufficientFundsException(wallet.balance.toString(), amount.toString());
        }
        balanceAfter = wallet.debit(amount);
        ledgerEntryType = LedgerEntryType.DEBIT;
        break;
    }

    // Save wallet with updated balance
    await this.walletRepository.save(wallet, manager);

    // Mark transaction as processed
    tx.markProcessed();
    await this.transactionRepository.save(tx, manager);

    // Create ledger entry (if applicable)
    if (ledgerEntryType) {
      await this.ledgerRepository.create(
        wallet.id,
        tx.id,
        ledgerEntryType,
        amount,
        balanceBefore,
        balanceAfter,
        manager
      );
    }

    // Create inbox record for idempotency
    await this.createInboxRecord(command, manager);

    // Publish outbox events
    await this.publishEvents(tx, wallet, balanceBefore, balanceAfter, manager);

    return { transaction: tx, wallet, isDuplicate: false };
  }

  private validateReference(tx: WagerTransaction, referenceTx: WagerTransaction): void {
    // REFUND references BET
    if (tx.kind === TransactionKind.REFUND) {
      if (referenceTx.kind !== TransactionKind.BET) {
        throw new Error('REFUND can only reference BET transactions');
      }
      // Refund amount should not exceed original bet amount
      if (tx.amount.greaterThan(referenceTx.amount)) {
        throw new Error('Refund amount cannot exceed original bet amount');
      }
    }

    // ROLLBACK references REFUND
    if (tx.kind === TransactionKind.ROLLBACK) {
      if (referenceTx.kind !== TransactionKind.REFUND) {
        throw new Error('ROLLBACK can only reference REFUND transactions');
      }
      // Rollback amount should match refund amount
      if (!tx.amount.equals(referenceTx.amount)) {
        throw new Error('Rollback amount must match refund amount');
      }
    }
  }

  private async createInboxRecord(
    command: ProcessWagerTransactionCommand,
    manager: EntityManager
  ): Promise<void> {
    const inboxMsg = InboxMessage.create(
      command.consumerName,
      command.messageId,
      {
        walletId: command.walletId,
        kind: command.kind,
        amount: command.amount,
        idempotencyKey: command.idempotencyKey,
        referenceTransactionId: command.referenceTransactionId ?? undefined,
        description: command.description ?? undefined,
        metadata: command.metadata ?? undefined,
      },
      command.idempotencyKey
    );
    inboxMsg.markProcessed();
    await this.inboxRepository.save(inboxMsg, manager);
  }

  private async publishEvents(
    tx: WagerTransaction,
    wallet: Wallet,
    balanceBefore: Money,
    balanceAfter: Money,
    manager: EntityManager
  ): Promise<void> {
    const correlationId = tx.id;
    const causationId = tx.id;

    // WagerTransactionProcessed event
    await this.outboxRepository.create(
      'WagerTransactionProcessed',
      {
        transactionId: tx.id,
        walletId: wallet.id,
        playerId: wallet.playerId,
        kind: tx.kind,
        amount: tx.amount.toString(),
        status: tx.status,
        referenceTransactionId: tx.referenceTransactionId,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        timestamp: new Date().toISOString(),
      },
      tx.id,
      'WagerTransaction',
      correlationId,
      causationId,
      manager
    );

    // WalletBalanceChanged event (only if balance actually changed)
    if (!balanceBefore.equals(balanceAfter)) {
      await this.outboxRepository.create(
        'WalletBalanceChanged',
        {
          walletId: wallet.id,
          playerId: wallet.playerId,
          currency: wallet.currency,
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
          changeReason: tx.kind,
          transactionId: tx.id,
        },
        wallet.id,
        'Wallet',
        correlationId,
        causationId,
        manager
      );
    }
  }
}