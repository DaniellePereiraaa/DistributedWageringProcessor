import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { WalletRepository } from '../src/infrastructure/persistence/typeorm/wallet.repository';
import { WagerTransactionRepository } from '../src/infrastructure/persistence/typeorm/wager-transaction.repository';
import { LedgerEntryRepository } from '../src/infrastructure/persistence/typeorm/ledger-entry.repository';
import { OutboxEventRepository } from '../src/infrastructure/persistence/typeorm/outbox-event.repository';
import { InboxMessageRepository } from '../src/infrastructure/persistence/typeorm/inbox-message.repository';
import { ProcessWagerTransactionUseCase } from '../src/application/use-cases/process-wager-transaction.use-case';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction } from '../src/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '../src/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '../src/domain/entities/outbox-event.entity';
import { InboxMessage } from '../src/domain/entities/inbox-message.entity';
import {
  WalletRepositoryInterface,
  WagerTransactionRepositoryInterface,
  LedgerEntryRepositoryInterface,
  OutboxEventRepositoryInterface,
  InboxMessageRepositoryInterface,
} from '../src/infrastructure/persistence/interfaces';
import { REPOSITORY_TOKENS } from '../src/infrastructure/persistence/repository-tokens';

const entities = [
  Wallet,
  WagerTransaction,
  LedgerEntry,
  OutboxEvent,
  InboxMessage,
];

@Module({
  imports: [
    TypeOrmModule.forFeature(entities),
    ConfigModule,
  ],
  providers: [
    {
      provide: REPOSITORY_TOKENS.WALLET,
      useClass: WalletRepository,
    },
    {
      provide: REPOSITORY_TOKENS.WAGER_TRANSACTION,
      useClass: WagerTransactionRepository,
    },
    {
      provide: REPOSITORY_TOKENS.LEDGER_ENTRY,
      useClass: LedgerEntryRepository,
    },
    {
      provide: REPOSITORY_TOKENS.OUTBOX_EVENT,
      useClass: OutboxEventRepository,
    },
    {
      provide: REPOSITORY_TOKENS.INBOX_MESSAGE,
      useClass: InboxMessageRepository,
    },
    ProcessWagerTransactionUseCase,
  ],
  exports: [
    REPOSITORY_TOKENS.WALLET,
    REPOSITORY_TOKENS.WAGER_TRANSACTION,
    REPOSITORY_TOKENS.LEDGER_ENTRY,
    REPOSITORY_TOKENS.OUTBOX_EVENT,
    REPOSITORY_TOKENS.INBOX_MESSAGE,
    ProcessWagerTransactionUseCase,
  ],
})
export class TestPersistenceModule {}