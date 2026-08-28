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
  await db.collection("trades").createIndex({ curveAddress: 1, blockNumber: -1 });
  await db.collection("trades").createIndex({ timestamp: -1 });

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
}

export interface TradeDoc {
  curveAddress: string;
  trader: string;
  isBuy: boolean;
  usdcAmount: string; // raw, 6dp
  usdcGrossAmount?: string; // raw volume before curve fee
  feeAmount?: string;
  tokenAmount: string; // raw, 18dp
  priceAfter: string; // raw quote units per whole token
  executionPrice?: string; // average quote paid/received per whole token
  mcapAfter: string; // raw quote units
  progressBpsAfter?: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: Date;
  source?: "curve" | "pool"; // pool = post-graduation AmmPair swap
}
