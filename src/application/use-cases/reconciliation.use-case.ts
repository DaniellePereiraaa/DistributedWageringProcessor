import { Inject, Injectable } from '@nestjs/common';
import { WalletRepositoryInterface } from '@/infrastructure/persistence/interfaces/wallet.repository.interface';
import { LedgerEntryRepositoryInterface } from '@/infrastructure/persistence/interfaces/ledger-entry.repository.interface';
import { Wallet } from '@/domain/entities/wallet.entity';
import { Money } from '@/common/value-objects/money.value-object';
import { WalletNotFoundException, ReconciliationMismatchException } from '@/common/exceptions/domain.exceptions';
import { REPOSITORY_TOKENS } from '@/infrastructure/persistence/repository-tokens';

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
    @Inject(REPOSITORY_TOKENS.WALLET)
    private readonly walletRepository: WalletRepositoryInterface,
    @Inject(REPOSITORY_TOKENS.LEDGER_ENTRY)
    private readonly ledgerRepository: LedgerEntryRepositoryInterface
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