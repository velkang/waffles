export const LAMPORTS = 1_000_000_000n;
export const TOKEN_SCALE = 1_000_000n;
export const SUPPLY = 1_000_000_000n * TOKEN_SCALE;
export const INITIAL_TOKENS = 1_073_000_000n * TOKEN_SCALE;
export const CURVE_TOKENS = 793_100_000n * TOKEN_SCALE;
export const POOL_TOKENS = SUPPLY - CURVE_TOKENS;
export const MIN_TOKENS = INITIAL_TOKENS - CURVE_TOKENS;
export const INITIAL_SOL = 30n * LAMPORTS;
export const DAY = 86_400;
export const WEEK = 7 * DAY;
export const MONDAY_ZERO = 345_600; // 1970-01-05 00:00 UTC
export const TICKET_CAP = 1000n;
export const USD_SCALE = 1_000_000n;
export const PROGRAM_ID = "6SpQkgcbZjbrz94pYuWDy5nmBo3czhDGxft1uTvSUR8w";
export const SOL_USD_FEED =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

export function epochAt(time: number): number {
  return Math.floor((time - MONDAY_ZERO) / WEEK);
}
export function epochBounds(epoch: number) {
  return {
    start: MONDAY_ZERO + epoch * WEEK,
    end: MONDAY_ZERO + (epoch + 1) * WEEK,
  };
}
export function ceilDiv(a: bigint, b: bigint) {
  if (a < 0n || b <= 0n) throw new Error("Invalid division");
  return (a + b - 1n) / b;
}
export function buyFeeBps(
  launchedAt: number,
  now: number,
  initial = false,
): bigint {
  return initial
    ? 100n
    : 100n +
        (3900n *
          BigInt(Math.max(0, 60 - Math.max(0, Math.floor(now - launchedAt))))) /
          60n;
}
export function splitFee(gross: bigint, bps: bigint) {
  if (gross < 0n || bps < 0n || bps > 4000n) throw new Error("Invalid fee");
  const total = (gross * bps) / 10_000n;
  const creator = (total * 4000n) / 10_000n;
  const platform = (total * 4000n) / 10_000n;
  return { total, creator, platform, raffle: total - creator - platform };
}
export interface Routing {
  direct: number;
  locked: number;
  holders: number;
  buyback: number;
}
export function validateRouting(r: Routing, cliff: number, now: number) {
  const values = [r.direct, r.locked, r.holders, r.buyback];
  if (
    values.some((n) => !Number.isInteger(n) || n < 0 || n > 10_000) ||
    values.reduce((a, b) => a + b, 0) !== 10_000
  )
    throw new Error("Creator percentages must total 100%");
  if (r.locked && (!Number.isSafeInteger(cliff) || cliff <= now))
    throw new Error("Choose a future fee unlock date");
}
export function routeCreator(
  amount: bigint,
  routing: Routing,
  cliff: number,
  now: number,
) {
  const locked = now < cliff ? (amount * BigInt(routing.locked)) / 10_000n : 0n;
  const holders = (amount * BigInt(routing.holders)) / 10_000n;
  const buyback = (amount * BigInt(routing.buyback)) / 10_000n;
  return {
    direct: amount - locked - holders - buyback,
    locked,
    holders,
    buyback,
  };
}
export function quoteBuy(
  solReserve: bigint,
  tokenReserve: bigint,
  gross: bigint,
  bps: bigint,
  curve = true,
) {
  if (gross <= 0n || solReserve <= 0n || tokenReserve <= 0n)
    throw new Error("Invalid buy");
  const floor = curve ? MIN_TOKENS : 1n;
  let consumed = gross;
  const k = solReserve * tokenReserve;
  let nextTokens = ceilDiv(k, solReserve + gross - splitFee(gross, bps).total);
  if (nextTokens <= floor) {
    const needed = ceilDiv(k, floor) - solReserve;
    consumed = ceilDiv(needed * 10_000n, 10_000n - bps);
    while (
      consumed > 0n &&
      consumed - 1n - splitFee(consumed - 1n, bps).total >= needed
    )
      consumed--;
    nextTokens = floor;
  }
  const fee = splitFee(consumed, bps);
  return {
    consumed,
    output: tokenReserve - nextTokens,
    nextSol: solReserve + consumed - fee.total,
    nextTokens,
    fee,
  };
}
export function quoteSell(
  solReserve: bigint,
  tokenReserve: bigint,
  amount: bigint,
  curve = true,
) {
  if (
    amount <= 0n ||
    solReserve <= 0n ||
    tokenReserve <= 0n ||
    (curve && tokenReserve + amount > INITIAL_TOKENS)
  )
    throw new Error("Invalid sale");
  const nextTokens = tokenReserve + amount;
  const nextSol = ceilDiv(solReserve * tokenReserve, nextTokens);
  const gross = solReserve - nextSol;
  const fee = splitFee(gross, 100n);
  return { output: gross - fee.total, gross, nextSol, nextTokens, fee };
}
export function parseUnits(input: string, decimals: number): bigint {
  if (!/^\d+(\.\d*)?$/.test(input))
    throw new Error("Enter a positive decimal amount");
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places`);
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
}
export function formatUnits(value: string | bigint, decimals = 9, digits = 4) {
  const raw = BigInt(value);
  const sign = raw < 0n ? "-" : "";
  const amount = raw < 0n ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const fullFraction = (amount % scale).toString().padStart(decimals, "0");
  let fraction = fullFraction.slice(0, digits).replace(/0+$/, "");
  if (amount > 0n && amount < scale && !fraction)
    fraction = fullFraction.replace(/0+$/, "");
  return `${sign}${(amount / scale).toLocaleString("en")}${fraction ? `.${fraction}` : ""}`;
}
export interface Market {
  mint: string;
  market: string;
  creator: string;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  launchedAt: number;
  state: "curve" | "complete" | "pool";
  solReserve: string;
  tokenReserve: string;
  supply: string;
  volumeSol: string;
  routing: Routing;
  feeCliff: number;
  upgradeAuthority: string | null;
}
export interface Commitment {
  id: string;
  mint: string;
  owner: string;
  asset: "sol" | "token";
  amount: string;
  purchaseCost: string | null;
  startAt: number;
  unlockAt: number;
  withdrawn: boolean;
  kind: "future-fees" | "earned-fees" | "purchased-tokens";
}
export interface SolTrade {
  id: string;
  mint: string;
  trader: string;
  side: "buy" | "sell";
  grossSol: string;
  netSol: string;
  tokens: string;
  fee: string;
  price: string;
  signature: string;
  slot: number;
  time: number;
  protocol: boolean;
}
export interface CategoryTickets {
  trading: string;
  holding: string;
  creator: string;
}
export interface SolClaim {
  id: string;
  epoch: number;
  mint: string;
  kind: "raffle" | "holders" | "incentives";
  wallet: string;
  amount: string;
  proof: string[];
  claimed: boolean;
  distribution: string;
}
export interface PriceObservation {
  feed: string;
  publishTime: number;
  price: string;
  confidence: string;
  exponent: number;
}
export function priceMicros(
  p: PriceObservation,
  at: number,
  feed: string,
): bigint {
  if (
    p.feed !== feed ||
    !Number.isSafeInteger(p.publishTime) ||
    p.publishTime < at ||
    p.publishTime > at + 60 ||
    !Number.isInteger(p.exponent) ||
    p.exponent < -18 ||
    p.exponent > 6
  )
    throw new Error("Missing or stale SOL/USD observation");
  const price = BigInt(p.price),
    confidence = BigInt(p.confidence);
  if (price <= 0n || confidence < 0n || confidence * 100n > price)
    throw new Error("Unreliable SOL/USD observation");
  return p.exponent >= -6
    ? price * 10n ** BigInt(p.exponent + 6)
    : price / 10n ** BigInt(-6 - p.exponent);
}
export function json(value: unknown) {
  return JSON.stringify(value, (_, v: unknown) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}
