import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LaunchesService } from './launches.service';
import { LaunchesQueryDto } from './dto/launches-query.dto';

@ApiTags('Launches')
@Controller('v1/launches')
export class LaunchesController {
  constructor(private readonly launchesService: LaunchesService) {}

  @Get()
  @ApiOperation({ summary: 'Get list of launches or single launch if token param is provided' })
  @ApiResponse({ status: 200, description: 'Launches list or single launch response' })
  async getLaunches(@Query() query: LaunchesQueryDto) {
    return this.launchesService.getLaunches(query);
  }

  @Get(':token')
  @ApiOperation({ summary: 'Get single launch details by token contract address' })
  @ApiParam({ name: 'token', description: 'Token contract address (0x...)' })
  @ApiResponse({ status: 200, description: 'Launch summary details' })
  async getLaunchByToken(@Param('token') token: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      throw new BadRequestException('invalid token');
    }
    return this.launchesService.getLaunchByToken(token);
  }
}
