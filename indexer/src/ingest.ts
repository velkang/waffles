import { createPublicClient, http, type Address, decodeEventLog, getAbiItem } from "viem";
import { config } from "./config.js";
import { getDb, type LaunchDoc, type TradeDoc } from "./db.js";
import { normalizeCurveUsdcAmounts } from "./normalization.js";
import { executionPrice, spotPriceFromReserves } from "./pool-pricing.js";

export const factoryAbi = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "description", type: "string", indexed: false },
      { name: "imageUri", type: "string", indexed: false },
      { name: "website", type: "string", indexed: false },
      { name: "twitter", type: "string", indexed: false },
      { name: "telegram", type: "string", indexed: false },
      { name: "feeBps", type: "uint256", indexed: false },
      { name: "creationFeePaid", type: "uint256", indexed: false },
    ],
  },
] as const;

export const curveAbi = [
  {
    type: "event",
    name: "Traded",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: true },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "priceAfter", type: "uint256", indexed: false },
      { name: "mcapAfter", type: "uint256", indexed: false },
      { name: "progressBpsAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "pool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "graduationPrice", type: "uint256", indexed: false },
      { name: "graduationMarketCap", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ammPairAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Sync",
    inputs: [
      { name: "reserve0", type: "uint256", indexed: false },
      { name: "reserve1", type: "uint256", indexed: false },
    ],
  },
] as const;

export const tokenCreatedEvent = getAbiItem({ abi: factoryAbi, name: "TokenCreated" });
export const tradedEvent = getAbiItem({ abi: curveAbi, name: "Traded" });
export const graduatedEvent = getAbiItem({ abi: curveAbi, name: "Graduated" });
export const poolSwapEvent = getAbiItem({ abi: ammPairAbi, name: "Swap" });
export const poolSyncEvent = getAbiItem({ abi: ammPairAbi, name: "Sync" });

export function createClient() {
  const client = createPublicClient({ transport: http(config.rpcUrl) });
  const limiter = new RpcRateLimiter(config.rpcMaxRequestsPerSecond);
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      const method = value as (...args: unknown[]) => Promise<unknown>;
      return (...args: unknown[]) => limiter.schedule(() => method.apply(target, args));
    },
  });
}

class RpcRateLimiter {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly intervalMs: number;
  private nextStart = 0;

  constructor(maxRequestsPerSecond: number) {
    this.intervalMs = Math.ceil(1_000 / maxRequestsPerSecond);
  }

