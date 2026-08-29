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
      progressBps: d.graduated
        ? 10_000
        : (metrics.progressBps ?? d.progressBps ?? 0),
    };
  }

  async enrichLaunches(db: Db, docs: LaunchDoc[]): Promise<LaunchSummary[]> {
    if (docs.length === 0) return [];
    const curves = docs.map((d) => d.curve);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [volumes, latest] = await Promise.all([
      db.collection('trades').aggregate([
        { $match: { curveAddress: { $in: curves }, timestamp: { $gte: since } } },
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

    if (sort === LaunchSortOrder.VOLUME || sort === LaunchSortOrder.MCAP) {
      const docs = await launches.find(filter).limit(500).toArray();
      const enriched = await this.enrichLaunches(db, docs);

      enriched.sort((a, b) =>
        sort === LaunchSortOrder.MCAP
          ? Number(BigInt(b.mcap || 0) - BigInt(a.mcap || 0))
          : Number(BigInt(b.volume24h || 0) - BigInt(a.volume24h || 0)),
      );

      return { launches: enriched.slice(0, limit) };
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
