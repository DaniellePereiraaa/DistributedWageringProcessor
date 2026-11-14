import { Injectable } from '@nestjs/common';
import { WalletRepository } from '@/infrastructure/persistence/typeorm/wallet.repository';
import { WagerTransactionRepository } from '@/infrastructure/persistence/typeorm/wager-transaction.repository';
import { LedgerEntryRepository } from '@/infrastructure/persistence/typeorm/ledger-entry.repository';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction, TransactionStatus } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { WalletNotFoundException } from '@/common/exceptions/domain.exceptions';

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
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: LedgerEntryRepository
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