  schedule<T>(request: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const waitMs = Math.max(0, this.nextStart - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextStart = Date.now() + this.intervalMs;
      return request();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
}

export type PublicClient = ReturnType<typeof createClient>;

export async function processTokenCreatedLog(
  db: Awaited<ReturnType<typeof getDb>>,
  log: {
    address: string;
    args: {
      token?: `0x${string}`;
      curve?: `0x${string}`;
      creator?: `0x${string}`;
      name?: string;
      symbol?: string;
      description?: string;
      imageUri?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
      feeBps?: bigint;
    };
    blockNumber: bigint | number;
    transactionHash: `0x${string}` | string;
    timestamp?: Date;
  },
): Promise<Address | null> {
  const { token, curve, creator, name, symbol, description, imageUri, website, twitter, telegram, feeBps } = log.args;
  if (!token || !curve || !creator) return null;

  const launches = db.collection<LaunchDoc>("launches");
  const doc: LaunchDoc = {
    token: token.toLowerCase(),
    curve: curve.toLowerCase(),
    factory: config.factoryAddress.toLowerCase(),
    creator: creator.toLowerCase(),
    name: String(name ?? ""),
    symbol: String(symbol ?? ""),
    description: description || undefined,
    imageUri: imageUri || undefined,
    website: website || undefined,
    twitter: twitter || undefined,
    telegram: telegram || undefined,
    feeBps: feeBps === undefined ? 100 : Number(feeBps),
    token0IsToken: token.toLowerCase() < config.usdcAddress,
    createdAt: log.timestamp ?? new Date(),
    createdBlock: Number(log.blockNumber),
    txHash: log.transactionHash,
    graduated: false,
  };

  const { graduated: _graduated, ...metadata } = doc;
  await launches.updateOne(
    { token: doc.token },
    { $set: metadata, $setOnInsert: { graduated: false } },
    { upsert: true },
  );
  console.log(`launch indexed: ${doc.symbol} ${doc.token} (curve ${doc.curve})`);
  return curve as Address;
}

async function syncLaunches(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  fromBlock: number,
  toBlock: number,
): Promise<Address[]> {
  const logs = await client.getLogs({
    address: config.factoryAddress,
    event: tokenCreatedEvent,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });

  const newCurves: Address[] = [];
  if (logs.length === 0) return newCurves;

  const blockNums = [...new Set(logs.map((l) => Number(l.blockNumber)))];
  const blocks = await Promise.all(
    blockNums.map((n) => client.getBlock({ blockNumber: BigInt(n) })),
  );
  const tsByBlock = new Map(
    blocks.map((b) => [Number(b.number), new Date(Number(b.timestamp) * 1000)]),
  );

  for (const log of logs) {
    const curve = await processTokenCreatedLog(db, {
      address: log.address,
      args: log.args,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      timestamp: tsByBlock.get(Number(log.blockNumber)) ?? new Date(),
    });
    if (curve) newCurves.push(curve);
  }

  return newCurves;
}

async function syncTrades(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  curves: string[],
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  if (curves.length === 0) return;

  const trades = db.collection<TradeDoc>("trades");
  const launches = db.collection<LaunchDoc>("launches");

  // Read feeBps directly from MongoDB instead of RPC
  const launchDocs = await launches
    .find({ curve: { $in: curves } }, { projection: { curve: 1, feeBps: 1 } })
    .toArray();
  const feeBpsByCurve = new Map<string, bigint>(
    launchDocs.map((d) => [d.curve.toLowerCase(), BigInt(d.feeBps ?? 100)]),
  );

  const curveLogs = await client.getLogs({
    address: [...curves] as `0x${string}`[],
    events: [tradedEvent, graduatedEvent],
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
  const tradedLogs = curveLogs.filter((log) => log.eventName === "Traded");
  const graduatedLogs = curveLogs.filter((log) => log.eventName === "Graduated");

  const blockNums = [...new Set(curveLogs.map((log) => Number(log.blockNumber)))];
  const blocks = await Promise.all(
    blockNums.map((number) => client.getBlock({ blockNumber: BigInt(number) })),
  );
  const tsByBlock = new Map(
    blocks.map((block) => [Number(block.number), new Date(Number(block.timestamp) * 1_000)]),
  );

  if (tradedLogs.length > 0) {
    const ops = tradedLogs.map((log) => {
      const { trader, isBuy, usdcAmount, tokenAmount, priceAfter, mcapAfter } = log.args;
      const curveAddress = String(log.address).toLowerCase();
      const normalized = normalizeCurveUsdcAmounts(
        Boolean(isBuy),
        usdcAmount ?? 0n,
        feeBpsByCurve.get(curveAddress) ?? 100n,
      );
      const doc: TradeDoc = {
        curveAddress,
        trader: String(trader).toLowerCase(),
        isBuy: Boolean(isBuy),
        usdcAmount: String(normalized.walletAmount),
        usdcGrossAmount: String(normalized.grossAmount),
        feeAmount: String(normalized.feeAmount),
        tokenAmount: String(tokenAmount),
        priceAfter: String(priceAfter),
        mcapAfter: String(mcapAfter),
        progressBpsAfter: Number(log.args.progressBpsAfter ?? 0n),
        blockNumber: Number(log.blockNumber),
        logIndex: log.logIndex,
        txHash: log.transactionHash,
        timestamp: tsByBlock.get(Number(log.blockNumber)) ?? new Date(),
        source: "curve",
      };
      return {
        updateOne: {
          filter: {
            curveAddress: doc.curveAddress,
            blockNumber: doc.blockNumber,
            logIndex: doc.logIndex,
          },
          update: { $set: doc },
          upsert: true,
        },
      };
    });
    await trades.bulkWrite(ops, { ordered: false });

    const latestByCurve = new Map<
      string,
      { price: string; mcap: string; progressBps: number }
    >();
    for (const log of tradedLogs) {
      latestByCurve.set(String(log.address).toLowerCase(), {
        price: String(log.args.priceAfter ?? 0n),
        mcap: String(log.args.mcapAfter ?? 0n),
        progressBps: Number(log.args.progressBpsAfter ?? 0n),
      });
    }
    await launches.bulkWrite(
      [...latestByCurve].map(([curve, metrics]) => ({
        updateOne: {
          filter: { curve },
          update: { $set: metrics },
        },
      })),
      { ordered: false },
    );
    console.log(`trades indexed: ${ops.length} (${fromBlock}-${toBlock})`);
  }

  for (const log of graduatedLogs) {
    const pool = log.args.pool && log.args.pool !== "0x0000000000000000000000000000000000000000"
      ? String(log.args.pool).toLowerCase()
      : undefined;
    const $set: Record<string, unknown> = {
      graduated: true,
      graduatedAt: tsByBlock.get(Number(log.blockNumber)) ?? new Date(),
      graduationBlock: Number(log.blockNumber),
      graduationTxHash: log.transactionHash,
    };
    if (pool) $set.pool = pool;
    await launches.updateOne(
      { curve: String(log.address).toLowerCase() },
      { $set },
    );

    console.log(`graduation indexed: ${log.address}${pool ? ` -> pool ${pool}` : ""}`);
  }
}

async function syncPoolSwaps(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  const graduatedLaunches = await db
    .collection<LaunchDoc>("launches")
    .find({ graduated: true, pool: { $type: "string" } }, { projection: { curve: 1, pool: 1, token: 1 } })
    .toArray();
  if (graduatedLaunches.length === 0) return;

  const curveByPool = new Map<string, string>();
  const tokenByPool = new Map<string, string>();
  for (const l of graduatedLaunches) {
    if (typeof l.pool === "string") {
      const poolLower = l.pool.toLowerCase();
      curveByPool.set(poolLower, l.curve);
      tokenByPool.set(poolLower, l.token.toLowerCase());
    }
  }
  const pools = [...curveByPool.keys()] as `0x${string}`[];

  const poolLogs = await client.getLogs({
    address: pools,
    events: [poolSwapEvent, poolSyncEvent],
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
  const logs = poolLogs.filter((log) => log.eventName === "Swap");
  const syncLogs = poolLogs.filter((log) => log.eventName === "Sync");
  if (logs.length === 0) return;
  const reservesBySwap = new Map<string, { reserve0: bigint; reserve1: bigint }>();
  for (const log of syncLogs) {
    reservesBySwap.set(`${log.transactionHash}:${Number(log.logIndex) + 1}`, {
      reserve0: log.args.reserve0 ?? 0n,
      reserve1: log.args.reserve1 ?? 0n,
    });
  }

  const blockNums = [...new Set(logs.map((l) => Number(l.blockNumber)))];
  const blocks = await Promise.all(
    blockNums.map((n) => client.getBlock({ blockNumber: BigInt(n) })),
  );
  const tsByBlock = new Map(
    blocks.map((b) => [Number(b.number), new Date(Number(b.timestamp) * 1000)]),
  );

  const trades = db.collection<TradeDoc>("trades");
  const latestByCurve = new Map<string, { price: string; mcap: string }>();
  const ops = logs.flatMap((log) => {
    const pool = String(log.address).toLowerCase();
    const token = tokenByPool.get(pool);
    // Offline deterministic check: pair token0 is the lexicographically smaller address
    const tokenIsToken0 = token ? token < config.usdcAddress : false;
    const { to, amount0In, amount1In, amount0Out, amount1Out } = log.args;

    const isBuy = tokenIsToken0 ? amount0Out! > 0n : amount1Out! > 0n;
    const usdcLeg = tokenIsToken0
      ? isBuy
        ? amount1In!
        : amount1Out!
      : isBuy
        ? amount0In!
        : amount0Out!;
    const tokenLeg = tokenIsToken0
      ? isBuy
        ? amount0Out!
        : amount0In!
      : isBuy
        ? amount1Out!
        : amount1In!;

    const reserves = reservesBySwap.get(`${log.transactionHash}:${Number(log.logIndex)}`);
    if (!reserves) {
      console.warn(`pool swap skipped without matching Sync: ${log.transactionHash}:${log.logIndex}`);
      return [];
    }
    const spot = spotPriceFromReserves(tokenIsToken0, reserves.reserve0, reserves.reserve1);
    const averagePrice = executionPrice(usdcLeg, tokenLeg);
    const curveAddress = curveByPool.get(pool)!;
    latestByCurve.set(curveAddress, {
      price: String(spot.price),
      mcap: String(spot.marketCap),
    });

    const doc: TradeDoc = {
      curveAddress,
      trader: String(to).toLowerCase(),
      isBuy,
      usdcAmount: String(usdcLeg),
      usdcGrossAmount: String(usdcLeg),
      feeAmount: "0",
      tokenAmount: String(tokenLeg),
      priceAfter: String(spot.price),
      executionPrice: String(averagePrice),
      mcapAfter: String(spot.marketCap),
      progressBpsAfter: 10_000,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      timestamp: tsByBlock.get(Number(log.blockNumber)) ?? new Date(),
      source: "pool",
    };
    return {
      updateOne: {
        filter: {
          curveAddress: doc.curveAddress,
          blockNumber: doc.blockNumber,
          logIndex: doc.logIndex,
        },
        update: { $set: doc },
        upsert: true,
      },
    };
  });
  if (ops.length > 0) await trades.bulkWrite(ops, { ordered: false });
  if (latestByCurve.size > 0) {
    await db.collection("launches").bulkWrite(
      [...latestByCurve].map(([curve, metrics]) => ({
        updateOne: {
          filter: { curve },
          update: { $set: metrics },
        },
      })),
      { ordered: false },
    );
  }
  console.log(`pool swaps indexed: ${ops.length} (${fromBlock}-${toBlock})`);
}

/// Sync everything between fromBlock and toBlock in chunks.
/// Returns the last synced block.
export async function syncRange(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  fromBlock: number,
  toBlock: number,
): Promise<number> {
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = Math.min(cursor + config.chunkSize - 1, toBlock);

    const knownCurves = (
      await db.collection("launches")
        .find({ graduated: { $ne: true } }, { projection: { curve: 1 } })
        .map((d) => d.curve)
        .toArray()
    ).filter((c): c is string => Boolean(c));

    await syncLaunches(client, db, cursor, end);
    const allCurves = [
      ...new Set([
        ...knownCurves,
        ...(
          await db.collection("launches")
            .find(
              {
                createdBlock: { $lte: end },
                $or: [
                  { graduated: { $ne: true } },
                  { graduationBlock: { $gte: cursor } },
                ],
              },
              { projection: { curve: 1 } },
            )
            .map((d) => d.curve)
            .toArray()
        ),
      ]),
    ].filter((c): c is string => Boolean(c));

    await syncTrades(client, db, allCurves, cursor, end);
    await syncPoolSwaps(client, db, cursor, end);
    cursor = end + 1;
  }
  return toBlock;
}
