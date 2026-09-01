import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fetchBeacon,
  quicknetClient,
  roundAt,
  roundTime,
} from 'drand-client';

@Injectable()
export class DrandService {
  constructor(private readonly config: ConfigService) {}

  async getFirstBeaconAfter(boundary: Date) {
    const client = quicknetClient();
    const chainInfo = await client.chain().info();
    const configuredHash = this.config.get<string>('rewards.drandChainHash', '');
    if (configuredHash !== chainInfo.hash) {
      throw new Error('Configured Drand chain hash does not match pinned quicknet chain');
    }

    let round = roundAt(boundary.getTime(), chainInfo);
    if (roundTime(chainInfo, round) <= boundary.getTime()) round += 1;

    // quicknetClient pins chain hash/public key and verifies every beacon signature.
    const beacon = await fetchBeacon(client, round);
    if (beacon.round !== round) throw new Error(`Drand returned round ${beacon.round}, expected ${round}`);

    return {
      chainHash: chainInfo.hash,
      round: beacon.round,
      emittedAt: new Date(roundTime(chainInfo, beacon.round)),
      signature: `0x${beacon.signature}` as const,
      randomness: `0x${beacon.randomness}` as const,
    };
  }
}
