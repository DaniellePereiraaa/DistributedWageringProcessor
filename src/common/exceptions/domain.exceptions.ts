export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'DomainException';
    Object.setPrototypeOf(this, DomainException.prototype);
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(available: string, requested: string) {
    super(
      `Insufficient funds. Available: ${available}, Requested: ${requested}`,
      'INSUFFICIENT_FUNDS',
      400
    );
    this.name = 'InsufficientFundsException';
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(key: string, existingMessageId: string) {
    super(
      `Idempotency key conflict. Key "${key}" already used for message ${existingMessageId} with different payload`,
      'IDEMPOTENCY_CONFLICT',
      409
    );
    this.name = 'IdempotencyConflictException';
  }
}

export class DuplicateMessageException extends DomainException {
  constructor(messageId: string, consumerName: string) {
    super(
      `Duplicate message detected. Message ${messageId} already processed by ${consumerName}`,
      'DUPLICATE_MESSAGE',
      409
    );
    this.name = 'DuplicateMessageException';
  }
}

export class WalletNotFoundException extends DomainException {
  constructor(walletId: string) {
    super(`Wallet not found: ${walletId}`, 'WALLET_NOT_FOUND', 404);
    this.name = 'WalletNotFoundException';
  }
}

export class TransactionNotFoundException extends DomainException {
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`, 'TRANSACTION_NOT_FOUND', 404);
    this.name = 'TransactionNotFoundException';
  }
}

export class ReferencedTransactionNotFoundException extends DomainException {
  constructor(referencedTransactionId: string) {
    super(
      `Referenced transaction not found: ${referencedTransactionId}. Refund/rollback requires valid reference.`,
      'REFERENCED_TRANSACTION_NOT_FOUND',
      400
    );
    this.name = 'ReferencedTransactionNotFoundException';
  }
}

export class ReferencedTransactionNotProcessedException extends DomainException {
  constructor(referencedTransactionId: string, status: string) {
    super(
      `Referenced transaction ${referencedTransactionId} is not in PROCESSED status (current: ${status}). Cannot process refund/rollback.`,
      'REFERENCED_TRANSACTION_NOT_PROCESSED',
      400
    );
    this.name = 'ReferencedTransactionNotProcessedException';
  }
}

export class InvalidTransactionStateException extends DomainException {
  constructor(transactionId: string, currentState: string, expectedStates: string[]) {
    super(
      `Transaction ${transactionId} is in ${currentState} state. Expected one of: ${expectedStates.join(', ')}`,
      'INVALID_TRANSACTION_STATE',
      400
    );
    this.name = 'InvalidTransactionStateException';
  }
}

export class OptimisticLockException extends DomainException {
  constructor(entity: string, id: string) {
    super(
      `Optimistic lock failed for ${entity} ${id}. Entity was modified by another process.`,
      'OPTIMISTIC_LOCK_FAILED',
      409
    );
    this.name = 'OptimisticLockException';
  }
}

export class InvalidCurrencyException extends DomainException {
  constructor(currency: string) {
    super(`Invalid currency: ${currency}. Must be a valid ISO 4217 code.`, 'INVALID_CURRENCY', 400);
    this.name = 'InvalidCurrencyException';
  }
}

export class ReconciliationMismatchException extends DomainException {
  constructor(walletId: string, stored: string, calculated: string) {
    super(
      `Reconciliation mismatch for wallet ${walletId}. Stored: ${stored}, Calculated: ${calculated}`,
      'RECONCILIATION_MISMATCH',
      400
    );
    this.name = 'ReconciliationMismatchException';
  }
}

export class TransientException extends DomainException {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message, 'TRANSIENT_ERROR', 503);
    this.name = 'TransientException';
  }
}

export class PermanentException extends DomainException {
  constructor(message: string) {
    super(message, 'PERMANENT_ERROR', 500);
    this.name = 'PermanentException';
  }
}