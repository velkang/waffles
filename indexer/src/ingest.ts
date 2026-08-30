import type { Address } from "viem";
import { config } from "./config.js";
import { getDb, type LaunchDoc } from "./db.js";

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
