import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { DrandService } from './drand.service';
import { RewardsFinalizerService } from './rewards-finalizer.service';

@Module({
  controllers: [RewardsController],
  providers: [RewardsService, DrandService, RewardsFinalizerService],
  exports: [RewardsService, RewardsFinalizerService],
})
export class RewardsModule {}
