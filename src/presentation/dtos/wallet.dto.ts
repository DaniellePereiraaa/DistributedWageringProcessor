import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumberString, MinLength, MaxLength } from 'class-validator';
import { Currency } from '../../domain/entities/wallet.entity';
import { TransactionKind } from '../../domain/entities/wager-transaction.entity';

export class CreateWalletDto {
  @ApiProperty({ description: 'Player unique identifier', example: 'player-123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  playerId: string;

  @ApiProperty({ description: 'Currency code (ISO 4217)', example: 'BRL', enum: Currency })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ description: 'Initial amount as string (avoids float precision)', example: '100.00' })
  @IsString()
  @IsNotEmpty()
  @IsNumberString({}, { message: 'Amount must be a valid decimal string' })
  initialAmount: string;
}

export class WalletResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'player-123' })
  playerId: string;

  @ApiProperty({ enum: Currency, example: Currency.BRL })
  currency: Currency;

  @ApiProperty({ example: '100.00' })
  balance: string;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class CreateWagerTransactionDto {
  @ApiProperty({ description: 'Wallet ID', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @ApiProperty({ description: 'Transaction kind', enum: TransactionKind, example: TransactionKind.BET })
  @IsEnum(TransactionKind)
  kind: TransactionKind;

  @ApiProperty({ description: 'Amount as string (avoids float precision)', example: '50.00' })
  @IsString()
  @IsNotEmpty()
  @IsNumberString({}, { message: 'Amount must be a valid decimal string' })
  amount: string;

  @ApiProperty({ description: 'Idempotency key for deduplication', example: 'idem-key-123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey: string;

  @ApiPropertyOptional({ description: 'Reference transaction ID (required for REFUND/ROLLBACK)', example: 'uuid' })
  @IsOptional()
  @IsString()
  referenceTransactionId?: string;

  @ApiPropertyOptional({ description: 'Transaction description', example: 'Bet on game 123' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Additional metadata', example: '{ "gameId": "game-123" }' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class WagerTransactionResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid' })
  walletId: string;

  @ApiProperty({ enum: TransactionKind, example: TransactionKind.BET })
  kind: TransactionKind;

  @ApiProperty({ example: '50.00' })
  amount: string;

  @ApiProperty({ enum: ['PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'], example: 'PROCESSED' })
  status: string;

  @ApiPropertyOptional({ example: 'uuid' })
  referenceTransactionId?: string;

  @ApiPropertyOptional({ example: 'idem-key-123' })
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'Bet on game 123' })
  description?: string;

  @ApiPropertyOptional({ example: '{ "gameId": "game-123" }' })
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  updatedAt: Date;
}

export class LedgerEntryResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid' })
  walletId: string;

  @ApiProperty({ example: 'uuid' })
  transactionId: string;

  @ApiProperty({ enum: ['DEBIT', 'CREDIT'], example: 'DEBIT' })
  entryType: string;

  @ApiProperty({ example: '50.00' })
  amount: string;

  @ApiProperty({ example: '100.00' })
  balanceBefore: string;

  @ApiProperty({ example: '50.00' })
  balanceAfter: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}

export class PaginatedLedgerResponseDto {
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  entries: LedgerEntryResponseDto[];

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  nextCursor?: string;
}

export class ReconciliationResponseDto {
  @ApiProperty({ example: 'uuid' })
  walletId: string;

  @ApiProperty({ example: '50.00' })
  storedBalance: string;

  @ApiProperty({ example: '50.00' })
  calculatedBalance: string;

  @ApiProperty({ example: true })
  matched: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  lastLedgerEntryDate?: string;

  @ApiPropertyOptional({ example: '0.00' })
  discrepancy?: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
  timestamp?: Date;

  @ApiPropertyOptional()
  checks?: Record<string, unknown>;
}