import { RealtimeService } from '../src/realtime/realtime.service';
import { DatabaseService } from '../src/database/database.service';
import { LaunchesService } from '../src/launches/launches.service';
import { ConfigService } from '@nestjs/config';
import { buildEventId, SseEnvelope } from '@waffles/shared';
import { firstValueFrom, toArray, take } from 'rxjs';
import { EventEmitter } from 'node:events';

describe('RealtimeService & SSE Gateway Tests', () => {
  let service: RealtimeService;
  let mockDbService: Partial<DatabaseService>;
  let mockConfigService: Partial<ConfigService>;
  let mockLaunchesService: Partial<LaunchesService>;

  beforeEach(() => {
    mockDbService = {
      getDb: jest.fn().mockReturnValue({}),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('arc-testnet'),
    };
    mockLaunchesService = {
      enrichLaunches: jest.fn().mockResolvedValue([]),
    };

    service = new RealtimeService(
      mockDbService as DatabaseService,
      mockConfigService as ConfigService,
      mockLaunchesService as LaunchesService,
    );
  });

  describe('Deterministic Event ID Generation', () => {
    it('builds canonical blockchain event ID when block and log index are provided', () => {
      const id = buildEventId('arc-testnet', 123456, 7, 'trade.upserted');
      expect(id).toBe('arc-testnet:123456:7:trade.upserted');
    });

    it('includes a change suffix so corrected upserts do not collide', () => {
      const first = buildEventId('arc-testnet', 123456, 7, 'trade.upserted', 'change-a');
      const second = buildEventId('arc-testnet', 123456, 7, 'trade.upserted', 'change-b');
      expect(first).not.toBe(second);
    });

    it('builds unique event ID for system events without logIndex', () => {
      const id = buildEventId('arc-testnet', undefined, undefined, 'system.resync');
      expect(id).toMatch(/^arc-testnet:\d+:[a-z0-9]+:system\.resync/);
    });
  });

  describe('Watcher startup', () => {
    it('awaits the database connection before creating change streams', async () => {
      const streams = Array.from({ length: 3 }, () => {
        const stream = new EventEmitter() as EventEmitter & { close: jest.Mock };
        stream.close = jest.fn().mockResolvedValue(undefined);
        return stream;
      });
      const db = {
        collection: jest.fn().mockImplementation(() => ({
          watch: jest.fn().mockReturnValue(streams.shift()),
        })),
      };
      mockDbService.connect = jest.fn().mockResolvedValue(db);

      await service.startWatching();

      expect(mockDbService.connect).toHaveBeenCalledTimes(1);
      expect(db.collection).toHaveBeenCalledTimes(3);
      expect(service.isHealthy()).toBe(true);
      await service.stopWatching();
    });
  });

  describe('Replay Buffer & Last-Event-ID', () => {
    it('stores published events and replays events after requested Last-Event-ID', () => {
      const event1: SseEnvelope = {
        id: 'arc-testnet:100:1:trade.upserted',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        data: { trade: 1 },
      };
      const event2: SseEnvelope = {
        id: 'arc-testnet:100:2:trade.upserted',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        data: { trade: 2 },
      };

      service.publish(event1);
      service.publish(event2);

      const replayResult = service.getReplayEventsAfter('arc-testnet:100:1:trade.upserted');
      expect(replayResult.canReplay).toBe(true);
      expect(replayResult.replayed).toHaveLength(1);
      expect(replayResult.replayed[0].id).toBe('arc-testnet:100:2:trade.upserted');
    });

    it('returns canReplay=false if Last-Event-ID is not found in the buffer', () => {
      const replayResult = service.getReplayEventsAfter('non-existent-id');
      expect(replayResult.canReplay).toBe(false);
      expect(replayResult.replayed).toHaveLength(0);
    });

    it('filters replayed events to the reconnecting subscriber topics', () => {
      service.publish({
        id: 'cursor',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        token: '0x1111111111111111111111111111111111111111',
        data: {},
      });
      service.publish({
        id: 'other-token',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        token: '0x9999999999999999999999999999999999999999',
        data: {},
      });
      service.publish({
        id: 'target-token',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        token: '0x1111111111111111111111111111111111111111',
        data: {},
      });

      const result = service.getReplayEventsAfter('cursor', [
        'token:0x1111111111111111111111111111111111111111',
      ]);
      expect(result.replayed.map((event) => event.id)).toEqual(['target-token']);
    });
  });

  describe('Topic Filtering', () => {
    it('delivers token-specific trades to matching token topic subscriber', (done) => {
      const observable = service.getEventsObservable({
        topics: ['token:0x1111111111111111111111111111111111111111'],
      });

      const subscription = observable.subscribe((event) => {
        expect(event.token).toBe('0x1111111111111111111111111111111111111111');
        expect(event.type).toBe('trade.upserted');
        subscription.unsubscribe();
        done();
      });

      // Publish an event for another token (should be filtered out)
      service.publish({
        id: 'evt-other',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        token: '0x9999999999999999999999999999999999999999',
        data: {},
      });

      // Publish event for target token
      service.publish({
        id: 'evt-target',
        schemaVersion: 1,
        type: 'trade.upserted',
        occurredAt: new Date().toISOString(),
        token: '0x1111111111111111111111111111111111111111',
        data: {},
      });
    });

    it('always delivers system.resync and heartbeat events regardless of topic filters', (done) => {
      const observable = service.getEventsObservable({
        topics: ['token:0x1111111111111111111111111111111111111111'],
      });

      const subscription = observable.subscribe((event) => {
        expect(event.type).toBe('system.resync');
        subscription.unsubscribe();
        done();
      });

      service.publish({
        id: 'resync-1',
        schemaVersion: 1,
        type: 'system.resync',
        occurredAt: new Date().toISOString(),
        data: { reason: 'reorg' },
      });
    });
  });
});
