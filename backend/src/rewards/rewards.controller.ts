import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RewardsService } from './rewards.service';

@Controller('v1/rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('current')
  getCurrent(@Query('address') address?: string) {
    return this.rewards.getCurrent(address && this.requireAddress(address));
  }

  @Get('leaderboard')
  getLeaderboard(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.rewards.getLeaderboard(limit);
  }

  @Get('epochs')
  getPastEpochs(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.rewards.getPastEpochs(limit);
  }

  @Get('claims/:address')
  getClaims(@Param('address') address: string) {
    return this.rewards.getClaims(this.requireAddress(address));
  }

  private requireAddress(address: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new BadRequestException('Invalid EVM address');
    return address.toLowerCase();
  }
}
