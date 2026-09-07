import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { LaunchesQueryDto, LaunchSortOrder } from './dto/launches-query.dto';
import { LaunchSummary } from '@waffles/shared';
import type { Db } from 'mongodb';

export interface LaunchDoc {
  token: string;
  curve: string;
  factory?: string;
  creator?: string;
  name?: string;
  symbol?: string;
  description?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  graduated?: boolean;
  pool?: string | null;
  createdAt?: Date;
  price?: string;
  mcap?: string;
  progressBps?: number;
}

interface TradeMetrics {
  price?: string;
  mcap?: string;
  volume24h?: string;
  progressBps?: number;
  volume1h?: string;
  traders1h?: number;
  previousVolume1h?: string;
}

@Injectable()
export class LaunchesService {
  private readonly logger = new Logger(LaunchesService.name);

  constructor(
    private readonly dbService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  private mapLaunch(d: LaunchDoc, metrics: TradeMetrics = {}): LaunchSummary {
    return {
      token: d.token,
      curve: d.curve,
      creator: d.creator ?? '',
      name: d.name ?? '',
      symbol: d.symbol ?? '',
      description: d.description ?? '',
      imageUri: d.imageUri ?? '',
      website: d.website ?? '',
      twitter: d.twitter ?? '',
      telegram: d.telegram ?? '',
      graduated: d.graduated ?? false,
      pool: d.pool ?? null,
      createdAt: d.createdAt ? (d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString()) : null,
      price: metrics.price ?? d.price ?? '0',
      mcap: metrics.mcap ?? d.mcap ?? '0',
      volume24h: metrics.volume24h ?? '0',
      volume1h: metrics.volume1h ?? '0',
      traders1h: metrics.traders1h ?? 0,
      previousVolume1h: metrics.previousVolume1h ?? '0',
      progressBps: d.graduated
        ? 10_000
        : (metrics.progressBps ?? d.progressBps ?? 0),
    };
  }

  async enrichLaunches(db: Db, docs: LaunchDoc[]): Promise<LaunchSummary[]> {
    if (docs.length === 0) return [];
    const curves = docs.map((d) => d.curve);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hour = new Date(now.getTime() - 60 * 60 * 1000);
    const previousHour = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [volumes, latest, activity] = await Promise.all([
      db.collection('trades').aggregate([
        { $match: { curveAddress: { $in: curves }, timestamp: { $gte: since, $lt: now } } },
        {
          $group: {
            _id: '$curveAddress',
            volume24h: {
              $sum: {
                $toDecimal: { $ifNull: ['$usdcGrossAmount', '$usdcAmount'] },
              },
            },
          },
        },
      ]).toArray(),
      db.collection('trades').aggregate([
        { $match: { curveAddress: { $in: curves } } },
        { $sort: { blockNumber: 1, logIndex: 1 } },
        {
          $group: {
            _id: '$curveAddress',
            price: { $last: '$priceAfter' },
            mcap: { $last: '$mcapAfter' },
            progressBps: { $last: '$progressBpsAfter' },
          },
        },
      ]).toArray(),
      db.collection('trades').aggregate([
        { $match: { curveAddress: { $in: curves }, timestamp: { $gte: previousHour, $lt: now } } },
        { $group: {
          _id: '$curveAddress',
          volume1h: { $sum: { $cond: [{ $gte: ['$timestamp', hour] }, { $toDecimal: { $ifNull: ['$usdcGrossAmount', '$usdcAmount'] } }, 0] } },
          previousVolume1h: { $sum: { $cond: [{ $lt: ['$timestamp', hour] }, { $toDecimal: { $ifNull: ['$usdcGrossAmount', '$usdcAmount'] } }, 0] } },
          wallets: { $addToSet: { $cond: [{ $gte: ['$timestamp', hour] }, { $toLower: '$trader' }, null] } },
        } },
      ]).toArray(),
    ]);

    const metricsByCurve = new Map<string, TradeMetrics>();
    for (const row of latest) {
      metricsByCurve.set(String(row._id), {
        price: row.price?.toString(),
        mcap: row.mcap?.toString(),
        progressBps:
          row.progressBps === undefined ? undefined : Number(row.progressBps),
      });
    }
    for (const row of volumes) {
      const curve = String(row._id);
      metricsByCurve.set(curve, {
        ...metricsByCurve.get(curve),
        volume24h: row.volume24h?.toString() ?? '0',
      });
    }

    for (const row of activity) {
      const curve = String(row._id);
      metricsByCurve.set(curve, {
        ...metricsByCurve.get(curve),
        volume1h: row.volume1h?.toString() ?? '0',
        previousVolume1h: row.previousVolume1h?.toString() ?? '0',
        traders1h: (row.wallets ?? []).filter(Boolean).length,
      });
    }
    return docs.map((doc) => this.mapLaunch(doc, metricsByCurve.get(doc.curve)));
  }

  async getLaunches(query: LaunchesQueryDto): Promise<{ launches: LaunchSummary[] } | { launch: LaunchSummary | null }> {
    const db = this.dbService.getDb();
    const launches = db.collection<LaunchDoc>('launches');

    const factoryAddress = this.configService.get<string>('factoryAddress');
    const filter: Record<string, unknown> = factoryAddress ? { factory: factoryAddress } : {};

    if (query.token) {
      const token = query.token.toLowerCase();
      const launch = await launches.findOne({ token, ...filter });
      const [summary] = launch ? await this.enrichLaunches(db, [launch]) : [];
      return { launch: summary ?? null };
    }

    const sort = query.sort ?? LaunchSortOrder.NEW;
    const limit = query.limit ?? 50;

    if (sort === LaunchSortOrder.GRADUATING) filter.graduated = { $ne: true };
    if (sort === LaunchSortOrder.GRADUATED) filter.graduated = true;

    if (sort !== LaunchSortOrder.NEW) {
      const docs = await launches.find(filter).toArray();
      const enriched = await this.enrichLaunches(db, docs);

      enriched.sort((a, b) => {
        if (sort === LaunchSortOrder.TRENDING && a.traders1h !== b.traders1h) {
          return (b.traders1h ?? 0) - (a.traders1h ?? 0);
        }
        if (sort === LaunchSortOrder.GRADUATING && a.progressBps !== b.progressBps) {
          return b.progressBps - a.progressBps;
        }
        const key = sort === LaunchSortOrder.TRENDING ? 'volume1h'
          : sort === LaunchSortOrder.VOLUME ? 'volume24h' : 'mcap';
        const left = BigInt(a[key] ?? '0');
        const right = BigInt(b[key] ?? '0');
        return left === right ? a.token.localeCompare(b.token) : left > right ? -1 : 1;
      });

      return { launches: enriched.filter((row) => sort !== LaunchSortOrder.TRENDING || (row.traders1h ?? 0) > 0).slice(0, limit) };
    }

    const docs = await launches
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return { launches: await this.enrichLaunches(db, docs) };
  }

  async getLaunchByToken(tokenAddress: string): Promise<{ launch: LaunchSummary | null }> {
    const db = this.dbService.getDb();
    const token = tokenAddress.toLowerCase();
    const factoryAddress = this.configService.get<string>('factoryAddress');
    const filter: Record<string, unknown> = factoryAddress ? { factory: factoryAddress } : {};

    const launch = await db.collection<LaunchDoc>('launches').findOne({ token, ...filter });
    const [summary] = launch ? await this.enrichLaunches(db, [launch]) : [];
    return { launch: summary ?? null };
  }
}
