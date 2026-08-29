import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { DatabaseService } from '../src/database/database.service';
import { RealtimeService } from '../src/realtime/realtime.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  const mockDatabaseService = {
    isHealthy: jest.fn().mockResolvedValue(true),
  };
  const mockRealtimeService = {
    isHealthy: jest.fn().mockReturnValue(true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: RealtimeService,
          useValue: mockRealtimeService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health/live returns 200 OK', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('uptime');
      });
  });

  it('GET /health/ready returns 200 OK when DB is healthy', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.db).toBe('connected');
        expect(res.body.realtime).toBe('connected');
      });
  });

  it('GET /health/ready returns 503 when DB check fails', () => {
    mockDatabaseService.isHealthy.mockResolvedValueOnce(false);
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
  });

  it('GET /health/ready returns 503 when realtime watchers are unavailable', () => {
    mockRealtimeService.isHealthy.mockReturnValueOnce(false);
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
  });
});
