import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TradesService } from './trades.service';
import { TradesQueryDto } from './dto/trades-query.dto';

@ApiTags('Trades')
@Controller('v1/trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get()
  @ApiOperation({ summary: 'Get on-chain trade history for a token' })
  @ApiResponse({ status: 200, description: 'List of historical trades' })
  async getTrades(@Query() query: TradesQueryDto) {
    return this.tradesService.getTrades(query);
  }
}
