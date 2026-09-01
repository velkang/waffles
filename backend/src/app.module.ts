import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { LaunchesModule } from './launches/launches.module';
import { TradesModule } from './trades/trades.module';
import { CandlesModule } from './candles/candles.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { UploadsModule } from './uploads/uploads.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RewardsModule } from './rewards/rewards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('rateLimit.ttlMs', 60000),
          limit: config.get<number>('rateLimit.limit', 200),
        },
      ],
    }),
    DatabaseModule,
    HealthModule,
    LaunchesModule,
    TradesModule,
    CandlesModule,
    PortfoliosModule,
    UploadsModule,
    RealtimeModule,
    RewardsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
