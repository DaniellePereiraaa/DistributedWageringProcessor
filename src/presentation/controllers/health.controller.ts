import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthCheckResult, HealthIndicatorResult } from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - indicates if process is running' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  @HealthCheck()
  async liveness() {
    return this.health.check([
      () => this.checkLiveness(),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - indicates if service can handle requests' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service not ready' })
  @HealthCheck()
  async readiness() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkSqs(),
    ]);
  }

  private async checkLiveness(): Promise<HealthIndicatorResult> {
    return {
      liveness: {
        status: 'up',
        timestamp: new Date().toISOString(),
      },
    };
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        database: {
          status: 'up',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        database: {
          status: 'down',
          timestamp: new Date().toISOString(),
          error: error.message,
        },
      };
    }
  }

  private async checkSqs(): Promise<HealthIndicatorResult> {
    // In a real implementation, you'd check SQS connectivity
    // For now, return up if endpoint is configured
    const sqsEndpoint = this.configService.get('SQS_ENDPOINT');
    return {
      sqs: {
        status: sqsEndpoint ? 'up' : 'down',
        timestamp: new Date().toISOString(),
        configured: !!sqsEndpoint,
      },
    };
  }
}