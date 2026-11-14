import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction, TransactionKind, TransactionStatus } from '../src/domain/entities/wager-transaction.entity';
import { LedgerEntry, LedgerEntryType } from '../src/domain/entities/ledger-entry.entity';
import { Currency } from '../src/domain/entities/wallet.entity';
import { Money } from '../src/common/value-objects/money.value-object';
import { dataSource } from './setup-e2e';

describe('Reconciliação (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /wallets/:id/reconciliation', () => {
    it('deve passar reconciliação quando saldo bate com ledger', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-reconcile-ok', Currency.BRL)
      );
      wallet.credit(Money.fromString('1000.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // Faz algumas transações
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'reconcile-bet-1')
        .send({ walletId: wallet.id, kind: TransactionKind.BET, amount: '100.00', idempotencyKey: 'reconcile-bet-1' })
        .expect(202);

      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'reconcile-win-1')
        .send({ walletId: wallet.id, kind: TransactionKind.WIN, amount: '50.00', idempotencyKey: 'reconcile-win-1' })
        .expect(202);

      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'reconcile-loss-1')
        .send({ walletId: wallet.id, kind: TransactionKind.LOSS, amount: '25.00', idempotencyKey: 'reconcile-loss-1' })
        .expect(202);

      // Reconciliação deve passar
      const response = await request(app.getHttpServer())
        .post(`/api/wallets/${wallet.id}/reconciliation`)
        .expect(200);

      expect(response.body.matched).toBe(true);
      expect(response.body.storedBalance).toBe(response.body.calculatedBalance);
      expect(response.body.discrepancy).toBeNull();
      expect(response.body.walletId).toBe(wallet.id);
    });

    it('deve detectar discrepância se ledger for manipulado manualmente', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-reconcile-fail', Currency.BRL)
      );
      wallet.credit(Money.fromString('500.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // Faz transação normal
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'reconcile-bet-2')
        .send({ walletId: wallet.id, kind: TransactionKind.BET, amount: '100.00', idempotencyKey: 'reconcile-bet-2' })
        .expect(202);

      // Manipula ledger diretamente (simula corrupção de dados)
      await dataSource.query(`
        UPDATE ledger_entries
        SET balance_after = balance_after - 10
        WHERE wallet_id = $1
      `, [wallet.id]);

      // Reconciliação deve falhar
      const response = await request(app.getHttpServer())
        .post(`/api/wallets/${wallet.id}/reconciliation`)
        .expect(400);

      expect(response.body.matched).toBe(false);
      expect(response.body.discrepancy).toBeDefined();
      expect(parseFloat(response.body.discrepancy)).toBeGreaterThan(0);
    });

    it('deve retornar 404 para carteira inexistente', async () => {
      await request(app.getHttpServer())
        .post('/api/wallets/00000000-0000-0000-0000-000000000000/reconciliation')
        .expect(404);
    });
  });

  describe('Ledger Cursor Pagination', () => {
    it('deve paginar ledger com cursor', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-ledger-page', Currency.BRL)
      );
      wallet.credit(Money.fromString('1000.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // Cria 15 transações (cada uma gera entrada no ledger exceto LOSS)
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', `page-bet-${i}`)
          .send({ walletId: wallet.id, kind: TransactionKind.BET, amount: '10.00', idempotencyKey: `page-bet-${i}` })
          .expect(202);
      }

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', `page-win-${i}`)
          .send({ walletId: wallet.id, kind: TransactionKind.WIN, amount: '10.00', idempotencyKey: `page-win-${i}` })
          .expect(202);
      }

      // Total: OPENING + 10 BET + 5 WIN = 16 entradas no ledger

      // Primeira página (limit 5)
      const page1 = await request(app.getHttpServer())
        .get(`/api/wallets/${wallet.id}/ledger`)
        .query({ limit: 5 })
        .expect(200);

      expect(page1.body.entries.length).toBe(5);
      expect(page1.body.nextCursor).toBeDefined();

      // Segunda página usando cursor
      const page2 = await request(app.getHttpServer())
        .get(`/api/wallets/${wallet.id}/ledger`)
        .query({ limit: 5, cursor: page1.body.nextCursor })
        .expect(200);

      expect(page2.body.entries.length).toBe(5);
      expect(page2.body.nextCursor).toBeDefined();

      // Verifica que não há duplicatas entre páginas
      const allIds = [...page1.body.entries, ...page2.body.entries].map(e => e.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(10);

      // Verifica ordem decrescente (mais recente primeiro)
      for (let i = 1; i < page1.body.entries.length; i++) {
        const prev = new Date(page1.body.entries[i - 1].createdAt).getTime();
        const curr = new Date(page1.body.entries[i].createdAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });
});