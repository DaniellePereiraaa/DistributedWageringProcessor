/**
 * Repository Injection Tokens
 * Using tokens instead of direct class injection to enable proper module sharing
 * and follow the Port/Adapter pattern for clean architecture
 */
export const REPOSITORY_TOKENS = {
  WALLET: 'WALLET_REPOSITORY',
  WAGER_TRANSACTION: 'WAGER_TRANSACTION_REPOSITORY',
  LEDGER_ENTRY: 'LEDGER_ENTRY_REPOSITORY',
  OUTBOX_EVENT: 'OUTBOX_EVENT_REPOSITORY',
  INBOX_MESSAGE: 'INBOX_MESSAGE_REPOSITORY',
} as const;

export type RepositoryToken = typeof REPOSITORY_TOKENS[keyof typeof REPOSITORY_TOKENS];