# Processador Distribuído de Apostas

**Desafio Backend Jungle Gaming** - Um processador de apostas distribuído construído com NestJS, TypeScript, PostgreSQL e SQS (LocalStack).

## Visão Geral da Arquitetura

Este sistema implementa um processador de apostas financeiramente correto, concorrente e resiliente com:

- **Correção Financeira**: Value Object `Money` imutável (strings decimais, 2 casas), sem floats
- **Concorrência**: Lock pessimista por `walletId` (unidade de concorrência), lock otimista via coluna version
- **Idempotência**: Deduplicação persistente via header `Idempotency-Key` e tabela Inbox
- **Consistência**: Saldo da wallet, Ledger, Inbox e Outbox atualizados em transação SQL única
- **Ordenação**: Tratamento de mensagens fora de ordem via status `PENDING_REFERENCE` e worker de retry

## Stack Tecnológica

- **Framework**: NestJS 10 com TypeScript
- **Runtime**: Bun (alternativa rápida ao Node.js)
- **Banco de Dados**: PostgreSQL 16 com TypeORM
- **Mensageria**: SQS via LocalStack (compatível AWS)
- **Containerização**: Docker Compose
- **Testes**: Jest (testes unitários + testes de validação de arquitetura)

## Início Rápido

### Pré-requisitos

- Docker e Docker Compose
- Bun (opcional, para desenvolvimento local sem Docker)

### Usando Docker Compose (Recomendado)

```bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Parar serviços
docker-compose down
```

A API estará disponível em:
- **API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health/live | /ready

### Desenvolvimento Local

```bash
# Instalar dependências
bun install

# Iniciar apenas PostgreSQL e LocalStack
docker-compose up -d postgres localstack

# Rodar migrações
bun run db:migrate

# Iniciar servidor de desenvolvimento
bun run start:dev
```

## Endpoints da API

Todos os endpoints estão no path raiz (sem prefixo `/api`).

### Wallets

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/wallets` | Criar wallet com transação OPENING inicial |
| GET | `/wallets/:id` | Buscar wallet por ID |
| GET | `/wallets/:id/ledger` | Buscar entradas do ledger (paginação com cursor) |
| GET | `/wallets/:id/transactions` | Buscar transações da wallet |

### Apostas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/wagering/transactions` | Submeter transação (requer header `Idempotency-Key`) |

### Reconciliação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/wallets/:id/reconciliation` | Comparar saldo armazenado vs calculado |

### Health

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health/live` | Probe de liveness |
| GET | `/health/ready` | Probe de readiness |

## Tipos de Transação

| Tipo | Tipo | Ledger | Descrição |
|------|------|--------|-----------|
| `BET` | Débito | Sim | Jogador faz uma aposta |
| `WIN` | Crédito | Sim | Jogador ganha |
| `LOSS` | Nenhum | Não | Jogador perde (sem mudança de saldo) |
| `REFUND` | Crédito | Sim | Estorna um BET anterior |
| `ROLLBACK` | Débito | Sim | Estorna um REFUND |
| `OPENING` | Crédito | Sim | Financiamento inicial da wallet |

## Idempotência

Todas as transações de apostas requerem header `Idempotency-Key`:

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: chave-unica-123" \
  -d '{
    "walletId": "uuid",
    "kind": "BET",
    "amount": "50.00",
    "idempotencyKey": "chave-unica-123"
  }'
```

- Mesma chave + mesmo payload = retorna resultado existente (202)
- Mesma chave + payload diferente = 409 Conflict
- Chaves armazenadas persistentemente na tabela Inbox (chave composta: consumerName + messageId)

## Tratamento de Concorrência

O sistema lida com transações concorrentes na mesma wallet usando:

1. **Lock Pessimista**: `SELECT ... FOR UPDATE SKIP LOCKED` na linha da wallet durante processamento
2. **Lock Otimista**: Coluna version na entity Wallet para detecção de retry
3. **Unidade de Concorrência**: `walletId` - wallets diferentes processam em paralelo

## Mensagens Fora de Ordem

Transações REFUND/ROLLBACK podem chegar antes do BET de referência:

1. Transação marcada como `PENDING_REFERENCE`
2. Armazenada no banco com referenceTransactionId
3. Worker de retry faz polling a cada 30s e reprocessa quando referência está disponível
4. Backoff exponencial para falhas repetidas

## Rodando Testes

```bash
# Testes unitários
bun run test

# Testes de integração (requer Docker)
bun run test:e2e

# Cobertura
bun run test:cov
```

