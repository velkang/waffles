import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

interface TraderAggregate {
  trader: string;
  volumeUsdc: bigint;
  tickets: bigint;
  lastTradeAt: Date;
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  getEpochAt(timestamp = new Date()) {
    const duration = this.config.get<number>('rewards.epochDurationSec', 604800);
    const zero = this.config.get<number>('rewards.epochZeroUnixSec', 1756684800);
    const unix = Math.floor(timestamp.getTime() / 1000);
    const epochId = Math.max(0, Math.floor((unix - zero) / duration));
    const startUnix = zero + epochId * duration;
    return {
      epochId,
      startAt: new Date(startUnix * 1000),
      endAt: new Date((startUnix + duration) * 1000),
    };
  }

  async getCurrent(address?: string) {
    const epoch = this.getEpochAt();
    const { traders, poolUsdc } = await this.aggregateLiveEpoch(epoch.startAt, epoch.endAt);
    const threshold = this.ticketThresholdBaseUnits();
    const ranked = this.rank(traders);
    const normalized = address?.toLowerCase();
    const user = normalized ? ranked.find((row) => row.trader === normalized) ?? null : null;

    return {
      ...epoch,
      status: 'open' as const,
      provisional: true,
      totalPoolUsdc: poolUsdc.toString(),
      totalVolumeUsdc: traders.reduce((sum, row) => sum + row.volumeUsdc, 0n).toString(),
      totalTickets: traders.reduce((sum, row) => sum + row.tickets, 0n).toString(),
      ticketThresholdUsdc: this.config.get<number>('rewards.ticketThresholdUsdc', 1000),
      winnerCount: this.config.get<number>('rewards.winnerCount', 20),
      user: user
        ? this.serializeRow(user, ranked.indexOf(user) + 1)
        : normalized
          ? {
              trader: normalized,
              rank: null,
              volumeUsdc: '0',
              tickets: '0',
              volumeToNextTicketUsdc: threshold.toString(),
              lastTradeAt: null,
            }
          : null,
    };
  }

  async getLeaderboard(limit = 100) {
    const epoch = this.getEpochAt();
    const { traders } = await this.aggregateLiveEpoch(epoch.startAt, epoch.endAt);
    const ranked = this.rank(traders);
    const totalTickets = ranked.reduce((sum, row) => sum + row.tickets, 0n);
    return {
      ...epoch,
      provisional: true,
      totalTickets: totalTickets.toString(),
      leaderboard: ranked.slice(0, Math.min(Math.max(limit, 1), 250)).map((row, index) => ({
        ...this.serializeRow(row, index + 1),
        ticketShareBps: totalTickets === 0n ? 0 : Number((row.tickets * 10_000n) / totalTickets),
      })),
    };
  }

  async getPastEpochs(limit = 20) {
    const epochs = await this.database
      .getDb()
      .collection('rewardsEpochs')
      .find({ status: { $in: ['submitted', 'finalized'] } })
      .sort({ epochId: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .project({ _id: 0 })
      .toArray();
    return { epochs };
  }

  async getClaims(address: string) {
    const trader = address.toLowerCase();
    const claims = await this.database
      .getDb()
      .collection('epochWinners')
      .find({ trader })
      .sort({ epochId: -1 })
      .project({ _id: 0 })
      .toArray();
    return { trader, claims };
  }

  private async aggregateLiveEpoch(startAt: Date, endAt: Date) {
    const threshold = this.ticketThresholdBaseUnits();
    const aggregates = new Map<string, Omit<TraderAggregate, 'tickets'>>();
    let poolUsdc = 0n;
    const cursor = this.database
      .getDb()
      .collection('trades')
      .find(
        { timestamp: { $gte: startAt, $lt: endAt } },
        { projection: { trader: 1, usdcGrossAmount: 1, usdcAmount: 1, feeAmount: 1, timestamp: 1 } },
      );

    for await (const trade of cursor) {
      if (typeof trade.trader !== 'string') continue;
      const volume = this.parseBaseUnits(trade.usdcGrossAmount ?? trade.usdcAmount);
      const fee = this.parseBaseUnits(trade.feeAmount);
      const trader = trade.trader.toLowerCase();
      const current = aggregates.get(trader);
      const timestamp = trade.timestamp instanceof Date ? trade.timestamp : new Date(trade.timestamp);
      aggregates.set(trader, {
        trader,
        volumeUsdc: (current?.volumeUsdc ?? 0n) + volume,
        lastTradeAt: !current || timestamp > current.lastTradeAt ? timestamp : current.lastTradeAt,
      });
      poolUsdc += fee - (fee * 7_000n) / 10_000n - (fee * 2_500n) / 10_000n;
    }

    const traders = [...aggregates.values()].map((row) => ({
      ...row,
      tickets: row.volumeUsdc / threshold,
    }));
    return { traders, poolUsdc };
  }

  private rank(traders: TraderAggregate[]) {
    return traders.sort((a, b) => {
      if (a.volumeUsdc === b.volumeUsdc) return a.trader.localeCompare(b.trader);
      return a.volumeUsdc > b.volumeUsdc ? -1 : 1;
    });
  }

  private serializeRow(row: TraderAggregate, rank: number) {
    const threshold = this.ticketThresholdBaseUnits();
    const remainder = row.volumeUsdc % threshold;
    return {
      trader: row.trader,
      rank,
      volumeUsdc: row.volumeUsdc.toString(),
      tickets: row.tickets.toString(),
      volumeToNextTicketUsdc: (remainder === 0n ? threshold : threshold - remainder).toString(),
      lastTradeAt: row.lastTradeAt,
    };
  }

  private ticketThresholdBaseUnits() {
    return BigInt(this.config.get<number>('rewards.ticketThresholdUsdc', 1000)) * 1_000_000n;
  }

  private parseBaseUnits(value: unknown) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0n;
    return BigInt(value);
  }
}
