import { Module } from '@nestjs/common';
import { LaunchesController } from './launches.controller';
import { LaunchesService } from './launches.service';

@Module({
  controllers: [LaunchesController],
  providers: [LaunchesService],
  exports: [LaunchesService],
})
export class LaunchesModule {}
