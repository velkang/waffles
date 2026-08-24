import { createPublicClient, http, type Address, decodeEventLog, getAbiItem } from "viem";
import { config } from "./config.js";
import { getDb, type LaunchDoc, type TradeDoc } from "./db.js";
import { normalizeCurveUsdcAmounts } from "./normalization.js";

const factoryAbi = [
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "creationFeePaid", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "launchOfToken",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "address" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "string" },
      { name: "", type: "uint64" },
    ],
  },
] as const;

const tokenAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const curveAbi = [
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
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [{ name: "pool", type: "address", indexed: false }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ammPairAbi = [
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
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

export const tradedEvent = getAbiItem({ abi: curveAbi, name: "Traded" });
export const graduatedEvent = getAbiItem({ abi: curveAbi, name: "Graduated" });
export const poolSwapEvent = getAbiItem({ abi: ammPairAbi, name: "Swap" });

export function createClient() {
  return createPublicClient({ transport: http(config.rpcUrl) });
}

type PublicClient = ReturnType<typeof createClient>;

async function syncLaunches(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  fromBlock: number,
  toBlock: number,
): Promise<Address[]> {
  const logs = await client.getLogs({
    address: config.factoryAddress,
    event: getAbiItem({ abi: factoryAbi, name: "TokenCreated" }),
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });

  const newCurves: Address[] = [];
  const launches = db.collection<LaunchDoc>("launches");

  for (const log of logs) {
    const { token, curve, creator } = log.args;
    if (!token || !curve || !creator) continue;

    // Read metadata + token name/symbol
    const [launch, name, symbol] = await Promise.all([
      client.readContract({
        address: config.factoryAddress,
        abi: factoryAbi,
        functionName: "launchOfToken",
        args: [token],
      }).catch(() => null),
      client.readContract({ address: token, abi: tokenAbi, functionName: "name" }).catch(() => ""),
      client.readContract({ address: token, abi: tokenAbi, functionName: "symbol" }).catch(() => ""),
    ]);

    const block = await client.getBlock({ blockNumber: log.blockNumber });

    const doc: LaunchDoc = {
      token: token.toLowerCase(),
      curve: curve.toLowerCase(),
      creator: creator.toLowerCase(),
      name: String(name),
      symbol: String(symbol),
      createdAt: new Date(Number(block.timestamp) * 1000),
      createdBlock: Number(log.blockNumber),
      txHash: log.transactionHash,
      graduated: false,
    };
    if (launch) {
      doc.description = launch[3];
      doc.imageUri = launch[4];
      doc.website = launch[5];
      doc.twitter = launch[6];
      doc.telegram = launch[7];
    }

    const { graduated: _graduated, ...metadata } = doc;
    await launches.updateOne(
      { token: doc.token },
      { $set: metadata, $setOnInsert: { graduated: false } },
      { upsert: true },
    );
    console.log(`launch indexed: ${doc.symbol} ${doc.token}`);
    newCurves.push(curve);
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
  const launches = db.collection("launches");

  const feeBpsByCurve = new Map<string, bigint>();
  await Promise.all(
    [...new Set(curves.map((curve) => curve.toLowerCase()))].map(async (curve) => {
      const feeBps = await client.readContract({
        address: curve as Address,
        abi: curveAbi,
        functionName: "feeBps",
      });
      feeBpsByCurve.set(curve, feeBps);
    }),
  );

  const tradedLogs = await client.getLogs({
    address: [...curves] as `0x${string}`[],
    event: tradedEvent,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });

  if (tradedLogs.length > 0) {
    // batch-fetch block timestamps
    const blockNums = [...new Set(tradedLogs.map((l) => Number(l.blockNumber)))];
    const blocks = await Promise.all(
      blockNums.map((n) => client.getBlock({ blockNumber: BigInt(n) })),
    );
    const tsByBlock = new Map(
      blocks.map((b) => [Number(b.number), new Date(Number(b.timestamp) * 1000)]),
    );

    const ops = tradedLogs.map((log) => {
      const { trader, isBuy, usdcAmount, tokenAmount, priceAfter, mcapAfter } =
        log.args;
      const curveAddress = String(log.address).toLowerCase();
      const normalized = normalizeCurveUsdcAmounts(
        Boolean(isBuy),
        usdcAmount ?? 0n,
        feeBpsByCurve.get(curveAddress) ?? 0n,
      );
      const doc: TradeDoc & { curveAddressLower?: never } = {
        curveAddress,
        trader: String(trader).toLowerCase(),
        isBuy: Boolean(isBuy),
        usdcAmount: String(normalized.walletAmount),
        usdcGrossAmount: String(normalized.grossAmount),
        feeAmount: String(normalized.feeAmount),
        tokenAmount: String(tokenAmount),
        priceAfter: String(priceAfter),
        mcapAfter: String(mcapAfter),
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
    console.log(`trades indexed: ${ops.length} (${fromBlock}-${toBlock})`);
  }

  const graduatedLogs = await client.getLogs({
    address: [...curves] as `0x${string}`[],
    event: graduatedEvent,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
  for (const log of graduatedLogs) {
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    const pool = log.args.pool && log.args.pool !== "0x0000000000000000000000000000000000000000"
      ? String(log.args.pool).toLowerCase()
      : undefined;
    const $set: Record<string, unknown> = {
      graduated: true,
      graduatedAt: new Date(Number(block.timestamp) * 1000),
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

/// Index post-graduation swaps on the AMM pools of graduated launches, so
/// the trade feed, candles, and volume keep flowing after the curve closes.
/// Pool swaps are stored under the launch's curve address with source=pool;
/// priceAfter/mcapAfter use the swap's execution price (1B supply).
async function syncPoolSwaps(
  client: PublicClient,
  db: Awaited<ReturnType<typeof getDb>>,
  fromBlock: number,
  toBlock: number,
): Promise<void> {
  const graduatedLaunches = await db
    .collection("launches")
    .find({ graduated: true, pool: { $exists: true, $ne: null } }, { projection: { curve: 1, pool: 1, token: 1 } })
    .toArray();
  if (graduatedLaunches.length === 0) return;

  const curveByPool = new Map<string, string>();
  for (const l of graduatedLaunches) {
    if (typeof l.pool === "string") curveByPool.set(l.pool.toLowerCase(), l.curve);
  }
  const pools = [...curveByPool.keys()] as `0x${string}`[];

  const logs = await client.getLogs({
    address: pools,
    event: poolSwapEvent,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });
  if (logs.length === 0) return;

  const token0Cache = new Map<string, boolean>(); // pool -> token is token0
  for (const log of logs) {
    const pool = String(log.address).toLowerCase();
    if (!token0Cache.has(pool)) {
      const token0 = await client
        .readContract({ address: log.address, abi: ammPairAbi, functionName: "token0" })
        .catch(() => null);
      const launch = graduatedLaunches.find(
        (l) => typeof l.pool === "string" && l.pool.toLowerCase() === pool,
      );
      token0Cache.set(
        pool,
        Boolean(token0 && launch && String(token0).toLowerCase() === launch.token),
      );
    }
  }

  const blockNums = [...new Set(logs.map((l) => Number(l.blockNumber)))];
  const blocks = await Promise.all(
    blockNums.map((n) => client.getBlock({ blockNumber: BigInt(n) })),
  );
  const tsByBlock = new Map(
    blocks.map((b) => [Number(b.number), new Date(Number(b.timestamp) * 1000)]),
  );

  const trades = db.collection<TradeDoc>("trades");
  const ops = logs.map((log) => {
    const pool = String(log.address).toLowerCase();
    const tokenIsToken0 = token0Cache.get(pool) ?? false;
    const { to, amount0In, amount1In, amount0Out, amount1Out } = log.args;

    // Buying = receiving the token leg.
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

    const priceAfter =
      tokenLeg > 0n ? (usdcLeg * 10n ** 18n) / tokenLeg : 0n;
    const mcapAfter =
      tokenLeg > 0n ? (usdcLeg * 10n ** 27n) / tokenLeg : 0n; // 1B supply, raw 18dp

    const doc: TradeDoc = {
      curveAddress: curveByPool.get(pool)!,
      trader: String(to).toLowerCase(),
      isBuy,
      usdcAmount: String(usdcLeg),
      usdcGrossAmount: String(usdcLeg),
      feeAmount: "0",
      tokenAmount: String(tokenLeg),
      priceAfter: String(priceAfter),
      mcapAfter: String(mcapAfter),
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
  await trades.bulkWrite(ops, { ordered: false });
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
    // include any curves discovered in this very range
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
