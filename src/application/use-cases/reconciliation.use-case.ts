import { Injectable } from '@nestjs/common';
import { WalletRepository } from '@/infrastructure/persistence/typeorm/wallet.repository';
import { LedgerEntryRepository } from '@/infrastructure/persistence/typeorm/ledger-entry.repository';
import { Wallet } from '@/domain/entities/wallet.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { WalletNotFoundException, ReconciliationMismatchException } from '@/common/exceptions/domain.exceptions';

export interface ReconciliationResult {
  walletId: string;
  storedBalance: string;
  calculatedBalance: string;
  matched: boolean;
  lastLedgerEntryDate?: string;
  discrepancy?: string;
}

@Injectable()
export class ReconciliationUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerEntryRepository
  ) {}

  async execute(walletId: string): Promise<ReconciliationResult> {
    const wallet = await this.walletRepository.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }

    // Calculate balance from ledger entries
    const calculatedBalance = await this.ledgerRepository.calculateBalanceFromLedger(walletId);
    const storedBalance = wallet.balance;

    const matched = storedBalance.equals(calculatedBalance);
    const discrepancy = matched ? undefined : storedBalance.subtract(calculatedBalance).toString();

    // Get last ledger entry date
    const lastEntry = await this.ledgerRepository.getLastEntry(walletId);

    const result: ReconciliationResult = {
      walletId,
      storedBalance: storedBalance.toString(),
      calculatedBalance: calculatedBalance.toString(),
      matched,
      lastLedgerEntryDate: lastEntry?.createdAt.toISOString(),
      discrepancy,
    };

    if (!matched) {
      throw new ReconciliationMismatchException(
        walletId,
        storedBalance.toString(),
        calculatedBalance.toString()
      );
    }

    return result;
  }
}