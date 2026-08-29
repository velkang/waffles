import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CandlesQueryDto } from './dto/candles-query.dto';
import { Candle } from '@waffles/shared';

@Injectable()
export class CandlesService {
  private readonly logger = new Logger(CandlesService.name);

  constructor(private readonly dbService: DatabaseService) {}

  async getCandles(query: CandlesQueryDto): Promise<{ candles: Candle[] }> {
    const db = this.dbService.getDb();
    const token = query.token.toLowerCase();
    const interval = query.interval ?? 60;
    const limit = query.limit ?? 240;

    const launch = await db.collection('launches').findOne(
      { token },
      { projection: { curve: 1 } },
    );

    if (!launch || !launch.curve) {
      return { candles: [] };
    }

    const bucketMs = interval * 1000;
    const candles = await db
      .collection('trades')
      .aggregate<Candle>([
        { $match: { curveAddress: launch.curve } },
        { $sort: { blockNumber: 1, logIndex: 1 } },
        {
          $group: {
            _id: {
              $trunc: {
                $divide: [{ $toLong: '$timestamp' }, bucketMs],
              },
            },
            open: { $first: { $toString: '$priceAfter' } },
            close: { $last: { $toString: '$priceAfter' } },
            high: { $max: { $toDouble: '$priceAfter' } },
            low: { $min: { $toDouble: '$priceAfter' } },
            volume: {
              $sum: {
                $toDouble: { $ifNull: ['$usdcGrossAmount', '$usdcAmount'] },
              },
            },
            trades: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: limit },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            time: { $multiply: ['$_id', bucketMs] },
            open: 1,
            close: 1,
            high: { $toString: '$high' },
            low: { $toString: '$low' },
            volume: { $toString: '$volume' },
            trades: 1,
          },
        },
      ])
      .toArray();

    return { candles };
  }
}
