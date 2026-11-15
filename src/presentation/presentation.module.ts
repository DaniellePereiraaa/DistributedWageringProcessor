import { Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '@/application/use-cases/process-wager-transaction.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { ReconciliationUseCase } from '@/application/use-cases/reconciliation.use-case';
import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [WalletController],
  providers: [
    CreateWalletUseCase,
    ProcessWagerTransactionUseCase,
    GetWalletUseCase,
    ReconciliationUseCase,
  ],
  exports: [
    CreateWalletUseCase,
    ProcessWagerTransactionUseCase,
    GetWalletUseCase,
    ReconciliationUseCase,
  ],
})
export class PresentationModule {}