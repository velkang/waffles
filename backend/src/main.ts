import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3002);
  const environment = configService.get<string>('environment', 'development');
  const corsOrigins = configService.get<string[]>('corsOrigins', ['*']);

  // Security headers with Helmet (configured to allow Swagger UI and SSE)
  app.use(
    helmet({
      contentSecurityPolicy: environment === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    exposedHeaders: ['x-request-id', 'last-event-id'],
  });

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter and interceptors
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Waffles Meme Public API & Realtime Gateway')
    .setDescription(
      'Versioned REST API and Server-Sent Events (SSE) gateway for Waffles Meme on Arc L1.',
    )
    .setVersion('1.0.0')
    .addTag('Launches', 'Token launches and bonding curves')
    .addTag('Trades', 'On-chain trade transactions and history')
    .addTag('Candles', 'OHLCV aggregation and price chart data')
    .addTag('Portfolios', 'Trader positions and aggregate P&L stats')
    .addTag('Uploads', 'Cloudinary signed direct uploads')
    .addTag('Realtime', 'Server-Sent Events streaming gateway')
    .addTag('Health', 'Liveness and readiness health checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  logger.log(`🚀 Waffles API listening on http://localhost:${port}`);
  logger.log(`📖 OpenAPI documentation available at http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
