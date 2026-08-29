import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { RealtimeService } from '../realtime/realtime.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe to check if the process is running' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  getLive() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe to verify database and services are connected' })
  @ApiResponse({ status: 200, description: 'Application is ready to serve traffic' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async getReady() {
    const dbOk = await this.dbService.isHealthy();
    const realtimeOk = this.realtimeService.isHealthy();
    if (!dbOk || !realtimeOk) {
      throw new HttpException(
        {
          status: 'unavailable',
          message: !dbOk
            ? 'Database connection check failed'
            : 'Realtime change streams are not ready',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ok',
      db: 'connected',
      realtime: 'connected',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Realtime gateway operational metrics' })
  getMetrics() {
    return this.realtimeService.getMetrics();
  }
}
