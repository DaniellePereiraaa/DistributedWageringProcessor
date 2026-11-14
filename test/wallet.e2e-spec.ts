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

describe('Wallet API (e2e)', () => {
  let app: INestApplication;
  let walletId: string;

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

  describe('POST /wallets', () => {
    it('deve criar uma carteira com transação OPENING inicial', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-123',
          currency: 'BRL',
          initialAmount: '100.00',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.playerId).toBe('player-123');
      expect(response.body.currency).toBe('BRL');
      expect(response.body.balance).toBe('100.00');
      expect(response.body.version).toBe(0);

      walletId = response.body.id;
    });

    it('deve rejeitar criação com valor inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-456',
          currency: 'BRL',
          initialAmount: 'invalid',
        })
        .expect(400);
    });

    it('deve rejeitar moeda inválida', async () => {
      await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-789',
          currency: 'INVALID',
          initialAmount: '100.00',
        })
        .expect(400);
    });

    it('não deve permitir carteira duplicada para mesmo player/currency', async () => {
      // Primeira criação
      await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-dup',
          currency: 'BRL',
          initialAmount: '50.00',
        })
        .expect(201);

      // Segunda criação deve falhar
      await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-dup',
          currency: 'BRL',
          initialAmount: '50.00',
        })
        .expect(409);
    });
  });

  describe('GET /wallets/:id', () => {
    it('deve retornar carteira por ID', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/wallets')
        .send({
          playerId: 'player-get',
          currency: 'BRL',
          initialAmount: '200.00',
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/wallets/${createResponse.body.id}`)
        .expect(200);

      expect(response.body.id).toBe(createResponse.body.id);
      expect(response.body.balance).toBe('200.00');
    });

    it('deve retornar 404 para carteira inexistente', async () => {
      await request(app.getHttpServer())
        .get('/api/wallets/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});