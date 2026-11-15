import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { TestPresentationModule } from './test-presentation.module';
import { HealthController } from '../src/presentation/controllers/health.controller';
import { Wallet } from '../src/domain/entities/wallet.entity';
import { WagerTransaction } from '../src/domain/entities/wager-transaction.entity';
import { LedgerEntry } from '../src/domain/entities/ledger-entry.entity';
import { OutboxEvent } from '../src/domain/entities/outbox-event.entity';
import { InboxMessage } from '../src/domain/entities/inbox-message.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DATABASE_HOST', 'localhost'),
        port: configService.get('DATABASE_PORT', 5432),
        username: configService.get('DATABASE_USERNAME', 'postgres'),
        password: configService.get('DATABASE_PASSWORD', 'postgres'),
        database: configService.get('DATABASE_NAME', 'wagering'),
        entities: [Wallet, WagerTransaction, LedgerEntry, OutboxEvent, InboxMessage],
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
        namingStrategy: new SnakeNamingStrategy(),
        extra: {
          max: 20,
        },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    TerminusModule,
    TestPresentationModule,
  ],
  controllers: [HealthController],
})
export class TestAppModule {}