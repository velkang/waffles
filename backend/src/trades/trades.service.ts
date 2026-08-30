import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TradesQueryDto } from './dto/trades-query.dto';
import { Trade } from '@waffles/shared';

export interface RawTradeDoc {
  eventId?: string;
  curveAddress: string;
  trader: string;
  isBuy: boolean;
  usdcAmount: string;
  usdcGrossAmount?: string;
  feeAmount?: string;
  tokenAmount: string;
  priceAfter: string;
  executionPrice?: string;
  mcapAfter: string;
  progressBpsAfter?: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: Date | string;
  source?: 'curve' | 'pool';
}

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(private readonly dbService: DatabaseService) {}

  async getTrades(query: TradesQueryDto): Promise<{ trades: Trade[] }> {
    const db = this.dbService.getDb();
    const token = query.token.toLowerCase();
    const limit = query.limit ?? 50;

    const launch = await db.collection('launches').findOne(
      { token },
      { projection: { curve: 1 } },
    );

    if (!launch || !launch.curve) {
      return { trades: [] };
    }

    const trades = await db
      .collection<RawTradeDoc>('trades')
      .find({ curveAddress: launch.curve })
      .sort({ blockNumber: -1, logIndex: -1 })
      .limit(limit)
      .toArray();

    return {
      trades: trades.map((t) => ({
        eventId: t.eventId,
        trader: t.trader,
        isBuy: t.isBuy,
        usdcAmount: t.usdcAmount,
        usdcGrossAmount: t.usdcGrossAmount ?? t.usdcAmount,
        feeAmount: t.feeAmount,
        tokenAmount: t.tokenAmount,
        priceAfter: t.priceAfter,
        executionPrice: t.executionPrice,
        mcapAfter: t.mcapAfter,
        progressBpsAfter: t.progressBpsAfter,
        blockNumber: t.blockNumber,
        logIndex: t.logIndex,
        txHash: t.txHash,
        timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : t.timestamp,
        source: t.source,
      })),
    };
  }
}
