import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction } from '../src/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '../src/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '../src/domain/entities/outbox-event.entity';
import { InboxMessage } from '../src/domain/entities/inbox-message.entity';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TestAppModule } from './test-app.module';

// Configuração global para testes e2e
// Usa um único app NestJS compartilhado entre todos os arquivos de teste (sem workers)

let dataSource: DataSource;
let app: INestApplication;
let moduleFixture: TestingModule;

beforeAll(async () => {
  // A conexão é configurada via variáveis de ambiente
  // Docker Compose já sobe os containers necessários
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = parseInt(process.env.DATABASE_PORT || '5432', 10);
  const username = process.env.DATABASE_USERNAME || 'postgres';
  const password = process.env.DATABASE_PASSWORD || 'postgres';
  const database = process.env.DATABASE_NAME || 'wagering';

  // First, create a temporary DataSource to run migrations
  const tempDataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [Wallet, WagerTransaction, LedgerEntry, OutboxEvent, InboxMessage],
    migrations: ['dist/migrations/*.js'],
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: false,
  });

  await tempDataSource.initialize();
  await tempDataSource.runMigrations();
  await tempDataSource.destroy();

  // Now create the test DataSource without synchronize
  dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [Wallet, WagerTransaction, LedgerEntry, OutboxEvent, InboxMessage],
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging: false,
  });

  await dataSource.initialize();

  // Aguarda banco estar pronto
  await dataSource.query('SELECT 1');

  // Create shared NestJS app for all tests (uses TestAppModule without workers)
  console.log('Creating test module...');
  moduleFixture = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();
  console.log('Test module compiled');

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  console.log('Initializing app...');
  await app.init();
  console.log('App initialized');
}, 60000);

afterAll(async () => {
  if (app) {
    await app.close();
  }
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
});

// Limpa todas as tabelas entre testes
beforeEach(async () => {
  if (dataSource?.isInitialized) {
    // Use TRUNCATE with CASCADE in a single query to avoid foreign key lock issues
    await dataSource.query('TRUNCATE TABLE inbox_messages, outbox_events, ledger_entries, wager_transactions, wallets RESTART IDENTITY CASCADE;');
  }
});

// Exporta dataSource e app para uso nos testes
export { dataSource, app, moduleFixture };