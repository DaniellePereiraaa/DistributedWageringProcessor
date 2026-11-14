import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Wallet } from './domain/entities/wallet.entity';
import { WagerTransaction } from './domain/entities/wager-transaction.entity';
import { LedgerEntry } from './domain/entities/ledger-entry.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { InboxMessage } from './domain/entities/inbox-message.entity';

const configService = new ConfigService();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: configService.get('DATABASE_HOST', 'localhost'),
  port: configService.get('DATABASE_PORT', 5432),
  username: configService.get('DATABASE_USERNAME', 'postgres'),
  password: configService.get('DATABASE_PASSWORD', 'postgres'),
  database: configService.get('DATABASE_NAME', 'wagering'),
  entities: [Wallet, WagerTransaction, LedgerEntry, OutboxEvent, InboxMessage],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  logging: configService.get('NODE_ENV') === 'development',
};

export const dataSource = new DataSource(dataSourceOptions);