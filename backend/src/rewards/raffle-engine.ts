import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from 'viem';

export interface TicketEntry {
  address: Address;
  tickets: bigint;
}

export interface RewardEntry {
  address: Address;
  amount: bigint;
}

export interface MerkleClaim extends RewardEntry {
  leaf: Hex;
  proof: Hex[];
}

export interface MerkleDistribution {
  root: Hex;
  claims: MerkleClaim[];
}

export function allocateEqualPrizes(winners: readonly Address[], totalAmount: bigint): RewardEntry[] {
  if (winners.length === 0) throw new Error('At least one winner is required');
  if (totalAmount <= 0n) throw new Error('Prize pool must be positive');
  const count = BigInt(winners.length);
  const base = totalAmount / count;
  const remainder = totalAmount % count;
  return winners.map((address, index) => ({
    address,
    amount: base + (BigInt(index) < remainder ? 1n : 0n),
  }));
}

const UINT256_RANGE = 1n << 256n;

/** Selects unique wallets proportionally to ticket count using a deterministic seed. */
export function drawWeightedWinners(
  entries: readonly TicketEntry[],
  winnerCount: number,
  seed: Hex,
): Address[] {
  if (!Number.isSafeInteger(winnerCount) || winnerCount < 0) {
    throw new Error('winnerCount must be a non-negative safe integer');
  }

  const pool = normalizeTickets(entries);
  const count = Math.min(winnerCount, pool.length);
  const winners: Address[] = [];
  let counter = 0n;

  for (let draw = 0; draw < count; draw += 1) {
    const totalTickets = pool.reduce((sum, entry) => sum + entry.tickets, 0n);
    const sample = sampleBelow(seed, counter, totalTickets);
    counter = sample.nextCounter;

    let cursor = 0n;
    const selectedIndex = pool.findIndex((entry) => {
      cursor += entry.tickets;
      return sample.value < cursor;
    });
    winners.push(pool[selectedIndex].address);
    pool.splice(selectedIndex, 1);
  }

  return winners;
}

/** Matches WafflesRewardsDistributor.leaf exactly. */
export function rewardLeaf(
  chainId: bigint,
  distributor: Address,
  epochId: bigint,
  account: Address,
  amount: bigint,
): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    [chainId, getAddress(distributor), epochId, getAddress(account), amount],
  );
  return keccak256(keccak256(encoded));
}

export function buildRewardMerkleDistribution(
  chainId: bigint,
  distributor: Address,
  epochId: bigint,
  rewards: readonly RewardEntry[],
): MerkleDistribution {
  if (rewards.length === 0) throw new Error('At least one reward is required');

  const seen = new Set<string>();
  const leaves = rewards.map((reward, index) => {
    const address = getAddress(reward.address);
    const key = address.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate reward address: ${address}`);
    if (reward.amount <= 0n) throw new Error(`Reward at index ${index} must be positive`);
    seen.add(key);
    return rewardLeaf(chainId, distributor, epochId, address, reward.amount);
  });

  const levels: Hex[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
    }
    levels.push(next);
  }

  const claims = rewards.map((reward, leafIndex) => {
    const proof: Hex[] = [];
    let index = leafIndex;
    for (let level = 0; level < levels.length - 1; level += 1) {
      const sibling = index % 2 === 0 ? index + 1 : index - 1;
      if (sibling < levels[level].length) proof.push(levels[level][sibling]);
      index = Math.floor(index / 2);
    }
    return {
      address: getAddress(reward.address),
      amount: reward.amount,
      leaf: leaves[leafIndex],
      proof,
    };
  });

  return { root: levels[levels.length - 1][0], claims };
}

export function verifyRewardProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  return proof.reduce((hash, sibling) => hashPair(hash, sibling), leaf) === root;
}

function normalizeTickets(entries: readonly TicketEntry[]): TicketEntry[] {
  const byAddress = new Map<string, TicketEntry>();
  for (const [index, entry] of entries.entries()) {
    if (entry.tickets <= 0n) throw new Error(`Ticket count at index ${index} must be positive`);
    const address = getAddress(entry.address);
    const key = address.toLowerCase();
    if (byAddress.has(key)) throw new Error(`Duplicate ticket address: ${address}`);
    byAddress.set(key, { address, tickets: entry.tickets });
  }
  return [...byAddress.values()].sort((a, b) =>
    a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
  );
}

function sampleBelow(
  seed: Hex,
  startCounter: bigint,
  upperBound: bigint,
): { value: bigint; nextCounter: bigint } {
  if (upperBound <= 0n) throw new Error('upperBound must be positive');
  const limit = UINT256_RANGE - (UINT256_RANGE % upperBound);
  let counter = startCounter;
  for (;;) {
    const random = BigInt(
      keccak256(
        encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [seed, counter]),
      ),
    );
    counter += 1n;
    if (random < limit) return { value: random % upperBound, nextCounter: counter };
  }
}

function hashPair(a: Hex, b: Hex): Hex {
  return keccak256(BigInt(a) < BigInt(b) ? concatHex([a, b]) : concatHex([b, a]));
}
