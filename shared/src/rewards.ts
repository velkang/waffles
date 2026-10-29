import {
  DAY,
  WEEK,
  LAMPORTS,
  TICKET_CAP,
  USD_SCALE,
  epochAt,
} from "./solana.js";

export interface PurchaseLot {
  id: string;
  owner: string;
  mint: string;
  tokens: bigint;
  cost: bigint;
  boughtAt: number;
}
/** Outgoing quantities consume eligible purchases first. Non-purchase receipts never create lots. */
export function consumeLots(lots: PurchaseLot[], amount: bigint): bigint {
  if (amount < 0n) throw new Error("Negative outgoing amount");
  let consumedCost = 0n;
  for (const lot of lots) {
    if (!amount) break;
    const take = amount < lot.tokens ? amount : lot.tokens;
    const cost =
      take === lot.tokens ? lot.cost : (lot.cost * take) / lot.tokens;
    lot.tokens -= take;
    lot.cost -= cost;
    amount -= take;
    consumedCost += cost;
  }
  return consumedCost;
}
export function holdingWeight(
  lots: readonly PurchaseLot[],
  launch: number,
): bigint {
  return lots.reduce(
    (sum, lot) =>
      sum +
      (lot.boughtAt >= launch && lot.boughtAt < launch + DAY
        ? lot.cost * BigInt(launch + DAY - lot.boughtAt)
        : 0n),
    0n,
  );
}
export function categoryTickets(
  volumeUsd: bigint,
  heldSolSeconds: bigint,
  completedLockSolWeeks: bigint,
) {
  const cap = (n: bigint) => (n > TICKET_CAP ? TICKET_CAP : n).toString();
  if ([volumeUsd, heldSolSeconds, completedLockSolWeeks].some((n) => n < 0n))
    throw new Error("Negative ticket contribution");
  return {
    trading: cap(volumeUsd / (1000n * USD_SCALE)),
    holding: cap(heldSolSeconds / (LAMPORTS * BigInt(DAY))),
    creator: cap(completedLockSolWeeks / LAMPORTS),
  };
}
export function completedLockWeeks(
  principal: bigint,
  deposited: number,
  unlock: number,
  epochStart: number,
  epochEnd: number,
) {
  let total = 0n;
  for (let at = deposited + WEEK; at <= unlock && at < epochEnd; at += WEEK)
    if (at >= epochStart) total += principal;
  return total;
}
export function drawCount(
  pool: bigint,
  solUsdMicros: bigint,
  tickets: bigint,
): bigint {
  if (pool < 0n || solUsdMicros <= 0n || tickets < 0n)
    throw new Error("Invalid raffle inputs");
  const count = (pool * solUsdMicros) / LAMPORTS / (1000n * USD_SCALE);
  return count < tickets ? count : tickets;
}
export function epochForCheckpoint(launch: number) {
  return epochAt(launch + DAY);
}

export function bytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
}
export function u64(value: bigint) {
  if (value < 0n || value > (1n << 64n) - 1n) throw new Error("u64 overflow");
  const result = new Uint8Array(8);
  new DataView(result.buffer).setBigUint64(0, value, true);
  return result;
}
export const hex = (value: Uint8Array) =>
  [...value].map((n) => n.toString(16).padStart(2, "0")).join("");
