import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PortfolioPosition } from '@waffles/shared';

@Injectable()
export class PortfoliosService {
  private readonly logger = new Logger(PortfoliosService.name);

  constructor(private readonly dbService: DatabaseService) {}

  async getPortfolio(addressInput: string): Promise<{ positions: PortfolioPosition[] }> {
    const db = this.dbService.getDb();
    const address = addressInput.toLowerCase();

    const rows = await db
      .collection('trades')
      .aggregate<PortfolioPosition>([
        { $match: { trader: address } },
        {
          $group: {
            _id: '$curveAddress',
            usdcSpent: {
              $sum: {
                $cond: [{ $eq: ['$isBuy', true] }, { $toDecimal: '$usdcAmount' }, 0],
              },
            },
            usdcReceived: {
              $sum: {
                $cond: [{ $eq: ['$isBuy', false] }, { $toDecimal: '$usdcAmount' }, 0],
              },
            },
            tokensBought: {
              $sum: {
                $cond: [{ $eq: ['$isBuy', true] }, { $toDecimal: '$tokenAmount' }, 0],
              },
            },
            tokensSold: {
              $sum: {
                $cond: [{ $eq: ['$isBuy', false] }, { $toDecimal: '$tokenAmount' }, 0],
              },
            },
            tradeCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            curve: '$_id',
            usdcSpent: { $toString: '$usdcSpent' },
            usdcReceived: { $toString: '$usdcReceived' },
            tokensBought: { $toString: '$tokensBought' },
            tokensSold: { $toString: '$tokensSold' },
            tradeCount: 1,
          },
        },
      ])
      .toArray();

    return { positions: rows };
  }
}
