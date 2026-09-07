import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { AnalyticsRange } from '@waffles/shared';
import { AnalyticsService } from './analytics.service';

class AnalyticsQuery {
  @IsOptional()
  @IsIn(['24h', '7d', '30d', 'all'])
  range: AnalyticsRange = '24h';
}

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  getAnalytics(@Query() query: AnalyticsQuery) {
    return this.analytics.getAnalytics(query.range ?? '24h');
  }
}