## Estrutura do Projeto

```
src/
├── app.module.ts           # Módulo principal da aplicação
├── main.ts                 # Ponto de entrada
├── data-source.ts          # Data Source TypeORM para CLI
├── common/
│   ├── value-objects/      # Value Object Money
│   ├── exceptions/         # Exceções de domínio
│   └── utils/              # Utilitários de outbox transacional
├── domain/
│   └── entities/           # Wallet, WagerTransaction, LedgerEntry, InboxMessage, OutboxEvent
├── application/
│   └── use-cases/          # Lógica de negócio (use cases)
├── infrastructure/
│   ├── persistence/
│   │   └── typeorm/        # Repositórios TypeORM
│   └── messaging/
│       └── sqs/            # Consumer SQS, Outbox Worker, Retry Worker
└── presentation/
    ├── controllers/        # Controllers REST
    ├── dtos/               # Data Transfer Objects
    └── presentation.module.ts
```

## Configuração

Variáveis de ambiente (`.env`):

```env
# Aplicação
NODE_ENV=development
PORT=3000

# Banco de Dados
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=wagering

# SQS (LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
SQS_ENDPOINT=http://localhost:4566
SQS_QUEUE_URL=http://localhost:4566/000000000000/wagering-queue
SQS_DLQ_URL=http://localhost:4566/000000000000/wagering-dlq

# Workers
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=100
CONSUMER_POLL_INTERVAL_MS=1000
CONSUMER_BATCH_SIZE=10
RETRY_WORKER_INTERVAL_MS=30000
RETRY_WORKER_BATCH_SIZE=50
```

## Exemplos Completos de Uso

### 1. Criar uma Wallet

```bash
curl -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-123",
    "currency": "BRL",
    "initialAmount": "100.00"
  }'
```

Resposta (201):
```json
{
  "id": "uuid",
  "playerId": "player-123",
  "currency": "BRL",
  "balance": "100.00",
  "version": 1,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### 2. Fazer uma Aposta (BET)

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: bet-001" \
  -d '{
    "walletId": "WALLET_UUID_DO_PASSO_1",
    "kind": "BET",
    "amount": "25.00",
    "idempotencyKey": "bet-001",
    "description": "Aposta no jogo 123",
    "metadata": { "gameId": "game-123" }
  }'
```

Resposta (202):
```json
{
  "id": "TRANSACTION_UUID",
  "walletId": "WALLET_UUID",
  "kind": "BET",
  "amount": "25.00",
  "status": "PROCESSED",
  "referenceTransactionId": null,
  "idempotencyKey": "bet-001",
  "description": "Aposta no jogo 123",
  "metadata": { "gameId": "game-123" },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### 3. Registrar uma Vitória (WIN)

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: win-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "WIN",
    "amount": "50.00",
    "idempotencyKey": "win-001",
    "referenceTransactionId": "TRANSACTION_UUID_DO_PASSO_2",
    "description": "Vitória no jogo 123"
  }'
```

### 4. Registrar uma Derrota (LOSS) - Sem Entrada no Ledger

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: loss-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "LOSS",
    "amount": "25.00",
    "idempotencyKey": "loss-001",
    "referenceTransactionId": "TRANSACTION_UUID_DO_PASSO_2"
  }'
```

### 5. Estornar uma Aposta (REFUND) - Seguro para Fora de Ordem

```bash
# Se a transação de referência não existir ainda, vai para PENDING_REFERENCE
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "REFUND",
    "amount": "25.00",
    "idempotencyKey": "refund-001",
    "referenceTransactionId": "TRANSACTION_UUID_DO_PASSO_2"
  }'
```

### 6. Estornar um Refund (ROLLBACK)

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: rollback-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "ROLLBACK",
    "amount": "25.00",
    "idempotencyKey": "rollback-001",
    "referenceTransactionId": "REFUND_TRANSACTION_UUID"
  }'
```

### 7. Consultar Saldo da Wallet

```bash
curl http://localhost:3000/wallets/WALLET_UUID
```

### 8. Consultar Entradas do Ledger (Paginação com Cursor)

```bash
# Primeira página
curl "http://localhost:3000/wallets/WALLET_UUID/ledger?limit=50"

# Próxima página (use nextCursor da resposta anterior)
curl "http://localhost:3000/wallets/WALLET_UUID/ledger?cursor=2024-01-15T10:30:00.000Z&limit=50"
```

### 9. Consultar Transações da Wallet

