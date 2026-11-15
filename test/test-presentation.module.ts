import { Module } from '@nestjs/common';
import { WalletController } from '../src/presentation/controllers/wallet.controller';
import { CreateWalletUseCase } from '../src/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../src/application/use-cases/process-wager-transaction.use-case';
import { GetWalletUseCase } from '../src/application/use-cases/get-wallet.use-case';
import { ReconciliationUseCase } from '../src/application/use-cases/reconciliation.use-case';
import { TestPersistenceModule } from './test-persistence.module';

@Module({
  imports: [TestPersistenceModule],
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
export class TestPresentationModule {}