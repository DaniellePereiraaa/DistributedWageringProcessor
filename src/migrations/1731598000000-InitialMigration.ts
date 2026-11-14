import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class InitialMigration1731598000000 implements MigrationInterface {
  name = 'InitialMigration1731598000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create wallets table
    await queryRunner.createTable(
      new Table({
        name: 'wallets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'player_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'balance',
            type: 'numeric',
            precision: 19,
            scale: 4,
            default: '0.0000',
          },
          {
            name: 'version',
            type: 'int',
            default: 1,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create unique index on player_id + currency
    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'IDX_wallets_player_currency',
        columnNames: ['player_id', 'currency'],
        isUnique: true,
      }),
    );

    // Create wager_transactions table
    await queryRunner.createTable(
      new Table({
        name: 'wager_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'wallet_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'kind',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'PENDING'",
          },
          {
            name: 'reference_transaction_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'idempotency_key',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'consumer_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'message_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for wager_transactions
    await queryRunner.createIndex(
      'wager_transactions',
      new TableIndex({
        name: 'IDX_wager_transactions_wallet_id',
        columnNames: ['wallet_id'],
      }),
    );

    await queryRunner.createIndex(
      'wager_transactions',
      new TableIndex({
        name: 'IDX_wager_transactions_idempotency_key',
        columnNames: ['idempotency_key'],
        isUnique: true,
        where: 'idempotency_key IS NOT NULL',
      }),
    );

    await queryRunner.createIndex(
      'wager_transactions',
      new TableIndex({
        name: 'IDX_wager_transactions_reference',
        columnNames: ['reference_transaction_id'],
      }),
    );

    await queryRunner.createIndex(
      'wager_transactions',
      new TableIndex({
        name: 'IDX_wager_transactions_status',
        columnNames: ['status'],
      }),
    );

    // Foreign key for wager_transactions -> wallets
    await queryRunner.createForeignKey(
      'wager_transactions',
      new TableForeignKey({
        columnNames: ['wallet_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'wallets',
        onDelete: 'RESTRICT',
      }),
    );

    // Create ledger_entries table
    await queryRunner.createTable(
      new Table({
        name: 'ledger_entries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'wallet_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'transaction_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'entry_type',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'balance_before',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'balance_after',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Indexes for ledger_entries
    await queryRunner.createIndex(
      'ledger_entries',
      new TableIndex({
        name: 'IDX_ledger_entries_wallet_id',
        columnNames: ['wallet_id'],
      }),
    );

    await queryRunner.createIndex(
      'ledger_entries',
      new TableIndex({
        name: 'IDX_ledger_entries_transaction_id',
        columnNames: ['transaction_id'],
      }),
    );

    await queryRunner.createIndex(
      'ledger_entries',
      new TableIndex({
        name: 'IDX_ledger_entries_created_at',
        columnNames: ['created_at'],
      }),
    );

    // Foreign keys for ledger_entries
    await queryRunner.createForeignKey(
      'ledger_entries',
      new TableForeignKey({
        columnNames: ['wallet_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'wallets',
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'ledger_entries',
      new TableForeignKey({
        columnNames: ['transaction_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'wager_transactions',
        onDelete: 'RESTRICT',
      }),
    );

    // Create outbox_events table
    await queryRunner.createTable(
      new Table({
        name: 'outbox_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'aggregate_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'aggregate_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'correlation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'causation_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'processed_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Indexes for outbox_events
    await queryRunner.createIndex(
      'outbox_events',
      new TableIndex({
        name: 'IDX_outbox_events_processed',
        columnNames: ['processed_at'],
      }),
    );

    await queryRunner.createIndex(
      'outbox_events',
      new TableIndex({
        name: 'IDX_outbox_events_created_at',
        columnNames: ['created_at'],
      }),
    );

    // Create inbox_messages table
    await queryRunner.createTable(
      new Table({
        name: 'inbox_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'message_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'consumer_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'processed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Unique index for idempotency (message_id + consumer_name)
    await queryRunner.createIndex(
      'inbox_messages',
      new TableIndex({
        name: 'IDX_inbox_messages_idempotency',
        columnNames: ['message_id', 'consumer_name'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'inbox_messages',
      new TableIndex({
        name: 'IDX_inbox_messages_processed',
        columnNames: ['processed_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order
    await queryRunner.dropTable('inbox_messages');
    await queryRunner.dropTable('outbox_events');
    await queryRunner.dropTable('ledger_entries');
    await queryRunner.dropTable('wager_transactions');
    await queryRunner.dropTable('wallets');
  }
}