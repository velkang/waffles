import { MongoClient, type Db } from "mongodb";
import { config } from "./config.js";

let client: MongoClient | null = null;

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(config.mongoUri);
    await client.connect();
  }
  const db = client.db(config.dbName);

  await db.collection("launches").createIndex({ token: 1 }, { unique: true });
  await db.collection("launches").createIndex({ curve: 1 }, { unique: true });
  await db.collection("launches").createIndex({ factory: 1, createdAt: -1 });
  await db.collection("launches").createIndex({ createdAt: -1 });

  await db.collection("trades").createIndex(
    { curveAddress: 1, blockNumber: 1, logIndex: 1 },
    { unique: true },
  );
  await db.collection("trades").createIndex({ eventId: 1 }, { unique: true, sparse: true });
  await db.collection("trades").createIndex({ curveAddress: 1, blockNumber: -1, logIndex: -1 });
  await db.collection("trades").createIndex({ curveAddress: 1, blockNumber: -1 });
  await db.collection("trades").createIndex({ curveAddress: 1, timestamp: -1 });
  await db.collection("trades").createIndex({ trader: 1, curveAddress: 1 });
  await db.collection("trades").createIndex({ timestamp: -1 });

  await db.collection("realtimeEvents").createIndex({ occurredAt: -1 });
  await db.collection("realtimeEvents").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  await db.collection("webhookNotifications").createIndex({ processedAt: 1 });
  await db.collection("indexedCircleEvents").createIndex({ processedAt: 1 });
  await db.collection("circleEventCursors").createIndex({ updatedAt: 1 });
  await db.collection("pendingPoolSwaps").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  await db.collection("poolSyncs").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );

  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
}

export interface LaunchDoc {
  token: string;
  curve: string;
  factory?: string;
  creator: string;
  name: string;
  symbol: string;
  description?: string;
  imageUri?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  createdAt: Date;
  createdBlock: number;
  txHash: string;
  graduated: boolean;
  graduatedAt?: Date;
  graduationBlock?: number;
  graduationTxHash?: string;
  pool?: string; // DEX pool the curve migrated into (lowercase)
  price?: string;
  mcap?: string;
  progressBps?: number;
  feeBps?: number;
  token0IsToken?: boolean;
}

export interface TradeDoc {
  eventId?: string; // stable across Circle webhook delivery and historical reconciliation
  curveAddress: string;
  trader: string;
  isBuy: boolean;
  usdcAmount: string; // raw, 6dp
  usdcGrossAmount?: string; // raw volume before curve fee
  feeAmount?: string;
  tokenAmount: string; // raw, 18dp
  priceAfter: string; // USD per whole token, scaled by 1e18
  executionPrice?: string; // average USD per whole token, scaled by 1e18
  mcapAfter: string; // raw quote units
  progressBpsAfter?: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: Date;
  source?: "curve" | "pool"; // pool = post-graduation AmmPair swap
}
