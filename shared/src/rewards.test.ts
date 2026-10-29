import test from "node:test";
import assert from "node:assert/strict";
import {
  DAY,
  WEEK,
  LAMPORTS,
  INITIAL_SOL,
  INITIAL_TOKENS,
  MIN_TOKENS,
  CURVE_TOKENS,
  buyFeeBps,
  quoteBuy,
  quoteSell,
  splitFee,
  priceMicros,
  SOL_USD_FEED,
  routeCreator,
  validateRouting,
  epochAt,
  epochBounds,
  formatUnits,
} from "./solana.js";
import {
  categoryTickets,
  consumeLots,
  holdingWeight,
  completedLockWeeks,
  drawCount,
  drawTickets,
  allocatePrizes,
  allocateHolders,
  sha,
  merkle,
  verifyProof,
  claimLeaf,
} from "./rewards.js";
test("launch decay, creator exception, routing, fee remainder", () => {
  assert.equal(buyFeeBps(100, 100), 4000n);
  assert.equal(buyFeeBps(100, 130), 2050n);
  assert.equal(buyFeeBps(100, 160), 100n);
  assert.equal(buyFeeBps(100, 100, true), 100n);
  for (let i = 1n; i < 1000n; i++) {
    const f = splitFee(i, 4000n);
    assert.equal(f.creator + f.platform + f.raffle, f.total);
  }
  const routing = { direct: 2500, locked: 7500, holders: 0, buyback: 0 };
  validateRouting(routing, 101, 100);
  assert.equal(routeCreator(100n, routing, 101, 100).locked, 75n);
  assert.equal(routeCreator(100n, routing, 101, 101).direct, 100n);
  assert.throws(() => validateRouting({ ...routing, holders: 1 }, 101, 100));
});
test("buys preserve reserves, round trips lose fees and final purchase refunds", () => {
  for (const amount of [1000n, LAMPORTS, 10n * LAMPORTS]) {
    const b = quoteBuy(INITIAL_SOL, INITIAL_TOKENS, amount, 100n);
    const s = quoteSell(b.nextSol, b.nextTokens, b.output);
    assert(s.output < amount);
    assert(b.nextSol * b.nextTokens >= INITIAL_SOL * INITIAL_TOKENS);
  }
  const b = quoteBuy(INITIAL_SOL, INITIAL_TOKENS, 1000n * LAMPORTS, 4000n);
  assert.equal(b.output, CURVE_TOKENS);
  assert.equal(b.nextTokens, MIN_TOKENS);
  assert(b.consumed < 1000n * LAMPORTS);
});
test("surviving FIFO lots keep proportionate cost; incoming transfers cannot restore credit", () => {
  const lots = [
    {
      id: "a",
      owner: "one",
      mint: "m",
      tokens: 100n,
      cost: LAMPORTS,
      boughtAt: 0,
    },
    {
      id: "b",
      owner: "one",
      mint: "m",
      tokens: 100n,
      cost: 2n * LAMPORTS,
      boughtAt: DAY / 2,
    },
  ];
  assert.equal(consumeLots(lots, 150n), 2n * LAMPORTS);
  assert.equal(lots[0].tokens, 0n);
  assert.equal(lots[1].tokens, 50n);
  assert.equal(holdingWeight(lots, 0), LAMPORTS * BigInt(DAY / 2));
  assert.equal(categoryTickets(0n, holdingWeight(lots, 0), 0n).holding, "0");
  consumeLots(lots, 50n);
  assert.equal(holdingWeight(lots, 0), 0n);
});
test("different thresholds, aggregation before flooring, and equal 1000 category caps", () => {
  assert.deepEqual(
    categoryTickets(
      1500n * 1_000_000n,
      (3n * LAMPORTS * BigInt(DAY)) / 2n,
      2n * LAMPORTS,
    ),
    { trading: "1", holding: "1", creator: "2" },
  );
  assert.deepEqual(
    categoryTickets(
      1_000_000_000_000_000n,
      2000n * LAMPORTS * BigInt(DAY),
      2000n * LAMPORTS,
    ),
    { trading: "1000", holding: "1000", creator: "1000" },
  );
});
test("each deposit must complete its own week; unlock and epoch boundaries", () => {
  assert.equal(completedLockWeeks(LAMPORTS, 0, WEEK - 1, 0, WEEK * 2), 0n);
  assert.equal(completedLockWeeks(LAMPORTS, 0, WEEK, 0, WEEK + 1), LAMPORTS);
  assert.equal(
    completedLockWeeks(LAMPORTS, 0, 3 * WEEK, WEEK, 2 * WEEK),
    LAMPORTS,
  );
  const bounds = epochBounds(epochAt(1_800_000_000));
  assert.equal(epochAt(bounds.end), epochAt(bounds.start) + 1);
});
test("historical oracle rejects stale, mismatched and uncertain observations", () => {
  const p = {
    feed: SOL_USD_FEED,
    publishTime: 100,
    price: "10000000000",
    confidence: "10000",
    exponent: -8,
  };
  assert.equal(priceMicros(p, 100, SOL_USD_FEED), 100_000_000n);
  assert.throws(() => priceMicros(p, 101, SOL_USD_FEED));
  assert.throws(() =>
    priceMicros({ ...p, confidence: "100000001" }, 100, SOL_USD_FEED),
  );
});
test("pool thresholds have no twenty-winner ceiling", () => {
  const usd = 100n * 1_000_000n;
  assert.equal(drawCount(9n * LAMPORTS, usd, 10000n), 0n);
  assert.equal(drawCount(100n * LAMPORTS, usd, 10000n), 10n);
  assert.equal(drawCount(1000n * LAMPORTS, usd, 10000n), 100n);
  assert.equal(drawCount(1000n * LAMPORTS, usd, 5n), 5n);
});
test("distinct winning tickets allow repeated wallets and allocate every lamport", async () => {
  const seed = await sha(new TextEncoder().encode("replay"));
  const holders = [
    { wallet: "A", tickets: 70n },
    { wallet: "B", tickets: 30n },
  ];
  const winners = await drawTickets(holders, 80n, seed);
  assert.deepEqual(winners, await drawTickets(holders, 80n, seed));
  assert.equal(new Set(winners.map((w) => w.ticket)).size, 80);
  assert(winners.filter((w) => w.wallet === "A").length > 1);
  assert.equal(
    allocatePrizes(winners, 10001n).reduce((s, r) => s + r.amount, 0n),
    10001n,
  );
  assert.throws(() => allocatePrizes([], 10n));
});
test("holder distributions retain dust", () => {
  const result = allocateHolders(
    [
      { wallet: "A", weight: 1n },
      { wallet: "B", weight: 2n },
    ],
    10n,
  );
  assert.equal(result.remainder, 1n);
  assert.equal(
    result.rewards.reduce((s, r) => s + r.amount, 0n) + result.remainder,
    10n,
  );
});
test("Merkle domain binds cluster, program, wallet, epoch and amount", async () => {
  const key = new Uint8Array(32).fill(1),
    mint = new Uint8Array(32).fill(2);
  for (const count of [1, 2, 3, 7]) {
    const leaves = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        claimLeaf(key, key, 1n, 0, mint, new Uint8Array(32).fill(i), 100n),
      ),
    );
    const tree = await merkle(leaves);
    for (let i = 0; i < count; i++)
      assert(await verifyProof(leaves[i], tree.proofs[i], tree.root));
    assert.equal(
      await verifyProof(
        await claimLeaf(key, key, 2n, 0, mint, new Uint8Array(32), 100n),
        tree.proofs[0],
        tree.root,
      ),
      false,
    );
  }
});

test("nonzero monetary amounts stay visible and signing precision retains every unit", () => {
  assert.equal(formatUnits(1n), "0.000000001");
  assert.equal(formatUnits(-1n), "-0.000000001");
  assert.equal(formatUnits(1n, 6), "0.000001");
  assert.equal(formatUnits(0n), "0");
  assert.equal(formatUnits(1_234_567_891n, 9, 9), "1.234567891");
  assert.equal(formatUnits(1_234_567_891n), "1.2345");
});