export function unhex(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error("Invalid hex");
  return Uint8Array.from(value.match(/../g)!, (n) => parseInt(n, 16));
}
export async function sha(data: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(data)),
  );
}
export async function claimLeaf(
  program: Uint8Array,
  genesis: Uint8Array,
  epoch: bigint,
  kind: number,
  mint: Uint8Array,
  wallet: Uint8Array,
  amount: bigint,
) {
  if (
    [program, genesis, mint, wallet].some((b) => b.length !== 32) ||
    ![0, 1, 2].includes(kind) ||
    amount <= 0n
  )
    throw new Error("Invalid claim domain");
  return sha(
    bytes(
      new TextEncoder().encode("waffles:claim:v1"),
      program,
      genesis,
      u64(epoch),
      Uint8Array.of(kind),
      mint,
      wallet,
      u64(amount),
    ),
  );
}
async function pair(a: Uint8Array, b: Uint8Array) {
  return sha(hex(a) < hex(b) ? bytes(a, b) : bytes(b, a));
}
export async function merkle(leaves: Uint8Array[]) {
  if (!leaves.length) throw new Error("Empty distribution");
  const levels = [leaves];
  while (levels.at(-1)!.length > 1) {
    const current = levels.at(-1)!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2)
      next.push(
        current[i + 1] ? await pair(current[i], current[i + 1]) : current[i],
      );
    levels.push(next);
  }
  return {
    root: hex(levels.at(-1)![0]),
    proofs: leaves.map((_, position) => {
      const proof: string[] = [];
      let index = position;
      for (const level of levels.slice(0, -1)) {
        const sibling = index ^ 1;
        if (level[sibling]) proof.push(hex(level[sibling]));
        index = Math.floor(index / 2);
      }
      return proof;
    }),
  };
}
export async function verifyProof(
  leaf: Uint8Array,
  proof: string[],
  root: string,
) {
  let hash = leaf;
  for (const sibling of proof) hash = await pair(hash, unhex(sibling));
  return hex(hash) === root;
}
export interface TicketHolder {
  wallet: string;
  tickets: bigint;
}
/** Ticket intervals avoid expanding every issued ticket into an array. Draws remove the actual ticket ID. */
export async function drawTickets(
  holders: TicketHolder[],
  count: bigint,
  seed: Uint8Array,
) {
  if (seed.length !== 32 || count < 0n) throw new Error("Invalid draw");
  const seen = new Set<string>();
  let offset = 0n;
  const ranges = holders
    .slice()
    .sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0))
    .map((h) => {
      if (h.tickets <= 0n || seen.has(h.wallet))
        throw new Error("Invalid or duplicate ticket holder");
      seen.add(h.wallet);
      const start = offset;
      offset += h.tickets;
      return { wallet: h.wallet, start, end: offset };
    });
  if (count > offset) throw new Error("Not enough eligible tickets");
  let remaining = offset,
    counter = 0n;
  const winners: { wallet: string; ticket: string }[] = [];
  for (let draw = 0n; draw < count; draw++) {
    const range = 1n << 256n,
      limit = range - (range % remaining);
    let random: bigint;
    do {
      random = BigInt("0x" + hex(await sha(bytes(seed, u64(counter++)))));
    } while (random >= limit);
    let position = random % remaining;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i],
        size = r.end - r.start;
      if (position >= size) {
        position -= size;
        continue;
      }
      const ticket = r.start + position;
      const pieces = [];
      if (r.start < ticket) pieces.push({ ...r, end: ticket });
      if (ticket + 1n < r.end) pieces.push({ ...r, start: ticket + 1n });
      ranges.splice(i, 1, ...pieces);
      winners.push({ wallet: r.wallet, ticket: ticket.toString() });
      break;
    }
    remaining--;
  }
  return winners;
}
export function allocatePrizes(
  winners: { wallet: string; ticket: string }[],
  pool: bigint,
) {
  if (!winners.length || pool < BigInt(winners.length))
    throw new Error("Insufficient prize funding");
  const count = BigInt(winners.length),
    amounts = new Map<string, bigint>();
  winners.forEach((winner, i) =>
    amounts.set(
      winner.wallet,
      (amounts.get(winner.wallet) ?? 0n) +
        pool / count +
        (BigInt(i) < pool % count ? 1n : 0n),
    ),
  );
  return [...amounts]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([wallet, amount]) => ({ wallet, amount }));
}
export function allocateHolders(
  weights: { wallet: string; weight: bigint }[],
  pool: bigint,
) {
  const total = weights.reduce((s, w) => s + w.weight, 0n);
  if (!total) return { rewards: [], remainder: pool };
  const rewards = weights
    .map((w) => ({ wallet: w.wallet, amount: (pool * w.weight) / total }))
    .filter((w) => w.amount > 0n);
  return {
    rewards,
    remainder: pool - rewards.reduce((s, w) => s + w.amount, 0n),
  };
}