```bash
curl "http://localhost:3000/wallets/WALLET_UUID/transactions?limit=50&offset=0&status=PROCESSED"
```

### 10. Reconciliar Wallet (Validar Saldo)

```bash
curl -X POST http://localhost:3000/wallets/WALLET_UUID/reconciliation
```

Resposta (200 - compatível):
```json
{
  "walletId": "WALLET_UUID",
  "storedBalance": "125.00",
  "calculatedBalance": "125.00",
  "matched": true,
  "lastLedgerEntryDate": "2024-01-15T10:35:00.000Z"
}
```

Resposta (400 - divergência):
```json
{
  "statusCode": 400,
  "message": "Reconciliation mismatch for wallet WALLET_UUID: stored=125.00, calculated=120.00",
  "error": "Bad Request"
}
```

## Detalhamento da Arquitetura

### Fluxo Transacional (Criar Wallet)

```
HTTP Request
    │
    ▼
CreateWalletUseCase.execute()
    │
    ├── Transação TypeORM inicia
    │
    ├── WalletRepository.createWithOpeningTransaction()
    │   └── INSERT INTO wallets (player_id, currency, balance=100.00)
    │
    ├── WagerTransactionRepository.save()
    │   └── INSERT INTO wager_transactions (wallet_id, kind=OPENING, amount=100.00, status=PROCESSED)
    │
    ├── LedgerEntryRepository.save()
    │   └── INSERT INTO ledger_entries (wallet_id, transaction_id, entry_type=CREDIT, amount=100.00, balance_before=0.00, balance_after=100.00)
    │
    ├── TransactionalOutbox.addEvent()
    │   └── INSERT INTO outbox_events (event_type=WalletCreated, payload={...}, aggregate_id=wallet_id)
    │
    ├── InboxMessageRepository.save()
    │   └── INSERT INTO inbox_messages (consumer_name=api, message_id=idem-key, payload={...})
    │
    └── Transaction COMMIT
        │
        ▼
OutboxWorker (assíncrono, processo separado)
    │
    ├── SELECT * FROM outbox_events WHERE processed_at IS NULL FOR UPDATE SKIP LOCKED
    │
    ├── Publica no SQS
    │
    └── UPDATE outbox_events SET processed_at=NOW() WHERE id IN (...)
```

### Processamento Concorrente de BET

```
Request 1 (BET 50.00)          Request 2 (BET 30.00)          Request 3 (WIN 100.00)
     │                              │                              │
     ▼                              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Transação TypeORM                                │
│  SELECT * FROM wallets WHERE id=? FOR UPDATE SKIP LOCKED           │
│  ─────────────────────────────────────────────────────────────     │
│  Request 1 obtém lock, Request 2 & 3 aguardam                      │
│  Request 1: saldo 100→50, cria ledger, outbox, inbox               │
│  COMMIT                                                             │
│  ─────────────────────────────────────────────────────────────     │
│  Request 2 obtém lock, Request 3 aguarda                           │
│  Request 2: saldo 50→20, cria ledger, outbox, inbox                │
│  COMMIT                                                             │
│  ─────────────────────────────────────────────────────────────     │
│  Request 3 obtém lock                                              │
│  Request 3: saldo 20→120, cria ledger, outbox, inbox               │
│  COMMIT                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Tratamento de REFUND Fora de Ordem

```
Timeline:
────────────────────────────────────────────────────────────────────►

T1: BET chega → PROCESSED (saldo 100→50)

T2: REFUND chega ANTES do BET (race condition)
    → Cria transação com status=PENDING_REFERENCE
    → Armazena referenceTransactionId
    → NÃO toca no saldo da wallet ainda

T3: BET chega (ou foi processado em T1)
    → PROCESSED

T4: Retry Worker (faz polling a cada 30s)
    → Encontra REFUND com PENDING_REFERENCE
    → Verifica se BET de referência está PROCESSED
    → Se sim: reprocessa REFUND → PROCESSED (saldo 50→75)
    → Se não: mantém como PENDING_REFERENCE para próximo poll
```

## Classificação de Erros

| Categoria | Exemplos | Tratamento |
|-----------|----------|------------|
| **Negócio** | Saldo insuficiente, Wallet não encontrada, Conflito idempotência | Retorna 4xx, sem retry |
| **Transiente** | Deadlock DB, Timeout rede, Throttling SQS | Retry com backoff |
| **Permanente** | Dados inválidos, Violação constraints | Dead letter queue |

## Licença

MIT