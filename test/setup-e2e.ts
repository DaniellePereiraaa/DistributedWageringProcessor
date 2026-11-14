import { DataSource } from 'typeorm';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction } from '../src/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '../src/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '../src/domain/entities/outbox-event.entity';
import { InboxMessage } from '../src/domain/entities/inbox-message.entity';

// Configuração global para testes e2e
// Usa Testcontainers para subir PostgreSQL e LocalStack reais

let dataSource: DataSource;

beforeAll(async () => {
  // A conexão é configurada via variáveis de ambiente
  // Docker Compose já sobe os containers necessários
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = parseInt(process.env.DATABASE_PORT || '5432', 10);
  const username = process.env.DATABASE_USERNAME || 'postgres';
  const password = process.env.DATABASE_PASSWORD || 'postgres';
  const database = process.env.DATABASE_NAME || 'wagering';

  dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [Wallet, WagerTransaction, LedgerEntry, OutboxEvent, InboxMessage],
    synchronize: true, // Para testes, sincroniza schema automaticamente
    logging: false,
  });

  await dataSource.initialize();

  // Aguarda banco estar pronto
  await dataSource.query('SELECT 1');
}, 60000);

afterAll(async () => {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
});

// Limpa todas as tabelas entre testes
beforeEach(async () => {
  if (dataSource?.isInitialized) {
    const entities = [InboxMessage, OutboxEvent, LedgerEntry, WagerTransaction, Wallet];
    for (const entity of entities) {
      await dataSource.getRepository(entity).clear();
    }
  }
});

// Exporta dataSource para uso nos testes
export { dataSource };