import { Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { HealthController } from './controllers/health.controller';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '@/application/use-cases/process-wager-transaction.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { ReconciliationUseCase } from '@/application/use-cases/reconciliation.use-case';
import { WalletRepository } from '@/infrastructure/persistence/typeorm/wallet.repository';
import { WagerTransactionRepository } from '@/infrastructure/persistence/typeorm/wager-transaction.repository';
import { LedgerEntryRepository } from '@/infrastructure/persistence/typeorm/ledger-entry.repository';
import { OutboxEventRepository } from '@/infrastructure/persistence/typeorm/outbox-event.repository';
import { InboxMessageRepository } from '@/infrastructure/persistence/typeorm/inbox-message.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '@/domain/entities/outbox-event.entity';
import { InboxMessage } from '@/domain/entities/inbox-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WagerTransaction,
      LedgerEntry,
      OutboxEvent,
      InboxMessage,
    ]),
  ],
  controllers: [WalletController, HealthController],
  providers: [
    CreateWalletUseCase,
    ProcessWagerTransactionUseCase,
    GetWalletUseCase,
    ReconciliationUseCase,
    WalletRepository,
    WagerTransactionRepository,
    LedgerEntryRepository,
    OutboxEventRepository,
    InboxMessageRepository,
  ],
  exports: [
    CreateWalletUseCase,
    ProcessWagerTransactionUseCase,
    GetWalletUseCase,
    ReconciliationUseCase,
  ],
})
export class PresentationModule {}