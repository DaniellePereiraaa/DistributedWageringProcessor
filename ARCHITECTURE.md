# Architecture Decision Records

## Overview

This document captures the key architectural decisions, trade-offs, and limitations for the Distributed Wagering Processor.

## Core Design Principles

1. **Financial Correctness First**: No floating-point for money, ever
2. **Consistency Over Availability**: Strong consistency within a wallet (CP in CAP)
3. **Explicit Over Implicit**: Clear transaction boundaries, no hidden side effects
4. **Resilience by Design**: Idempotency, retry logic, and graceful degradation built-in

---

## 1. Money Value Object

### Decision
Created an immutable `Money` value object using `decimal.js` for all financial calculations.

### Rationale
- JavaScript `number` uses IEEE 754 floats → precision errors (0.1 + 0.2 = 0.30000000000000004)
- Financial regulations require exact decimal arithmetic
- String-based input/output prevents accidental float conversion

### Implementation
```typescript
Money.fromString("100.50")  // Safe construction
money.add(other)            // Returns new Money (immutable)
money.toString()            // "100.50" (always 2dp)
```

### Trade-offs
- **Performance**: Decimal.js slower than native numbers (~10x)
- **Bundle size**: +50KB for decimal.js
- **Mitigation**: Acceptable for financial domain; not a hot path

---

## 2. Concurrency Control

### Decision
**Pessimistic locking** per `walletId` using `SELECT ... FOR UPDATE` within transaction.

### Rationale
- Unit of concurrency is `walletId` (not global)
- High contention on hot wallets (popular players)
- Pessimistic locking prevents retry storms under contention
- Optimistic locking (version column) as safety net for edge cases

### Implementation
```typescript
// In WalletRepository
async findByIdWithLock(id: string, manager: EntityManager): Promise<Wallet | null> {
  return manager
    .getRepository(Wallet)
    .createQueryBuilder('wallet')
    .setLock('pessimistic_write')
    .where('wallet.id = :id', { id })
    .getOne();
}
```

### Trade-offs
- **Latency**: Lock hold time = transaction duration
- **Throughput**: Serialized per wallet
- **Alternative considered**: Optimistic only - rejected due to high retry rates under contention
- **Deadlock prevention**: Consistent lock ordering (wallet → transaction → ledger → inbox → outbox)

---

## 3. Idempotency Strategy

### Decision
**Persistent Inbox Table** with composite key `(consumerName, messageId)` + idempotency key index.

### Rationale
- In-memory deduplication fails on restart/scale
- Distributed systems require persistent deduplication
- Consumer-side deduplication (not producer-side) handles redelivery

### Implementation
```sql
CREATE TABLE inbox_messages (
  consumer_name VARCHAR(100),
  message_id VARCHAR(255),
  idempotency_key VARCHAR(255),
  payload JSONB,
  status VARCHAR(50),
  PRIMARY KEY (consumer_name, message_id),
  UNIQUE (idempotency_key)
);
```

### Conflict Detection
- Same `Idempotency-Key` + different payload → 409 Conflict
- Same `consumerName` + `messageId` → Duplicate, return existing result

### Trade-offs
- **Storage**: Grows unbounded (add TTL/archival in production)
- **Latency**: Extra index lookup per request
- **Alternative**: Redis-based - rejected for durability requirements

---

## 4. Transactional Outbox Pattern

### Decision
Events written to `outbox_events` table **within same transaction** as domain changes. Separate worker publishes after commit.

### Rationale
- "Event before commit" = data loss on crash
- "Event after commit without outbox" = dual write problem
- Outbox guarantees at-least-once delivery

### Implementation
```typescript
// Within transaction:
await walletRepository.save(wallet, manager);
await transactionRepository.save(tx, manager);
await ledgerRepository.create(..., manager);
await outboxRepository.create('WalletBalanceChanged', {...}, manager);
await inboxRepository.save(inboxMsg, manager);
// COMMIT → then worker publishes
```

### Worker Safety
```sql
SELECT * FROM outbox_events 
WHERE processed_at IS NULL 
ORDER BY created_at 
FOR UPDATE SKIP LOCKED  -- Prevents duplicate processing
LIMIT 100;
```

### Trade-offs
- **Latency**: Event publication delayed by poll interval (1s default)
- **Complexity**: Additional worker process
- **Ordering**: Per-aggregate ordering preserved, global ordering not guaranteed

---

## 5. Out-of-Order Message Handling

### Decision
`PENDING_REFERENCE` status + scheduled retry worker with backoff.

### Rationale
- REFUND/ROLLBACK may arrive before BET (network reordering, retries)
- Cannot reject - would break idempotency
- Cannot block - would hold database connections

