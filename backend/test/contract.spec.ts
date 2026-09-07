import { LaunchesService, LaunchDoc } from '../src/launches/launches.service';
import { TradesService, RawTradeDoc } from '../src/trades/trades.service';
import { CandlesService } from '../src/candles/candles.service';
import { PortfoliosService } from '../src/portfolios/portfolios.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { DatabaseService } from '../src/database/database.service';
import { ConfigService } from '@nestjs/config';
import { summarizeAnalytics } from '../src/analytics/analytics.service';
import { LaunchSortOrder } from '../src/launches/dto/launches-query.dto';

describe('API Contract & Data Transformation Tests', () => {
  let mockDb: any;
  let mockDbService: Partial<DatabaseService>;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    mockDb = {
      collection: jest.fn(),
    };
    mockDbService = {
      getDb: jest.fn().mockReturnValue(mockDb),
      isHealthy: jest.fn().mockResolvedValue(true),
    };
    mockConfigService = {
      get: jest.fn((key: string, fallback?: any) => {
        if (key === 'factoryAddress') return '0xfactory';
        if (key === 'chainId') return 'arc-testnet';
        if (key === 'cloudinary') {
          return {
            cloudName: 'test-cloud',
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            uploadPreset: 'strict-waffles-images',
          };
        }
        return fallback;
      }),
    };
  });

  describe('LaunchesService Contract', () => {
    it('returns exact JSON shape { launches: [...] } with calculated metrics', async () => {
      const sampleLaunchDoc: LaunchDoc = {
        token: '0x1111111111111111111111111111111111111111',
        curve: '0x2222222222222222222222222222222222222222',
        creator: '0x3333333333333333333333333333333333333333',
        name: 'Waffles Test',
        symbol: 'WAFFLE',
        description: 'Meme token',
        imageUri: 'https://img.test/1.png',
        createdAt: new Date('2026-08-28T00:00:00Z'),
        graduated: false,
        price: '1000000',
        mcap: '10000000000',
        progressBps: 5000,
      };

      const mockCollection = {
        find: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([sampleLaunchDoc]),
        }),
        aggregate: jest.fn().mockImplementation((pipeline: any[]) => {
          // Check if aggregation is for volume or latest metrics
          if (pipeline.some((s) => s.$group?.volume24h)) {
            return {
              toArray: jest.fn().mockResolvedValue([
                { _id: '0x2222222222222222222222222222222222222222', volume24h: '500000' },
              ]),
            };
          }
          return {
            toArray: jest.fn().mockResolvedValue([
              {
                _id: '0x2222222222222222222222222222222222222222',
                price: '1200000',
                mcap: '12000000000',
                progressBps: 5500,
              },
            ]),
          };
        }),
      };

      mockDb.collection.mockReturnValue(mockCollection);

      const service = new LaunchesService(
        mockDbService as DatabaseService,
        mockConfigService as ConfigService,
      );

      const result = await service.getLaunches({});

      expect(result).toHaveProperty('launches');
      if ('launches' in result) {
        expect(result.launches).toHaveLength(1);
        const item = result.launches[0];
        expect(item).toEqual({
          token: '0x1111111111111111111111111111111111111111',
          curve: '0x2222222222222222222222222222222222222222',
          creator: '0x3333333333333333333333333333333333333333',
          name: 'Waffles Test',
          symbol: 'WAFFLE',
          description: 'Meme token',
          imageUri: 'https://img.test/1.png',
          website: '',
          twitter: '',
          telegram: '',
          graduated: false,
          pool: null,
          createdAt: '2026-08-28T00:00:00.000Z',
          price: '1200000',
          mcap: '12000000000',
          volume24h: '500000',
          volume1h: '0',
          previousVolume1h: '0',
          traders1h: 0,
          progressBps: 5500,
        });
      }
    });
  });

  describe('Market discovery', () => {
    it('ranks all launches by hourly wallets, then volume, and excludes inactive tokens', async () => {
      const docs = Array.from({ length: 601 }, (_, i) => ({ token: `token${i}`, curve: `curve${i}` }));
      const find = jest.fn().mockReturnValue({ toArray: async () => docs });
      mockDb.collection.mockReturnValue({ find });
      const service = new LaunchesService(mockDbService as DatabaseService, mockConfigService as ConfigService);
      jest.spyOn(service, 'enrichLaunches').mockResolvedValue(docs.map((doc, i) => ({ ...doc,
        traders1h: i === 600 ? 5 : i === 0 || i === 1 ? 2 : 0,
        volume1h: i === 1 ? '200' : '100', mcap: '0', progressBps: 0,
      })) as any);
      const result = await service.getLaunches({ sort: LaunchSortOrder.TRENDING, limit: 3 });
      expect('launches' in result && result.launches.map((row) => row.token)).toEqual(['token600', 'token1', 'token0']);
      expect(service.enrichLaunches).toHaveBeenCalledWith(mockDb, docs);
    });

    it('separates open curves and ranks by progress before market cap', async () => {
      const find = jest.fn().mockReturnValue({ toArray: async () => [] });
      mockDb.collection.mockReturnValue({ find });
      const service = new LaunchesService(mockDbService as DatabaseService, mockConfigService as ConfigService);
      jest.spyOn(service, 'enrichLaunches').mockResolvedValue([
        { token: 'large', mcap: '999999', progressBps: 3000 },
        { token: 'close', mcap: '100', progressBps: 9000 },
      ] as any);
      const result = await service.getLaunches({ sort: LaunchSortOrder.GRADUATING });
      expect(find).toHaveBeenCalledWith({ factory: '0xfactory', graduated: { $ne: true } });
      expect('launches' in result && result.launches[0].token).toBe('close');
    });
  });

  describe('Analytics accounting', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const from = now.getTime() - 86400000;
    const launches = [{ token: 'token', curve: 'curve', name: 'Coin', symbol: 'COIN',
      createdAt: new Date(from - 1000), graduatedAt: new Date(from + 1000), graduated: true }];
    async function* records(rows: any[]) { yield* rows; }
    const trade = (time: number, extra = {}) => ({ curveAddress: 'curve', trader: '0xABC',
      timestamp: new Date(time), usdcAmount: '90', usdcGrossAmount: '100', feeAmount: '11', ...extra });

    it('uses half-open windows, deduplicates wallets, separates venues and preserves fee rounding', async () => {
      const result = await summarizeAnalytics(launches, records([
        trade(from - 1), trade(from), trade(from + 1, { trader: '0xabc', source: 'pool' }),
        trade(now.getTime()), trade(from + 1, { curveAddress: 'unrelated' }),
      ]), '24h', now, from);
      expect(result.current).toEqual({ volume: '200', wallets: 1, launches: 0, graduations: 1,
        fees: '22', creatorFees: '14', platformFees: '4', rewardsFees: '4' });
      expect(result.previous?.volume).toBe('100');
      expect(result.previous?.launches).toBe(1);
      expect(result.series[0]).toMatchObject({ curveVolume: '100', poolVolume: '100', graduations: 1 });
      expect(result.series).toHaveLength(24);
      expect(result.markets).toHaveLength(1);
    });

    it('does not turn missing fee records into zero fees', async () => {
      const result = await summarizeAnalytics(launches, records([trade(from, { feeAmount: undefined })]), '24h', now, from);
      expect(result.current.volume).toBe('100');
      expect(result.current.fees).toBeNull();
      expect(result.current.creatorFees).toBeNull();
      expect(result.current.rewardsFees).toBeNull();
    });

    it('returns honest empty history without a comparison for all time', async () => {
      const result = await summarizeAnalytics([], records([]), 'all', now, now.getTime());
      expect(result.current.volume).toBe('0');
      expect(result.previous).toBeNull();
      expect(result.latestTradeAt).toBeNull();
      expect(result.series).toEqual([]);
    });
  });

  describe('TradesService Contract', () => {
    it('returns exact JSON shape { trades: [...] }', async () => {
      const sampleTrade: RawTradeDoc = {
        curveAddress: '0x2222222222222222222222222222222222222222',
        trader: '0x3333333333333333333333333333333333333333',
        isBuy: true,
        usdcAmount: '10000000',
        usdcGrossAmount: '10000000',
        tokenAmount: '5000000000000000000',
        priceAfter: '2000000',
        mcapAfter: '20000000000',
        blockNumber: 12345,
        logIndex: 2,
        txHash: '0xabcdef1234567890',
        timestamp: new Date('2026-08-28T12:00:00Z'),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'launches') {
          return {
            findOne: jest.fn().mockResolvedValue({
              token: '0x1111111111111111111111111111111111111111',
              curve: '0x2222222222222222222222222222222222222222',
            }),
          };
        }
        if (name === 'trades') {
          return {
            find: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              toArray: jest.fn().mockResolvedValue([sampleTrade]),
            }),
          };
        }
        return {};
      });

      const service = new TradesService(mockDbService as DatabaseService);
      const result = await service.getTrades({
        token: '0x1111111111111111111111111111111111111111',
        limit: 50,
      });

      expect(result).toHaveProperty('trades');
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0]).toEqual({
        trader: '0x3333333333333333333333333333333333333333',
        isBuy: true,
        usdcAmount: '10000000',
        usdcGrossAmount: '10000000',
        tokenAmount: '5000000000000000000',
        priceAfter: '2000000',
        mcapAfter: '20000000000',
        blockNumber: 12345,
        logIndex: 2,
        txHash: '0xabcdef1234567890',
        timestamp: '2026-08-28T12:00:00.000Z',
      });
    });
  });

  describe('UploadsService Contract', () => {
    it('generates valid Cloudinary signatures with fixed namespace', () => {
      const service = new UploadsService(mockConfigService as ConfigService);
      const result = service.generateSignature();

      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('timestamp');
      expect(result.apiKey).toBe('test-key');
      expect(result.cloudName).toBe('test-cloud');
      expect(result.folder).toBe('arc_fun_tokens');
      expect(result.uploadPreset).toBe('strict-waffles-images');
      expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
      expect(result.maxSizeBytes).toBe(5 * 1024 * 1024);
      expect(result.allowedMimeTypes).toContain('image/png');
    });

    it('rejects files whose bytes do not match their declared image type', async () => {
      const service = new UploadsService(mockConfigService as ConfigService);

      await expect(
        service.uploadDirectProxy(Buffer.from('definitely-not-a-png'), 'image/png'),
      ).rejects.toThrow('File contents do not match the declared image format');
    });
  });
});
