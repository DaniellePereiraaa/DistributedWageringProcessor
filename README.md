# Distributed Wagering Processor

**Jungle Gaming Backend Challenge** - A distributed wagering processor built with NestJS, TypeScript, PostgreSQL, and SQS (LocalStack).

## Architecture Overview

This system implements a financially correct, concurrent, and resilient wagering processor with:

- **Financial Correctness**: Immutable `Money` value object (decimal strings, 2dp), no floats
- **Concurrency**: Pessimistic locking per `walletId` (unit of concurrency), optimistic locking via version column
- **Idempotency**: Persistent deduplication via `Idempotency-Key` header and Inbox table
- **Consistency**: Wallet balance, Ledger, Inbox, and Outbox updated in single SQL transaction
- **Ordering**: Out-of-order message handling via `PENDING_REFERENCE` status and retry worker

## Tech Stack

- **Framework**: NestJS 10 with TypeScript
- **Runtime**: Bun (fast Node.js alternative)
- **Database**: PostgreSQL 16 with TypeORM
- **Messaging**: SQS via LocalStack (AWS compatible)
- **Containerization**: Docker Compose
- **Testing**: Jest (unit tests + architecture validation tests)

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Bun (optional, for local development without Docker)

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f app

# Stop services
docker-compose down
```

The API will be available at:
- **API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health/live | /ready

### Local Development

```bash
# Install dependencies
bun install

# Start PostgreSQL and LocalStack only
docker-compose up -d postgres localstack

# Run migrations
bun run db:migrate

# Start development server
bun run start:dev
```

## API Endpoints

All endpoints are under the root path (no `/api` prefix).

### Wallets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wallets` | Create wallet with initial OPENING transaction |
| GET | `/wallets/:id` | Get wallet by ID |
| GET | `/wallets/:id/ledger` | Get ledger entries (cursor pagination) |
| GET | `/wallets/:id/transactions` | Get wallet transactions |

### Wagering

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wagering/transactions` | Submit transaction (requires `Idempotency-Key` header) |

### Reconciliation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wallets/:id/reconciliation` | Compare stored vs calculated balance |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |

## Transaction Kinds

| Kind | Type | Ledger | Description |
|------|------|--------|-------------|
| `BET` | Debit | Yes | Player places a bet |
| `WIN` | Credit | Yes | Player wins |
| `LOSS` | None | No | Player loses (no balance change) |
| `REFUND` | Credit | Yes | Refund a previous BET |
| `ROLLBACK` | Debit | Yes | Rollback a REFUND |
| `OPENING` | Credit | Yes | Initial wallet funding |

## Idempotency

All wagering transactions require an `Idempotency-Key` header:

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "walletId": "uuid",
    "kind": "BET",
    "amount": "50.00",
    "idempotencyKey": "unique-key-123"
  }'
```

- Same key + same payload = returns existing result (202)
- Same key + different payload = 409 Conflict
- Keys are stored persistently in Inbox table (composite key: consumerName + messageId)

## Concurrency Handling

The system handles concurrent transactions on the same wallet using:

1. **Pessimistic Locking**: `SELECT ... FOR UPDATE SKIP LOCKED` on wallet row during transaction processing
2. **Optimistic Locking**: Version column on Wallet entity for retry detection
3. **Unit of Concurrency**: `walletId` - different wallets process in parallel

## Out-of-Order Messages

REFUND/ROLLBACK transactions may arrive before their reference BET:

1. Transaction marked as `PENDING_REFERENCE`
2. Stored in database with reference ID
3. Retry worker polls every 30s and reprocesses when reference is available
4. Exponential backoff for repeated failures

## Running Tests

```bash
# Unit tests
bun run test

# Integration tests (requires Docker)
bun run test:e2e

# Coverage
bun run test:cov
```

## Project Structure

```
src/
├── app.module.ts           # Main application module
├── main.ts                 # Entry point
├── data-source.ts          # TypeORM CLI data source
├── common/
│   ├── value-objects/      # Money value object
│   ├── exceptions/         # Domain exceptions
│   └── utils/              # Transactional outbox utilities
├── domain/
│   └── entities/           # Wallet, WagerTransaction, LedgerEntry, InboxMessage, OutboxEvent
├── application/
│   └── use-cases/          # Business logic use cases
├── infrastructure/
│   ├── persistence/
│   │   └── typeorm/        # TypeORM repositories
│   └── messaging/
│       └── sqs/            # SQS Consumer, Outbox Worker, Retry Worker
└── presentation/
    ├── controllers/        # REST controllers
    ├── dtos/               # Data transfer objects
    └── presentation.module.ts
```

## Configuration

Environment variables (`.env`):

```env
# Application
NODE_ENV=development
PORT=3000

# Database
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

## Complete Usage Examples

### 1. Create a Wallet

```bash
curl -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "player-123",
    "currency": "BRL",
    "initialAmount": "100.00"
  }'
```

Response (201):
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

### 2. Place a Bet (BET)

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: bet-001" \
  -d '{
    "walletId": "WALLET_UUID_FROM_STEP_1",
    "kind": "BET",
    "amount": "25.00",
    "idempotencyKey": "bet-001",
    "description": "Bet on game 123",
    "metadata": { "gameId": "game-123" }
  }'