### Flow
```
1. REFUND arrives, reference BET not found/processed
2. Transaction marked PENDING_REFERENCE, saved to DB
3. Inbox marked PROCESSED (consumer ack)
4. Retry worker polls every 30s
5. When BET processed, RETRY worker reprocesses REFUND
6. REFUND succeeds, marked PROCESSED
```

### Trade-offs
- **Delay**: Up to 30s + processing time for out-of-order
- **Complexity**: Additional worker, state machine
- **Alternative**: Synchronous wait - rejected (connection pooling, timeout risks)

---

## 6. Database Schema Design

### Wallet
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  player_id VARCHAR(100) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  balance DECIMAL(19,2) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 0,  -- Optimistic lock
  UNIQUE (player_id, currency)
);
```

### WagerTransaction
```sql
CREATE TABLE wager_transactions (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  kind VARCHAR(20) NOT NULL,
  amount DECIMAL(19,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reference_transaction_id UUID REFERENCES wager_transactions(id),
  idempotency_key VARCHAR(255) UNIQUE,
  version INT NOT NULL DEFAULT 0
);
```

### LedgerEntry
```sql
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  transaction_id UUID UNIQUE REFERENCES wager_transactions(id),
  entry_type VARCHAR(10) NOT NULL,  -- DEBIT/CREDIT
  amount DECIMAL(19,2) NOT NULL,
  balance_before DECIMAL(19,2) NOT NULL,
  balance_after DECIMAL(19,2) NOT NULL
);
```

### Key Design Decisions
- **DECIMAL(19,2)**: Supports up to 999 trillion with 2dp (sufficient for gaming)
- **UUID**: Globally unique, no coordination needed
- **Version column**: Optimistic locking on all mutable entities
- **Foreign keys**: Enforce referential integrity
- **Indexes**: On `walletId+status`, `idempotencyKey`, `referenceTransactionId`

---

## 7. Error Classification

### Three-Tier Classification

| Category | Examples | Action |
|----------|----------|--------|
| **Business** | Insufficient funds, invalid reference, duplicate | Ack message, return error to client |
| **Transient** | DB deadlock, network blip, lock timeout | Nack (retry via visibility timeout) |
| **Permanent** | Malformed message, config error, bug | Send to DLQ, alert |

### Implementation
```typescript
// In SQS Consumer
catch (error) {
  if (error instanceof InsufficientFundsException) {
    await deleteMessage(message);  // Business - ack
  } else if (error instanceof TransientException) {
    // Don't delete - retry
  } else {
    await sendToDLQ(message);  // Permanent
  }
}
```

---

## 8. Health Checks

### Liveness (`/health/live`)
- Process is running
- No dependencies
- Used by Kubernetes to restart crashed pods

### Readiness (`/health/ready`)
- Database connectivity
- SQS connectivity
- Used by load balancer to route traffic

---

## 9. Limitations & Future Improvements

### Current Limitations

1. **No Horizontal Scaling of Workers**: Single consumer instance (can run multiple with SQS)
2. **Inbox/Outbox Growth**: No archival/cleanup job
3. **Limited Metrics**: Basic logging only (add Prometheus/OpenTelemetry)
4. **No Authentication**: API open (add JWT/API keys)
5. **Single Currency Per Wallet**: By design, but could support multi-currency
6. **No Rate Limiting**: Add per-player/IP limits
7. **SQS Polling Only**: No long-polling optimization in consumer

### Production Hardening Needed

1. **Migrations**: Use TypeORM migrations (not `synchronize`)
2. **Connection Pooling**: PgBouncer for high concurrency
3. **Observability**: Distributed tracing (Jaeger), metrics (Prometheus/Grafana)
4. **Security**: TLS, secrets management, audit logging
5. **Disaster Recovery**: Point-in-time recovery, cross-region replication
6. **Chaos Testing**: Failure injection, latency simulation

---

## 10. Trade-off Summary

| Decision | Benefit | Cost |
|----------|---------|------|
| Decimal.js Money | Financial correctness | Performance, bundle size |
| Pessimistic locking | No retry storms, simple | Serialization per wallet |
| Inbox table | Durable idempotency | Storage growth, extra query |
| Outbox pattern | No dual-write, reliable events | Eventual consistency (1s) |
| PENDING_REFERENCE | Handles reordering | Delayed processing, complexity |
| Version column | Optimistic safety net | Extra column, update overhead |

---

## 11. Testing Strategy

### Unit Tests
- Money value object arithmetic
- Domain entity state transitions
- Use case logic with mocked repositories

### Integration Tests (Testcontainers)
- Real PostgreSQL + LocalStack
- Full transaction flow
- Concurrency scenarios (50 parallel requests)
- Crash recovery (kill process mid-transaction)

### Concurrency Tests
- Hot wallet: 3+ instances, same walletId
- Duplicate idempotency: 50 parallel same key
- Out-of-order: REFUND before BET
- Recovery: Process crash mid-transaction

---

*Document version: 1.0*
*Last updated: 2024*