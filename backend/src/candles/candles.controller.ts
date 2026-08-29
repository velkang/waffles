import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CandlesService } from './candles.service';
import { CandlesQueryDto } from './dto/candles-query.dto';

@ApiTags('Candles')
@Controller('v1/candles')
export class CandlesController {
  constructor(private readonly candlesService: CandlesService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregated OHLCV candle data for price chart' })
  @ApiResponse({ status: 200, description: 'List of OHLCV candles' })
  async getCandles(@Query() query: CandlesQueryDto) {
    return this.candlesService.getCandles(query);
  }
}
