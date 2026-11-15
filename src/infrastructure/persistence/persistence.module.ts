import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletRepository } from './typeorm/wallet.repository';
import { WagerTransactionRepository } from './typeorm/wager-transaction.repository';
import { LedgerEntryRepository } from './typeorm/ledger-entry.repository';
import { OutboxEventRepository } from './typeorm/outbox-event.repository';
import { InboxMessageRepository } from './typeorm/inbox-message.repository';
import { SqsConsumerService } from '@/infrastructure/messaging/sqs/sqs-consumer.service';
import { OutboxWorkerService } from '@/infrastructure/messaging/sqs/outbox-worker.service';
import { RetryWorkerService } from '@/infrastructure/messaging/sqs/retry-worker.service';
import { ProcessWagerTransactionUseCase } from '@/application/use-cases/process-wager-transaction.use-case';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '@/domain/entities/outbox-event.entity';
import { InboxMessage } from '@/domain/entities/inbox-message.entity';
import {
  WalletRepositoryInterface,
  WagerTransactionRepositoryInterface,
  LedgerEntryRepositoryInterface,
  OutboxEventRepositoryInterface,
  InboxMessageRepositoryInterface,
} from './interfaces';
import { REPOSITORY_TOKENS } from './repository-tokens';

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
    TypeOrmModule,
    ConfigModule,
    ScheduleModule,
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
    SqsConsumerService,
    OutboxWorkerService,
    RetryWorkerService,
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
export class PersistenceModule {}