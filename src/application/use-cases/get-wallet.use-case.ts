import { Inject, Injectable } from '@nestjs/common';
import { WalletRepositoryInterface } from '@/infrastructure/persistence/interfaces/wallet.repository.interface';
import { WagerTransactionRepositoryInterface } from '@/infrastructure/persistence/interfaces/wager-transaction.repository.interface';
import { LedgerEntryRepositoryInterface } from '@/infrastructure/persistence/interfaces/ledger-entry.repository.interface';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction, TransactionStatus } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { WalletNotFoundException } from '@/common/exceptions/domain.exceptions';
import { REPOSITORY_TOKENS } from '@/infrastructure/persistence/repository-tokens';

export interface GetWalletResult {
  wallet: Wallet;
}

export interface GetWalletLedgerResult {
  entries: LedgerEntry[];
  nextCursor: string | null;
}

export interface GetWalletTransactionsResult {
  transactions: WagerTransaction[];
  total: number;
}

@Injectable()
export class GetWalletUseCase {
  constructor(
    @Inject(REPOSITORY_TOKENS.WALLET)
    private readonly walletRepository: WalletRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.WAGER_TRANSACTION)
    private readonly transactionRepository: WagerTransactionRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.LEDGER_ENTRY)
    private readonly ledgerRepository: LedgerEntryRepositoryInterface
  ) {}

  async getWallet(walletId: string): Promise<GetWalletResult> {
    const wallet = await this.walletRepository.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }
    return { wallet };
  }

  async getWalletByPlayerIdAndCurrency(playerId: string, currency: string): Promise<GetWalletResult> {
    const wallet = await this.walletRepository.findByPlayerIdAndCurrency(playerId, currency);
    if (!wallet) {
      throw new WalletNotFoundException(`${playerId}:${currency}`);
    }
    return { wallet };
  }

  async getWalletTransactions(
    walletId: string,
    options: { limit?: number; offset?: number; status?: TransactionStatus } = {}
  ): Promise<GetWalletTransactionsResult> {
    const wallet = await this.walletRepository.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }

    const [transactions, total] = await this.transactionRepository.findByWalletId(walletId, options);
    return { transactions, total };
  }

  async getWalletLedger(
    walletId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<GetWalletLedgerResult> {
    const wallet = await this.walletRepository.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }

    return this.ledgerRepository.findByWalletIdCursor(walletId, cursor, limit);
  }
}