```

Response (202):
```json
{
  "id": "TRANSACTION_UUID",
  "walletId": "WALLET_UUID",
  "kind": "BET",
  "amount": "25.00",
  "status": "PROCESSED",
  "referenceTransactionId": null,
  "idempotencyKey": "bet-001",
  "description": "Bet on game 123",
  "metadata": { "gameId": "game-123" },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### 3. Register a Win (WIN)

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: win-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "WIN",
    "amount": "50.00",
    "idempotencyKey": "win-001",
    "referenceTransactionId": "TRANSACTION_UUID_FROM_STEP_2",
    "description": "Win on game 123"
  }'
```

### 4. Register a Loss (LOSS) - No Ledger Entry

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: loss-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "LOSS",
    "amount": "25.00",
    "idempotencyKey": "loss-001",
    "referenceTransactionId": "TRANSACTION_UUID_FROM_STEP_2"
  }'
```

### 5. Refund a Bet (REFUND) - Out-of-Order Safe

```bash
# If reference transaction doesn't exist yet, goes to PENDING_REFERENCE
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund-001" \
  -d '{
    "walletId": "WALLET_UUID",
    "kind": "REFUND",
    "amount": "25.00",
    "idempotencyKey": "refund-001",
    "referenceTransactionId": "TRANSACTION_UUID_FROM_STEP_2"
  }'
```

### 6. Rollback a Refund (ROLLBACK)

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

### 7. Get Wallet Balance

```bash
curl http://localhost:3000/wallets/WALLET_UUID
```

### 8. Get Ledger Entries (Cursor Pagination)

```bash
# First page
curl "http://localhost:3000/wallets/WALLET_UUID/ledger?limit=50"

# Next page (use nextCursor from previous response)
curl "http://localhost:3000/wallets/WALLET_UUID/ledger?cursor=2024-01-15T10:30:00.000Z&limit=50"
```

### 9. Get Wallet Transactions

```bash
curl "http://localhost:3000/wallets/WALLET_UUID/transactions?limit=50&offset=0&status=PROCESSED"
```

### 10. Reconcile Wallet (Validate Balance)

```bash
curl -X POST http://localhost:3000/wallets/WALLET_UUID/reconciliation
```

Response (200 - matched):
```json
{
  "walletId": "WALLET_UUID",
  "storedBalance": "125.00",
  "calculatedBalance": "125.00",
  "matched": true,
  "lastLedgerEntryDate": "2024-01-15T10:35:00.000Z"
}
```

Response (400 - mismatch):
```json
{
  "statusCode": 400,
  "message": "Reconciliation mismatch for wallet WALLET_UUID: stored=125.00, calculated=120.00",
  "error": "Bad Request"
}
```

## Architecture Deep Dive

### Transactional Flow (Create Wallet)

```
HTTP Request
    │
    ▼
CreateWalletUseCase.execute()
    │
    ├── TypeORM Transaction begins
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
OutboxWorker (async, separate process)
    │
    ├── SELECT * FROM outbox_events WHERE processed_at IS NULL FOR UPDATE SKIP LOCKED
    │
    ├── Publish to SQS
    │
    └── UPDATE outbox_events SET processed_at=NOW() WHERE id IN (...)
```

### Concurrent BET Processing

```
Request 1 (BET 50.00)          Request 2 (BET 30.00)          Request 3 (WIN 100.00)
     │                              │                              │
     ▼                              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TypeORM Transaction                              │
│  SELECT * FROM wallets WHERE id=? FOR UPDATE SKIP LOCKED           │
│  ─────────────────────────────────────────────────────────────     │
│  Request 1 gets lock, Request 2 & 3 wait                           │
│  Request 1: balance 100→50, creates ledger, outbox, inbox          │
│  COMMIT                                                             │
│  ─────────────────────────────────────────────────────────────     │
│  Request 2 gets lock, Request 3 waits                              │
│  Request 2: balance 50→20, creates ledger, outbox, inbox           │
│  COMMIT                                                             │
│  ─────────────────────────────────────────────────────────────     │
│  Request 3 gets lock                                               │
│  Request 3: balance 20→120, creates ledger, outbox, inbox          │
│  COMMIT                                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Out-of-Order REFUND Handling

```
Timeline:
────────────────────────────────────────────────────────────────────►

T1: BET arrives → PROCESSED (balance 100→50)

T2: REFUND arrives BEFORE BET (race condition)
    → Creates transaction with status=PENDING_REFERENCE
    → Stores referenceTransactionId
    → Does NOT touch wallet balance yet

T3: BET arrives (or was processed at T1)
    → PROCESSED

T4: Retry Worker (polls every 30s)
    → Finds REFUND with PENDING_REFERENCE
    → Checks if reference BET is PROCESSED
    → If yes: reprocesses REFUND → PROCESSED (balance 50→75)
    → If no: keeps as PENDING_REFERENCE for next poll
```

## Error Classification

| Category | Examples | Handling |
|----------|----------|----------|
| **Business** | Insufficient balance, Wallet not found, Idempotency conflict | Return 4xx, no retry |
| **Transient** | DB deadlock, Network timeout, SQS throttling | Retry with backoff |
| **Permanent** | Invalid data, Constraint violations | Dead letter queue |

## License

MIT