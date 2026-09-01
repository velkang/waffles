import { keccak256, stringToHex, type Address } from 'viem';
import {
  allocateEqualPrizes,
  buildRewardMerkleDistribution,
  drawWeightedWinners,
  verifyRewardProof,
} from '../src/rewards/raffle-engine';

const ADDRESSES = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
] as const satisfies readonly Address[];

describe('raffle engine', () => {
  it('draws deterministically without duplicate winners', () => {
    const tickets = [
      { address: ADDRESSES[0], tickets: 1n },
      { address: ADDRESSES[1], tickets: 5n },
      { address: ADDRESSES[2], tickets: 10n },
    ];
    const seed = keccak256(stringToHex('drand-seed'));

    const first = drawWeightedWinners(tickets, 3, seed);
    const second = drawWeightedWinners([...tickets].reverse(), 3, seed);

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(3);
  });

  it('rejects invalid and duplicate ticket entries', () => {
    const seed = keccak256(stringToHex('seed'));
    expect(() => drawWeightedWinners([{ address: ADDRESSES[0], tickets: 0n }], 1, seed)).toThrow(
      'must be positive',
    );
    expect(() =>
      drawWeightedWinners(
        [
          { address: ADDRESSES[0], tickets: 1n },
          { address: ADDRESSES[0], tickets: 2n },
        ],
        1,
        seed,
      ),
    ).toThrow('Duplicate');
  });

  it('builds valid proofs for even and odd leaf counts', () => {
    const distribution = buildRewardMerkleDistribution(
      5_042_002n,
      '0x00000000000000000000000000000000000000aa',
      7n,
      [
        { address: ADDRESSES[0], amount: 10_000_000n },
        { address: ADDRESSES[1], amount: 20_000_000n },
        { address: ADDRESSES[2], amount: 30_000_000n },
      ],
    );

    expect(distribution.claims).toHaveLength(3);
    for (const claim of distribution.claims) {
      expect(verifyRewardProof(claim.leaf, claim.proof, distribution.root)).toBe(true);
    }
  });

  it('domain-separates distributions by epoch', () => {
    const rewards = [{ address: ADDRESSES[0], amount: 10_000_000n }];
    const first = buildRewardMerkleDistribution(
      5_042_002n,
      '0x00000000000000000000000000000000000000aa',
      1n,
      rewards,
    );
    const second = buildRewardMerkleDistribution(
      5_042_002n,
      '0x00000000000000000000000000000000000000aa',
      2n,
      rewards,
    );
    expect(first.root).not.toBe(second.root);
  });

  it('allocates every prize-pool base unit in deterministic winner order', () => {
    expect(allocateEqualPrizes(ADDRESSES, 10n)).toEqual([
      { address: ADDRESSES[0], amount: 4n },
      { address: ADDRESSES[1], amount: 3n },
      { address: ADDRESSES[2], amount: 3n },
    ]);
  });
});
