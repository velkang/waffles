import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnalyticsRange, AnalyticsResponse, AnalyticsTotals } from '@waffles/shared';
import { DatabaseService } from '../database/database.service';

interface Launch {
  token: string; curve: string; name?: string; symbol?: string;
  createdAt?: Date; graduatedAt?: Date; graduated?: boolean;
}
interface IndexedTrade {
  curveAddress: string; trader: string; timestamp: Date;
  usdcGrossAmount?: string; usdcAmount: string; feeAmount?: string;
  source?: 'curve' | 'pool';
}

const DAY = 86_400_000;
const emptyTotals = () => ({ volume: 0n, wallets: new Set<string>(), launches: 0, graduations: 0,
  fees: 0n, creatorFees: 0n, platformFees: 0n, rewardsFees: 0n, completeFees: true });
type Totals = ReturnType<typeof emptyTotals>;
function serialize(totals: Totals): AnalyticsTotals {
  return { volume: String(totals.volume), wallets: totals.wallets.size,
    launches: totals.launches, graduations: totals.graduations,
    fees: totals.completeFees ? String(totals.fees) : null,
    creatorFees: totals.completeFees ? String(totals.creatorFees) : null,
    platformFees: totals.completeFees ? String(totals.platformFees) : null,
    rewardsFees: totals.completeFees ? String(totals.rewardsFees) : null };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService, private readonly config: ConfigService) {}

  async getAnalytics(range: AnalyticsRange): Promise<AnalyticsResponse> {
    const db = this.database.getDb();
    const factory = this.config.get<string>('factoryAddress');
    const launches = await db.collection<Launch>('launches').find(factory ? { factory } : {})
      .project<Launch>({ token: 1, curve: 1, name: 1, symbol: 1, createdAt: 1, graduatedAt: 1, graduated: 1 }).toArray();
    const now = new Date();
    const duration = range === '24h' ? DAY : range === '7d' ? 7 * DAY : 30 * DAY;
    const earliest = launches.reduce((min, launch) => launch.createdAt
      ? Math.min(min, new Date(launch.createdAt).getTime()) : min, now.getTime());
    const from = range === 'all' ? earliest : now.getTime() - duration;
    const previousFrom = range === 'all' ? from : from - duration;
    const trades = db.collection<IndexedTrade>('trades').find({
      curveAddress: { $in: launches.map((launch) => launch.curve) },
      timestamp: { $gte: new Date(previousFrom), $lt: now },
    }).project<IndexedTrade>({ curveAddress: 1, trader: 1, timestamp: 1, usdcGrossAmount: 1,
      usdcAmount: 1, feeAmount: 1, source: 1 });
    return summarizeAnalytics(launches, trades, range, now, from);
  }
}

// Uses integer USDC throughout. The cursor streams records; only aggregates stay in memory.
export async function summarizeAnalytics(
  launches: Launch[], trades: AsyncIterable<IndexedTrade>, range: AnalyticsRange, now: Date, from: number,
): Promise<AnalyticsResponse> {
  const current = emptyTotals();
  const previous = emptyTotals();
  const previousFrom = from - (now.getTime() - from);
  const bucketMs = range === '24h' ? DAY / 24 : range === 'all'
    ? Math.max(DAY, Math.ceil((now.getTime() - from) / DAY / 60) * DAY) : DAY;
  const buckets = new Map<number, { curveVolume: bigint; poolVolume: bigint; launches: number; graduations: number }>();
  const bucketKey = (time: number) => from + Math.floor((time - from) / bucketMs) * bucketMs;
  for (let time = from; time < now.getTime(); time += bucketMs) {
    buckets.set(time, { curveVolume: 0n, poolVolume: 0n, launches: 0, graduations: 0 });
  }
  const scope = (time: number) => time >= from && time < now.getTime() ? current
    : range !== 'all' && time >= previousFrom && time < from ? previous : null;
  const launchByCurve = new Map(launches.map((launch) => [launch.curve, launch]));
  for (const launch of launches) {
    for (const [date, key] of [[launch.createdAt, 'launches'], [launch.graduatedAt, 'graduations']] as const) {
      if (!date) continue;
      const time = new Date(date).getTime();
      const totals = scope(time);
      if (totals) totals[key]++;
      if (totals === current) buckets.get(bucketKey(time))![key]++;
    }
  }
  let latestTradeAt: string | null = null;
  const markets = new Map<string, { volume: bigint; wallets: Set<string> }>();
  for await (const trade of trades) {
    if (!launchByCurve.has(trade.curveAddress)) continue;
    const time = new Date(trade.timestamp).getTime();
    const totals = scope(time);
    if (!totals) continue;
    const volume = BigInt(trade.usdcGrossAmount ?? trade.usdcAmount);
    totals.volume += volume;
    totals.wallets.add(trade.trader.toLowerCase());
    if (trade.feeAmount === undefined) totals.completeFees = false;
    else {
      const fee = BigInt(trade.feeAmount);
      const creator = fee * 7000n / 10000n;
      const platform = fee * 2500n / 10000n;
      totals.fees += fee;
      totals.creatorFees += creator;
      totals.platformFees += platform;
      totals.rewardsFees += fee - creator - platform;
    }
    if (totals !== current) continue;
    const iso = new Date(time).toISOString();
    if (!latestTradeAt || iso > latestTradeAt) latestTradeAt = iso;
    buckets.get(bucketKey(time))![trade.source === 'pool' ? 'poolVolume' : 'curveVolume'] += volume;
    const market = markets.get(trade.curveAddress) ?? { volume: 0n, wallets: new Set<string>() };
    market.volume += volume;
    market.wallets.add(trade.trader.toLowerCase());
    markets.set(trade.curveAddress, market);
  }
  return { range, from: new Date(from).toISOString(), asOf: now.toISOString(), latestTradeAt,
    current: serialize(current), previous: range === 'all' ? null : serialize(previous),
    series: [...buckets].map(([time, bucket]) => ({ time: new Date(time).toISOString(),
      ...bucket, curveVolume: String(bucket.curveVolume), poolVolume: String(bucket.poolVolume) })),
    markets: [...markets].sort((a, b) => a[1].volume === b[1].volume ? a[0].localeCompare(b[0])
      : a[1].volume > b[1].volume ? -1 : 1).slice(0, 20).map(([curve, market]) => {
        const launch = launchByCurve.get(curve)!;
        return { token: launch.token, name: launch.name ?? '', symbol: launch.symbol ?? '',
          graduated: launch.graduated ?? false, volume: String(market.volume), wallets: market.wallets.size };
      }),
  };
}
