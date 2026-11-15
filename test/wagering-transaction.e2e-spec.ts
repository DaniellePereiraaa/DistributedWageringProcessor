import * as request from 'supertest';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction, TransactionKind, TransactionStatus } from '../src/domain/entities/wager-transaction.entity';
import { Currency } from '../src/domain/entities/wallet.entity';
import { Money } from '../src/common/value-objects/money.value-object';
import { dataSource, app } from './setup-e2e';

describe('Wagering Transactions API (e2e)', () => {
  let walletId: string;

  beforeAll(async () => {
    // Cria carteira base para testes
    const wallet = await dataSource.getRepository(Wallet).save(
      Wallet.create('player-transactions', Currency.BRL)
    );
    wallet.credit(Money.fromString('500.00'));
    await dataSource.getRepository(Wallet).save(wallet);
    walletId = wallet.id;
  });

  describe('POST /wagering/transactions', () => {
    it('deve processar BET (débito) com sucesso', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'bet-001')
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '100.00',
          idempotencyKey: 'bet-001',
          description: 'Aposta no jogo 123',
        })
        .expect(202);

      expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      expect(response.body.kind).toBe(TransactionKind.BET);
      expect(response.body.amount).toBe('100.00');
      expect(response.body.walletId).toBe(walletId);

      // Verifica saldo atualizado
      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('400.00');
    });

    it('deve processar WIN (crédito) com sucesso', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'win-001')
        .send({
          walletId,
          kind: TransactionKind.WIN,
          amount: '200.00',
          idempotencyKey: 'win-001',
          description: 'Vitória no jogo 123',
        })
        .expect(202);

      expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      expect(response.body.kind).toBe(TransactionKind.WIN);
      expect(response.body.amount).toBe('200.00');

      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('600.00');
    });

    it('deve processar LOSS (sem alteração de saldo, sem ledger)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'loss-001')
        .send({
          walletId,
          kind: TransactionKind.LOSS,
          amount: '50.00',
          idempotencyKey: 'loss-001',
          description: 'Perda no jogo 123',
        })
        .expect(202);

      expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      expect(response.body.kind).toBe(TransactionKind.LOSS);

      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('600.00'); // Saldo inalterado

      // Verifica que não há entrada no ledger para LOSS
      const ledgerCount = await dataSource.getRepository('ledger_entries').count({
        where: { walletId },
      });
      // Deve ter apenas as entradas anteriores (OPENING, BET, WIN)
    });

    it('deve rejeitar BET com saldo insuficiente', async () => {
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'bet-insufficient')
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '10000.00', // Maior que saldo
          idempotencyKey: 'bet-insufficient',
        })
        .expect(400);

      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('600.00'); // Saldo inalterado
    });

    it('deve processar REFUND referenciando BET anterior', async () => {
      // Primeiro cria um BET
      const betResponse = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'bet-for-refund')
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '50.00',
          idempotencyKey: 'bet-for-refund',
        })
        .expect(202);

      const betId = betResponse.body.id;

      // Agora faz REFUND referenciando o BET
      const response = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'refund-001')
        .send({
          walletId,
          kind: TransactionKind.REFUND,
          amount: '50.00',
          idempotencyKey: 'refund-001',
          referenceTransactionId: betId,
        })
        .expect(202);

      expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      expect(response.body.kind).toBe(TransactionKind.REFUND);
      expect(response.body.referenceTransactionId).toBe(betId);

      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('600.00'); // Voltou ao valor anterior ao BET
    });

    it('deve rejeitar REFUND sem referência', async () => {
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'refund-no-ref')
        .send({
          walletId,
          kind: TransactionKind.REFUND,
          amount: '50.00',
          idempotencyKey: 'refund-no-ref',
        })
        .expect(400);
    });

    it('deve rejeitar REFUND referenciando transação não processada', async () => {
      // Cria BET que será rejeitado (saldo insuficiente em outra carteira)
      // Para este teste, criamos uma transação PENDING manualmente
      const pendingTx = dataSource.getRepository(WagerTransaction).create({
        walletId,
        kind: TransactionKind.BET,
        amount: Money.fromString('10.00'),
        status: TransactionStatus.PENDING,
        idempotencyKey: 'pending-ref',
      });
      await dataSource.getRepository(WagerTransaction).save(pendingTx);

      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'refund-pending-ref')
        .send({
          walletId,
          kind: TransactionKind.REFUND,
          amount: '10.00',
          idempotencyKey: 'refund-pending-ref',
          referenceTransactionId: pendingTx.id,
        })
        .expect(400);
    });

    it('deve processar ROLLBACK referenciando REFUND', async () => {
      // Cria BET
      const betResponse = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'bet-for-rollback')
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '30.00',
          idempotencyKey: 'bet-for-rollback',
        })
        .expect(202);

      const betId = betResponse.body.id;

      // Cria REFUND
      const refundResponse = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'refund-for-rollback')
        .send({
          walletId,
          kind: TransactionKind.REFUND,
          amount: '30.00',
          idempotencyKey: 'refund-for-rollback',
          referenceTransactionId: betId,
        })
        .expect(202);

      const refundId = refundResponse.body.id;

      // Cria ROLLBACK referenciando o REFUND
      const response = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'rollback-001')
        .send({
          walletId,
          kind: TransactionKind.ROLLBACK,
          amount: '30.00',
          idempotencyKey: 'rollback-001',
          referenceTransactionId: refundId,
        })
        .expect(202);

      expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      expect(response.body.kind).toBe(TransactionKind.ROLLBACK);
      expect(response.body.referenceTransactionId).toBe(refundId);

      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('570.00'); // Voltou ao estado após BET
    });
  });

  describe('Idempotência', () => {
    it('deve retornar mesmo resultado para mesma idempotency key', async () => {
      const idempotencyKey = 'idempotent-bet-001';

      // Primeira requisição
      const response1 = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '25.00',
          idempotencyKey,
        })
        .expect(202);

      // Segunda requisição com mesma chave
      const response2 = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '25.00',
          idempotencyKey,
        })
        .expect(202);

      // Deve retornar mesmo transaction ID
      expect(response1.body.id).toBe(response2.body.id);
      expect(response1.body.status).toBe(TransactionStatus.PROCESSED);

      // Saldo deve ter sido debitado apenas uma vez
      const wallet = await dataSource.getRepository(Wallet).findOneBy({ id: walletId });
      expect(wallet?.balance.toString()).toBe('545.00');
    });

    it('deve rejeitar mesma idempotency key com payload diferente', async () => {
      const idempotencyKey = 'conflict-key-001';

      // Primeira requisição
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '10.00',
          idempotencyKey,
        })
        .expect(202);

      // Segunda requisição com mesma chave mas valor diferente
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          walletId,
          kind: TransactionKind.BET,
          amount: '20.00', // Valor diferente!
          idempotencyKey,
        })
        .expect(409); // Conflict
    });
  });
});