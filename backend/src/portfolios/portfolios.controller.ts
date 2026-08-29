import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';
import { PortfolioQueryDto } from './dto/portfolio-query.dto';

@ApiTags('Portfolios')
@Controller()
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @Get(['v1/portfolios/:address', 'v1/portfolio/:address'])
  @ApiOperation({ summary: 'Get trade positions and aggregates for a trader address' })
  @ApiParam({ name: 'address', description: 'Trader wallet address (0x...)' })
  @ApiResponse({ status: 200, description: 'List of positions aggregated per curve' })
  async getPortfolioByParam(@Param('address') address: string) {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new BadRequestException('invalid address');
    }
    return this.portfoliosService.getPortfolio(address);
  }

  @Get(['v1/portfolios', 'v1/portfolio'])
  @ApiOperation({ summary: 'Get trade positions via query param ?address=0x...' })
  @ApiResponse({ status: 200, description: 'List of positions aggregated per curve' })
  async getPortfolioByQuery(@Query() query: PortfolioQueryDto) {
    if (!query.address || !/^0x[0-9a-fA-F]{40}$/.test(query.address)) {
      throw new BadRequestException('invalid address');
    }
    return this.portfoliosService.getPortfolio(query.address);
  }
}
