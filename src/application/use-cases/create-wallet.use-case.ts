import { Inject, Injectable } from '@nestjs/common';
import { WalletRepositoryInterface } from '@/infrastructure/persistence/interfaces/wallet.repository.interface';
import { WagerTransactionRepositoryInterface } from '@/infrastructure/persistence/interfaces/wager-transaction.repository.interface';
import { LedgerEntryRepositoryInterface } from '@/infrastructure/persistence/interfaces/ledger-entry.repository.interface';
import { OutboxEventRepositoryInterface } from '@/infrastructure/persistence/interfaces/outbox-event.repository.interface';
import { Wallet, Currency } from '@/domain/entities/wallet.entity';
import { WagerTransaction, TransactionKind, TransactionStatus } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry, LedgerEntryType } from '@/domain/entities/ledger-entry.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  WalletNotFoundException,
  InvalidCurrencyException,
} from '../../common/exceptions/domain.exceptions';
import { REPOSITORY_TOKENS } from '@/infrastructure/persistence/repository-tokens';

export interface CreateWalletCommand {
  playerId: string;
  currency: string;
  initialAmount: string; // String to avoid float issues
}

export interface CreateWalletResult {
  wallet: Wallet;
  openingTransaction: WagerTransaction;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(REPOSITORY_TOKENS.WALLET)
    private readonly walletRepository: WalletRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.WAGER_TRANSACTION)
    private readonly transactionRepository: WagerTransactionRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.LEDGER_ENTRY)
    private readonly ledgerRepository: LedgerEntryRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.OUTBOX_EVENT)
    private readonly outboxRepository: OutboxEventRepositoryInterface,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  async execute(command: CreateWalletCommand): Promise<CreateWalletResult> {
    // Validate currency
    const currency = this.validateCurrency(command.currency);

    // Validate and parse initial amount
    const initialAmount = Money.fromString(command.initialAmount);

    // Execute in single transaction using DataSource
    return this.dataSource.transaction(async (manager: EntityManager) => {
      return this.executeInTransaction(command, initialAmount, currency, manager);
    });
  }

  private async executeInTransaction(
    command: CreateWalletCommand,
    initialAmount: Money,
    currency: Currency,
    manager: EntityManager
  ): Promise<CreateWalletResult> {
    // Check if wallet already exists
    const existingWallet = await this.walletRepository.findByPlayerIdAndCurrencyWithLock(
      command.playerId,
      currency,
      manager
    );

    if (existingWallet) {
      throw new Error(`Wallet already exists for player ${command.playerId} with currency ${currency}`);
    }

    // Create wallet with initial balance
    const wallet = Wallet.create(command.playerId, currency);
    wallet.credit(initialAmount);
    const savedWallet = await this.walletRepository.save(wallet, manager);

    // Create OPENING transaction
    const openingTx = WagerTransaction.create(
      savedWallet.id,
      TransactionKind.OPENING,
      initialAmount,
      undefined, // No idempotency key for internal opening transaction
      undefined, // No reference
      `Initial wallet opening with ${initialAmount} ${currency}`,
      { initialAmount: initialAmount.toString() }
    );
    const savedOpeningTx = await this.transactionRepository.save(openingTx, manager);

    // Create ledger entry for opening
    await this.ledgerRepository.create(
      savedWallet.id,
      savedOpeningTx.id,
      LedgerEntryType.CREDIT,
      initialAmount,
      Money.zero(),
      initialAmount,
      manager
    );

    // Add outbox event for wallet creation
    await this.outboxRepository.create(
      'WalletCreated',
      {
        walletId: savedWallet.id,
        playerId: savedWallet.playerId,
        currency: savedWallet.currency,
        initialBalance: initialAmount.toString(),
      },
      savedWallet.id,
      'Wallet',
      savedOpeningTx.id,
      undefined,
      manager
    );

    // Add outbox event for balance change
    await this.outboxRepository.create(
      'WalletBalanceChanged',
      {
        walletId: savedWallet.id,
        playerId: savedWallet.playerId,
        currency: savedWallet.currency,
        balanceBefore: '0.00',
        balanceAfter: initialAmount.toString(),
        changeReason: 'OPENING',
        transactionId: savedOpeningTx.id,
      },
      savedWallet.id,
      'Wallet',
      savedOpeningTx.id,
      savedOpeningTx.id,
      manager
    );

    return {
      wallet: savedWallet,
      openingTransaction: savedOpeningTx,
    };
  }

  private validateCurrency(currency: string): Currency {
    const upperCurrency = currency.toUpperCase();
    if (!Object.values(Currency).includes(upperCurrency as Currency)) {
      throw new InvalidCurrencyException(currency);
    }
    return upperCurrency as Currency;
  }
}