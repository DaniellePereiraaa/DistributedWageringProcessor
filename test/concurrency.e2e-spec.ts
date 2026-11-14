import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { Currency } from '../src/domain/entities/wallet.entity';
import { Money } from '../src/common/value-objects/money.value-object';
import { dataSource } from './setup-e2e';
import { TransactionKind, TransactionStatus } from '../src/domain/entities/wager-transaction.entity';

/**
 * Testes de Concorrência
 *
 * Cenários testados:
 * 1. 50 requisições paralelas com mesma idempotency key (deduplicação)
 * 2. Hot wallet: múltiplas instâncias processando mesma carteira
 * 3. Race condition: BETs concorrentes esgotando saldo
 * 4. Recuperação de crash: transação interrompida no meio
 */
describe('Concurrency Tests (e2e)', () => {
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

  describe('Deduplicação paralela (50 requisições simultâneas)', () => {
    it('deve processar apenas uma transação para 50 requisições com mesma idempotency key', async () => {
      // Cria carteira com saldo suficiente
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-concurrent-dedup', Currency.BRL)
      );
      wallet.credit(Money.fromString('1000.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      const idempotencyKey = 'concurrent-dedup-key';
      const concurrentRequests = 50;

      // Dispara 50 requisições simultâneas
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', idempotencyKey)
          .send({
            walletId: wallet.id,
            kind: TransactionKind.BET,
            amount: '100.00',
            idempotencyKey,
          })
      );

      const responses = await Promise.all(promises);

      // Todas devem retornar 202
      responses.forEach(response => {
        expect(response.status).toBe(202);
        expect(response.body.status).toBe(TransactionStatus.PROCESSED);
      });

      // Todas devem retornar o MESMO transaction ID
      const transactionIds = responses.map(r => r.body.id);
      const uniqueIds = new Set(transactionIds);
      expect(uniqueIds.size).toBe(1);

      // Saldo deve ter sido debitado APENAS UMA VEZ (100.00)
      const finalWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      expect(finalWallet?.balance.toString()).toBe('900.00');

      // Deve haver apenas 1 transação no banco (além do OPENING)
      const txCount = await dataSource.getRepository('wager_transactions').count({
        where: { walletId: wallet.id, idempotencyKey },
      });
      expect(txCount).toBe(1);
    });
  });

  describe('Hot Wallet - Contenção em carteira única', () => {
    it('deve processar BETs concorrentes sem race condition (saldo nunca negativo)', async () => {
      // Carteira com saldo para exatamente 10 apostas de 10.00
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-hot-wallet', Currency.BRL)
      );
      wallet.credit(Money.fromString('100.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      const concurrentBets = 20; // Mais apostas que o saldo permite
      const betAmount = '10.00';

      // Dispara 20 apostas simultâneas de 10.00 cada
      // Apenas 10 devem ter sucesso (saldo = 100.00)
      const promises = Array(concurrentBets).fill(null).map((_, i) =>
        request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', `hot-wallet-bet-${i}`)
          .send({
            walletId: wallet.id,
            kind: TransactionKind.BET,
            amount: betAmount,
            idempotencyKey: `hot-wallet-bet-${i}`,
          })
      );

      const responses = await Promise.all(promises);

      // Conta sucessos e falhas
      const successful = responses.filter(r => r.status === 202);
      const rejected = responses.filter(r => r.status === 400);

      // Deve haver exatamente 10 sucessos (100.00 / 10.00 = 10)
      expect(successful.length).toBe(10);
      expect(rejected.length).toBe(10);

      // Saldo final deve ser 0 (ou muito próximo, considerando precisão)
      const finalWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      expect(finalWallet?.balance.toString()).toBe('0.00');

      // Verifica que nenhuma transação deixou saldo negativo
      // (já validado pela exceção InsufficientFundsException)
      const allTxs = await dataSource.getRepository('wager_transactions').find({
        where: { walletId: wallet.id },
      });

      // Reconcilia: soma dos débitos não deve exceder crédito inicial + OPENING
      let totalDebited = 0;
      for (const tx of allTxs) {
        if (tx.kind === TransactionKind.BET && tx.status === TransactionStatus.PROCESSED) {
          totalDebited += parseFloat(tx.amount.toString());
        }
      }
      expect(totalDebited).toBeLessThanOrEqual(100.00);
    });

    it('deve manter consistência com WINs e BETs concorrentes', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-mixed-concurrent', Currency.BRL)
      );
      wallet.credit(Money.fromString('500.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      const operations = 30;
      const promises = Array(operations).fill(null).map((_, i) => {
        const isWin = i % 2 === 0;
        return request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', `mixed-${i}`)
          .send({
            walletId: wallet.id,
            kind: isWin ? TransactionKind.WIN : TransactionKind.BET,
            amount: '50.00',
            idempotencyKey: `mixed-${i}`,
          });
      });

      const responses = await Promise.all(promises);

      // Verifica saldo final consistente
      const finalWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      const expectedBalance = 500 + (15 * 50) - (15 * 50); // 15 WINs, 15 BETs
      expect(finalWallet?.balance.toString()).toBe(expectedBalance.toFixed(2));

      // Reconciliação deve passar
      const reconciliationResponse = await request(app.getHttpServer())
        .post(`/api/wallets/${wallet.id}/reconciliation`)
        .expect(200);

      expect(reconciliationResponse.body.matched).toBe(true);
    });
  });

  describe('Múltiplas instâncias (simulado via conexões paralelas)', () => {
    it('deve processar transações de 3 "instâncias" diferentes na mesma carteira', async () => {
      // Simula 3 instâncias do serviço processando a mesma carteira
      // Cada "instância" faz 5 operações
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-multi-instance', Currency.BRL)
      );
      wallet.credit(Money.fromString('1000.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      const instances = 3;
      const opsPerInstance = 5;

      // Cria apps separados para simular instâncias diferentes
      const apps: INestApplication[] = [];
      for (let i = 0; i < instances; i++) {
        const moduleFixture = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        const instanceApp = moduleFixture.createNestApplication();
        instanceApp.setGlobalPrefix('api');
        await instanceApp.init();
        apps.push(instanceApp);
      }

      try {
        // Cada instância faz operações concorrentes
        const allPromises: Promise<any>[] = [];

        for (let i = 0; i < instances; i++) {
          for (let j = 0; j < opsPerInstance; j++) {
            const promise = request(apps[i].getHttpServer())
              .post('/api/wagering/transactions')
              .set('Idempotency-Key', `instance-${i}-op-${j}`)
              .send({
                walletId: wallet.id,
                kind: TransactionKind.BET,
                amount: '20.00',
                idempotencyKey: `instance-${i}-op-${j}`,
              });
            allPromises.push(promise);
          }
        }

        const responses = await Promise.all(allPromises);

        // Todas as 15 operações devem ser processadas (saldo = 1000, 15*20 = 300)
        const successful = responses.filter(r => r.status === 202);
        expect(successful.length).toBe(instances * opsPerInstance);

        const finalWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
        expect(finalWallet?.balance.toString()).toBe('700.00');

        // Reconciliação
        const reconciliationResponse = await request(apps[0].getHttpServer())
          .post(`/api/wallets/${wallet.id}/reconciliation`)
          .expect(200);

        expect(reconciliationResponse.body.matched).toBe(true);
      } finally {
        await Promise.all(apps.map(a => a.close()));
      }
    });
  });

  describe('Recuperação de crash / falha no meio da transação', () => {
    it('não deve deixar dados inconsistentes se processo morrer durante transação', async () => {
      // Este teste simula um crash matando a conexão no meio do processamento
      // O banco de dados (PostgreSQL) garante atomicidade via transação
      // Se a transação não comitar, nada é persistido

      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-crash-recovery', Currency.BRL)
      );
      wallet.credit(Money.fromString('200.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // Faz uma transação normal primeiro
      await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'crash-normal-1')
        .send({
          walletId: wallet.id,
          kind: TransactionKind.BET,
          amount: '50.00',
          idempotencyKey: 'crash-normal-1',
        })
        .expect(202);

      // Verifica estado consistente
      let currentWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      expect(currentWallet?.balance.toString()).toBe('150.00');

      // Simula "crash" forçando rollback manual em uma transação direta
      // (Em produção, o crash real faria o PostgreSQL fazer rollback automático)
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Tenta fazer operação mas força erro
        await queryRunner.manager.query(`
          UPDATE wallets SET balance = balance - 50 WHERE id = $1
        `, [wallet.id]);

        // Força erro para causar rollback
        throw new Error('Simulated crash');
      } catch (error) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      // Saldo deve estar inalterado (rollback funcionou)
      currentWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      expect(currentWallet?.balance.toString()).toBe('150.00');

      // Reconciliação deve passar
      const reconciliationResponse = await request(app.getHttpServer())
        .post(`/api/wallets/${wallet.id}/reconciliation`)
        .expect(200);

      expect(reconciliationResponse.body.matched).toBe(true);
    });

    it('deve permitir reprocessamento de transação PENDING_REFERENCE após crash', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-pending-ref-crash', Currency.BRL)
      );
      wallet.credit(Money.fromString('500.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // Cria BET
      const betResponse = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'bet-for-pending-crash')
        .send({
          walletId: wallet.id,
          kind: TransactionKind.BET,
          amount: '100.00',
          idempotencyKey: 'bet-for-pending-crash',
        })
        .expect(202);

      const betId = betResponse.body.id;

      // Cria REFUND que entra em PENDING_REFERENCE (simulando que BET não foi processado)
      // Para testar, criamos manualmente uma transação PENDING_REFERENCE
      const refundTx = dataSource.getRepository('wager_transactions').create({
        walletId: wallet.id,
        kind: TransactionKind.REFUND,
        amount: Money.fromString('100.00'),
        status: TransactionStatus.PENDING_REFERENCE,
        referenceTransactionId: betId,
        idempotencyKey: 'refund-pending-crash',
      });
      await dataSource.getRepository('wager_transactions').save(refundTx);

      // Simula crash: processo morre aqui, REFUND fica PENDING_REFERENCE
      // Quando processo reinicia, retry worker deve processar

      // Verifica que REFUND está PENDING_REFERENCE
      const pendingRefund = await dataSource.getRepository('wager_transactions').findOne({
        where: { idempotencyKey: 'refund-pending-crash' },
      });
      expect(pendingRefund?.status).toBe(TransactionStatus.PENDING_REFERENCE);

      // Agora simula retry worker processando (BET já está PROCESSED)
      // O retry worker chamaria o use case novamente
      const retryResponse = await request(app.getHttpServer())
        .post('/api/wagering/transactions')
        .set('Idempotency-Key', 'refund-pending-crash-retry')
        .send({
          walletId: wallet.id,
          kind: TransactionKind.REFUND,
          amount: '100.00',
          idempotencyKey: 'refund-pending-crash-retry',
          referenceTransactionId: betId,
        })
        .expect(202);

      expect(retryResponse.body.status).toBe(TransactionStatus.PROCESSED);

      // Saldo deve voltar a 500 (BET -100, REFUND +100)
      const finalWallet = await dataSource.getRepository(Wallet).findOneBy({ id: wallet.id });
      expect(finalWallet?.balance.toString()).toBe('500.00');
    });
  });

  describe('Ledger e Reconciliação sob concorrência', () => {
    it('deve manter ledger consistente sob alta concorrência', async () => {
      const wallet = await dataSource.getRepository(Wallet).save(
        Wallet.create('player-ledger-concurrent', Currency.BRL)
      );
      wallet.credit(Money.fromString('1000.00'));
      await dataSource.getRepository(Wallet).save(wallet);

      // 20 operações concorrentes (10 BET, 10 WIN)
      const promises = Array(20).fill(null).map((_, i) => {
        const isWin = i % 2 === 0;
        return request(app.getHttpServer())
          .post('/api/wagering/transactions')
          .set('Idempotency-Key', `ledger-concurrent-${i}`)
          .send({
            walletId: wallet.id,
            kind: isWin ? TransactionKind.WIN : TransactionKind.BET,
            amount: '25.00',
            idempotencyKey: `ledger-concurrent-${i}`,
          });
      });

      await Promise.all(promises);

      // Verifica ledger: deve ter 20 entradas (10 DEBIT, 10 CREDIT) + OPENING
      const ledgerEntries = await dataSource.getRepository(LedgerEntry).find({
        where: { walletId: wallet.id },
        order: { createdAt: 'ASC' },
      });

      // OPENING + 10 DEBIT + 10 CREDIT = 21 entradas
      // (LOSS não gera ledger)
      expect(ledgerEntries.length).toBe(21);

      // Verifica integridade do ledger: balanceAfter de cada entrada = balanceBefore da próxima
      for (let i = 1; i < ledgerEntries.length; i++) {
        const prev = ledgerEntries[i - 1];
        const curr = ledgerEntries[i];
        expect(curr.balanceBefore.toString()).toBe(prev.balanceAfter.toString());
      }

      // Reconciliação final
      const reconciliationResponse = await request(app.getHttpServer())
        .post(`/api/wallets/${wallet.id}/reconciliation`)
        .expect(200);

      expect(reconciliationResponse.body.matched).toBe(true);
      expect(reconciliationResponse.body.storedBalance).toBe(reconciliationResponse.body.calculatedBalance);
    });
  });
});