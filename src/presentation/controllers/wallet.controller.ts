import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Header,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '@/application/use-cases/process-wager-transaction.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { ReconciliationUseCase } from '@/application/use-cases/reconciliation.use-case';
import {
  CreateWalletDto,
  WalletResponseDto,
  CreateWagerTransactionDto,
  WagerTransactionResponseDto,
  PaginatedLedgerResponseDto,
  LedgerEntryResponseDto,
  ReconciliationResponseDto,
} from '@/presentation/dtos/wallet.dto';
import { Wallet } from '@/domain/entities/wallet.entity';
import { WagerTransaction } from '@/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '@/domain/entities/ledger-entry.entity';
import { TransactionStatus } from '@/domain/entities/wager-transaction.entity';

@ApiTags('Wallets')
@Controller()
export class WalletController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly processTransactionUseCase: ProcessWagerTransactionUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly reconciliationUseCase: ReconciliationUseCase
  ) {}

  @Post('wallets')
  @ApiOperation({ summary: 'Create a new wallet with initial OPENING transaction' })
  @ApiResponse({ status: 201, type: WalletResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or wallet already exists' })
  @ApiResponse({ status: 409, description: 'Wallet already exists for player/currency' })
  async createWallet(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    const result = await this.createWalletUseCase.execute({
      playerId: dto.playerId,
      currency: dto.currency,
      initialAmount: dto.initialAmount,
    });

    return this.mapWalletToResponse(result.wallet);
  }

  @Get('wallets/:id')
  @ApiOperation({ summary: 'Get wallet by ID' })
  @ApiResponse({ status: 200, type: WalletResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWallet(@Param('id') id: string): Promise<WalletResponseDto> {
    const result = await this.getWalletUseCase.getWallet(id);
    return this.mapWalletToResponse(result.wallet);
  }

  @Get('wallets/:id/ledger')
  @ApiOperation({ summary: 'Get wallet ledger entries with cursor pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (ISO timestamp)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of entries per page (max 100)', example: 50 })
  @ApiResponse({ status: 200, type: PaginatedLedgerResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletLedger(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number
  ): Promise<PaginatedLedgerResponseDto> {
    const result = await this.getWalletUseCase.getWalletLedger(
      id,
      cursor,
      Math.min(limit || 50, 100)
    );

    return {
      entries: result.entries.map(this.mapLedgerEntryToResponse),
      nextCursor: result.nextCursor || undefined,
    };
  }

  @Get('wallets/:id/transactions')
  @ApiOperation({ summary: 'Get wallet transactions with pagination' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  @ApiQuery({ name: 'status', required: false, enum: TransactionStatus })
  @ApiResponse({ status: 200, type: [WagerTransactionResponseDto] })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletTransactions(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('status') status?: TransactionStatus
  ) {
    const result = await this.getWalletUseCase.getWalletTransactions(id, {
      limit: Math.min(limit || 50, 100),
      offset: offset || 0,
      status,
    });

    return {
      transactions: result.transactions.map(this.mapTransactionToResponse),
      total: result.total,
    };
  }

  @Post('wagering/transactions')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Submit a wagering transaction (BET, WIN, LOSS, REFUND, ROLLBACK)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key for idempotency (required)',
    required: true,
  })
  @ApiResponse({ status: 202, type: WagerTransactionResponseDto, description: 'Transaction accepted for processing' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Idempotency key conflict' })
  async createWagerTransaction(
    @Body() dto: CreateWagerTransactionDto,
    @Req() req: Request
  ): Promise<WagerTransactionResponseDto> {
    // Idempotency-Key header is required but we also accept it in body for flexibility
    const idempotencyKey = req.headers['idempotency-key'] as string || dto.idempotencyKey;

    if (!idempotencyKey) {
      throw new Error('Idempotency-Key header is required');
    }

    // For async processing via SQS, we would publish to queue here
    // For now, process directly (sync) - in production this would be async
    const result = await this.processTransactionUseCase.execute({
      walletId: dto.walletId,
      kind: dto.kind,
      amount: dto.amount,
      idempotencyKey,
      referenceTransactionId: dto.referenceTransactionId,
      description: dto.description,
      metadata: dto.metadata,
      consumerName: 'api',
      messageId: `api-${idempotencyKey}`,
    });

    return this.mapTransactionToResponse(result.transaction);
  }

  @Post('wallets/:id/reconciliation')
  @ApiOperation({ summary: 'Reconcile wallet balance against ledger' })
  @ApiResponse({ status: 200, type: ReconciliationResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  @ApiResponse({ status: 400, description: 'Reconciliation mismatch' })
  async reconcileWallet(@Param('id') id: string): Promise<ReconciliationResponseDto> {
    const result = await this.reconciliationUseCase.execute(id);
    return result;
  }

  private mapWalletToResponse(wallet: Wallet): WalletResponseDto {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balance: wallet.balance.toString(),
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  private mapTransactionToResponse(tx: WagerTransaction): WagerTransactionResponseDto {
    return {
      id: tx.id,
      walletId: tx.walletId,
      kind: tx.kind,
      amount: tx.amount.toString(),
      status: tx.status,
      referenceTransactionId: tx.referenceTransactionId || undefined,
      idempotencyKey: tx.idempotencyKey || undefined,
      description: tx.description || undefined,
      metadata: tx.metadata || undefined,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }

  private mapLedgerEntryToResponse(entry: LedgerEntry): LedgerEntryResponseDto {
    return {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      entryType: entry.entryType,
      amount: entry.amount.toString(),
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    };
  }
}