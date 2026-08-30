import { createHash, createPublicKey, verify } from "node:crypto";
import http from "node:http";
import { decodeEventLog } from "viem";
import { config } from "./config.js";
import { getDb, type LaunchDoc, type TradeDoc } from "./db.js";
import {
  ammPairAbi,
  curveAbi,
  factoryAbi,
  processTokenCreatedLog,
} from "./ingest.js";
import { normalizeCurveUsdcAmounts } from "./normalization.js";
import { executionPrice, spotPriceFromReserves } from "./pool-pricing.js";

const allAbis = [...factoryAbi, ...curveAbi, ...ammPairAbi] as const;
const PENDING_EVENT_TTL_MS = 24 * 60 * 60 * 1_000;
const P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d030107034200",
  "hex",
);

type IndexerDb = Awaited<ReturnType<typeof getDb>>;

export interface CircleWebhookNotification {
  subscriptionId?: string;
  notificationId?: string;
  notificationType: string;
  notification: {
    contractAddress: `0x${string}`;
    blockchain: string;
    txHash: `0x${string}`;
    userOpHash?: string;
    blockHash: `0x${string}`;
    blockHeight: number;
    logIndex?: string | number;
    eventName?: string;
    eventSignature?: string;
    eventSignatureHash?: `0x${string}`;
    topics: `0x${string}`[];
    data: `0x${string}`;
    firstConfirmDate?: string;
  };
  timestamp: string;
  version?: number;
}

type PoolReserves = { reserve0: bigint; reserve1: bigint };
type PoolSyncDoc = {
  _id: string;
  reserve0: string;
  reserve1: string;
  expiresAt: Date;
};
type PendingPoolSwapDoc = {
  _id: string;
  payload: CircleWebhookNotification;
  expiresAt: Date;
};

function parseLogIndex(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("notification.logIndex must be a non-negative safe integer");
  }
  return parsed;
}

export type CircleLogIndexResolver = (
  body: CircleWebhookNotification,
) => Promise<number>;

export function circleEventId(body: CircleWebhookNotification): string {
  const event = body.notification;
  return createHash("sha256")
    .update([
      event.blockchain.toLowerCase(),
      event.contractAddress.toLowerCase(),
      event.txHash.toLowerCase(),
      String(event.logIndex ?? ""),
      event.eventSignatureHash?.toLowerCase() ?? event.eventSignature ?? "",
      ...(event.topics ?? []).map((topic) => topic.toLowerCase()),
      event.data?.toLowerCase() ?? "0x",
    ].join(":"))
    .digest("hex");
}

function notificationTimestamp(body: CircleWebhookNotification): Date {
  const value = body.notification.firstConfirmDate ?? body.timestamp;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("invalid webhook timestamp");
  return timestamp;
}

function poolEventKey(txHash: string, swapLogIndex: number): string {
  return `${txHash.toLowerCase()}:${swapLogIndex}`;
}

async function writePoolSwap(
  db: IndexerDb,
  body: CircleWebhookNotification,
  args: Record<string, unknown>,
  reserves: PoolReserves,
): Promise<void> {
  const { contractAddress, txHash, blockHeight } = body.notification;
  const logIndex = parseLogIndex(body.notification.logIndex);
  const poolAddress = contractAddress.toLowerCase();
  const launch = await db.collection<LaunchDoc>("launches").findOne(
    { pool: poolAddress },
    { projection: { curve: 1, token: 1 } },
  );
  if (!launch) throw new Error(`no launch found for pool ${poolAddress}`);

  const token0IsToken = launch.token.toLowerCase() < config.usdcAddress;
  const amount0In = BigInt(String(args.amount0In ?? 0));
  const amount1In = BigInt(String(args.amount1In ?? 0));
  const amount0Out = BigInt(String(args.amount0Out ?? 0));
  const amount1Out = BigInt(String(args.amount1Out ?? 0));
  const isBuy = token0IsToken ? amount0Out > 0n : amount1Out > 0n;
  const usdcLeg = token0IsToken
    ? isBuy ? amount1In : amount1Out
    : isBuy ? amount0In : amount0Out;
  const tokenLeg = token0IsToken
    ? isBuy ? amount0Out : amount0In
    : isBuy ? amount1Out : amount1In;
  const spot = spotPriceFromReserves(token0IsToken, reserves.reserve0, reserves.reserve1);

  const doc: TradeDoc = {
    eventId: circleEventId(body),
    curveAddress: launch.curve,
    trader: String(args.to).toLowerCase(),
    isBuy,
    usdcAmount: String(usdcLeg),
    usdcGrossAmount: String(usdcLeg),
    feeAmount: "0",
    tokenAmount: String(tokenLeg),
    priceAfter: String(spot.price),
    executionPrice: String(executionPrice(usdcLeg, tokenLeg)),
    mcapAfter: String(spot.marketCap),
    progressBpsAfter: 10_000,
    blockNumber: blockHeight,
    logIndex,
    txHash,
    timestamp: notificationTimestamp(body),
    source: "pool",
  };

  await Promise.all([
    db.collection<TradeDoc>("trades").updateOne(
      {
        $or: [
          { eventId: doc.eventId },
          {
            curveAddress: doc.curveAddress,
            blockNumber: doc.blockNumber,
            logIndex: doc.logIndex,
          },
        ],
      },
      { $set: doc },
      { upsert: true },
    ),
    db.collection<LaunchDoc>("launches").updateOne(
      { curve: launch.curve },
      { $set: { price: doc.priceAfter, mcap: doc.mcapAfter, token0IsToken } },
    ),
  ]);
  console.log(`[webhook] Pool Swap indexed for token ${launch.token}`);
}

export async function processCircleWebhookPayload(
  db: IndexerDb,
  body: CircleWebhookNotification,
  resolveLogIndex?: CircleLogIndexResolver,
): Promise<{ success: boolean; eventName?: string; pending?: boolean; duplicate?: boolean; error?: string }> {
  if (body.notificationType !== "contracts.eventLog" || !body.notification) {
    return { success: true };
  }
  if (body.notification.blockchain !== config.circleBlockchain) {
    return { success: false, error: `unexpected blockchain ${body.notification.blockchain}` };
  }

  const { contractAddress, txHash, blockHeight, topics, data } = body.notification;
  const logIndex = body.notification.logIndex === undefined
    ? await resolveLogIndex?.(body)
    : parseLogIndex(body.notification.logIndex);
  if (logIndex === undefined) {
    throw new Error("Circle webhook omitted logIndex and no Circle event-log resolver is configured");
  }
  // Preserve the canonical identity for deferred Swap/Sync processing too.
  body.notification.logIndex = logIndex;
  const eventId = circleEventId(body);
  const indexedEvents = db.collection<{ _id: string; processedAt: Date }>("indexedCircleEvents");
  if (await indexedEvents.findOne({ _id: eventId })) {
    return { success: true, duplicate: true };
  }
  const complete = async <T extends { success: boolean }>(result: T): Promise<T> => {
    if (result.success) {
      await indexedEvents.updateOne(
        { _id: eventId },
        { $setOnInsert: { processedAt: new Date() } },
        { upsert: true },
      );
    }
    return result;
  };
  if (!topics || topics.length === 0) return { success: false, error: "missing topics" };
  const timestamp = notificationTimestamp(body);

  let decoded;
  try {
    decoded = decodeEventLog({
      abi: allAbis,
      data: data || "0x",
      topics: topics as [`0x${string}`, ...`0x${string}`[]],
    });
  } catch (error) {
    console.warn(
      `[webhook] unhandled or unknown event on ${contractAddress}:`,
      error instanceof Error ? error.message : error,
    );
    return { success: true };
  }

  const eventName = decoded.eventName;
  const args = decoded.args as Record<string, unknown>;

  if (eventName === "TokenCreated") {
    if (contractAddress.toLowerCase() !== config.factoryAddress.toLowerCase()) {
      return { success: false, error: `unexpected TokenCreated emitter ${contractAddress}` };
    }
    const token = String(args.token).toLowerCase();
    await processTokenCreatedLog(db, {
      address: contractAddress,
      args: args as Parameters<typeof processTokenCreatedLog>[1]["args"],
      blockNumber: blockHeight,
      transactionHash: txHash,
      timestamp,
    });
    await db.collection<LaunchDoc>("launches").updateOne(
      { token },
      { $set: { token0IsToken: token < config.usdcAddress } },
    );
    return complete({ success: true, eventName });
  }

  if (eventName === "Traded") {
    const curveAddress = contractAddress.toLowerCase();
    const launch = await db.collection<LaunchDoc>("launches").findOne(
      { curve: curveAddress },
      { projection: { feeBps: 1 } },
    );
    if (!launch) return { success: false, error: `launch not found for curve ${curveAddress}` };

    const isBuy = Boolean(args.isBuy);
    const normalized = normalizeCurveUsdcAmounts(
      isBuy,
      BigInt(String(args.usdcAmount ?? 0)),
      BigInt(launch.feeBps ?? 100),
    );
    const doc: TradeDoc = {
      eventId,
      curveAddress,
      trader: String(args.trader).toLowerCase(),
      isBuy,
      usdcAmount: String(normalized.walletAmount),
      usdcGrossAmount: String(normalized.grossAmount),
      feeAmount: String(normalized.feeAmount),
      tokenAmount: String(args.tokenAmount),
      priceAfter: String(args.priceAfter),
      mcapAfter: String(args.mcapAfter),
      progressBpsAfter: Number(args.progressBpsAfter ?? 0),
      blockNumber: blockHeight,
      logIndex,
      txHash,
      timestamp,
      source: "curve",
    };

    await Promise.all([
      db.collection<TradeDoc>("trades").updateOne(
        {
          $or: [
            { eventId },
            { curveAddress, blockNumber: blockHeight, logIndex },
          ],
        },
        { $set: doc },
        { upsert: true },
      ),
      db.collection<LaunchDoc>("launches").updateOne(
        { curve: curveAddress },
        {
          $set: {
            price: doc.priceAfter,
            mcap: doc.mcapAfter,
            progressBps: doc.progressBpsAfter,
          },
        },
      ),
    ]);
    console.log(`[webhook] Traded indexed for curve ${curveAddress}: ${isBuy ? "BUY" : "SELL"}`);
    return complete({ success: true, eventName });
  }

  if (eventName === "Graduated") {
    const curveAddress = contractAddress.toLowerCase();
    const launch = await db.collection<LaunchDoc>("launches").findOne(
      { curve: curveAddress },
      { projection: { _id: 1 } },
    );
    if (!launch) return { success: false, error: `launch not found for curve ${curveAddress}` };
    const pool = String(args.pool).toLowerCase();
    const poolAddress = pool === "0x0000000000000000000000000000000000000000" ? undefined : pool;
    const $set: Record<string, unknown> = {
      graduated: true,
      graduatedAt: timestamp,
      graduationBlock: blockHeight,
      graduationTxHash: txHash,
      price: String(args.graduationPrice ?? 0),
      mcap: String(args.graduationMarketCap ?? 0),
    };
    if (poolAddress) $set.pool = poolAddress;
    await db.collection<LaunchDoc>("launches").updateOne({ curve: curveAddress }, { $set });
    console.log(`[webhook] Graduated indexed for curve ${curveAddress} -> pool ${poolAddress ?? "none"}`);
    return complete({ success: true, eventName });
  }

  if (eventName === "Sync") {
    const knownPool = await db.collection<LaunchDoc>("launches").findOne(
      { pool: contractAddress.toLowerCase() },
      { projection: { _id: 1 } },
    );
    if (!knownPool) return { success: false, error: `launch not found for pool ${contractAddress}` };
    const key = poolEventKey(txHash, logIndex + 1);
    const sync: PoolSyncDoc = {
      _id: key,
      reserve0: String(args.reserve0 ?? 0),
      reserve1: String(args.reserve1 ?? 0),
      expiresAt: new Date(Date.now() + PENDING_EVENT_TTL_MS),
    };
    await db.collection<PoolSyncDoc>("poolSyncs").updateOne(
      { _id: key },
      { $set: sync },
      { upsert: true },
    );
    const pending = await db.collection<PendingPoolSwapDoc>("pendingPoolSwaps").findOne({ _id: key });
    if (pending) {
      const pendingDecoded = decodeEventLog({
        abi: ammPairAbi,
        data: pending.payload.notification.data,
        topics: pending.payload.notification.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      await writePoolSwap(db, pending.payload, pendingDecoded.args as Record<string, unknown>, {
        reserve0: BigInt(sync.reserve0),
        reserve1: BigInt(sync.reserve1),
      });
      await Promise.all([
        db.collection<PendingPoolSwapDoc>("pendingPoolSwaps").deleteOne({ _id: key }),
        db.collection<PoolSyncDoc>("poolSyncs").deleteOne({ _id: key }),
      ]);
    }
    return complete({ success: true, eventName });
  }

  if (eventName === "Swap") {
    const key = poolEventKey(txHash, logIndex);
    const sync = await db.collection<PoolSyncDoc>("poolSyncs").findOne({ _id: key });
    if (!sync) {
      await db.collection<PendingPoolSwapDoc>("pendingPoolSwaps").updateOne(
        { _id: key },
        {
          $set: {
            payload: body,
            expiresAt: new Date(Date.now() + PENDING_EVENT_TTL_MS),
          },
        },
        { upsert: true },
      );
      return complete({ success: true, eventName, pending: true });
    }
    await writePoolSwap(db, body, args, {
      reserve0: BigInt(sync.reserve0),
      reserve1: BigInt(sync.reserve1),
    });
    await db.collection<PoolSyncDoc>("poolSyncs").deleteOne({ _id: key });
    return complete({ success: true, eventName });
  }

  return complete({ success: true });
}

export function verifyCircleSignatureWithPublicKey(
  rawBody: Buffer,
  signatureBase64: string,
  publicKeyBase64: string,
): boolean {
  const keyBytes = Buffer.from(publicKeyBase64, "base64");
  const spki = keyBytes[0] === 0x30 ? keyBytes : Buffer.concat([P256_SPKI_PREFIX, keyBytes]);
  const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });
  return verify("sha256", rawBody, publicKey, Buffer.from(signatureBase64, "base64"));
}

export function createCircleSignatureVerifier(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, string>();
  return async (rawBody: Buffer, keyId: string, signature: string): Promise<boolean> => {
    let publicKey = cache.get(keyId);
    if (!publicKey) {
      if (!config.circleApiKey) throw new Error("CIRCLE_API_KEY is required to verify Circle webhooks");
      const response = await fetchImpl(
        `https://api.circle.com/v2/notifications/publicKey/${encodeURIComponent(keyId)}`,
        { headers: { Authorization: `Bearer ${config.circleApiKey}` } },
      );
      if (!response.ok) throw new Error(`Circle public-key request failed (${response.status})`);
      const body = await response.json() as { data?: { publicKey?: string } };
      publicKey = body.data?.publicKey;
      if (!publicKey) throw new Error("Circle public-key response did not contain a public key");
      cache.set(keyId, publicKey);
    }
    return verifyCircleSignatureWithPublicKey(rawBody, signature, publicKey);
  };
}

export function startWebhookServer(
  db: IndexerDb,
  port = config.port,
  onTopologyChanged?: () => void,
  resolveLogIndex?: CircleLogIndexResolver,
) {
  const signatureVerifier = createCircleSignatureVerifier();
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.method !== "POST" || (req.url !== "/webhook" && req.url !== "/")) {
      res.writeHead(404);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > config.webhookMaxBodyBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      if (tooLarge) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        return;
      }

      try {
        const rawBody = Buffer.concat(chunks);
        if (config.verifyWebhookSignatures) {
          const keyId = req.headers["x-circle-key-id"];
          const signature = req.headers["x-circle-signature"];
          if (typeof keyId !== "string" || typeof signature !== "string") {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "missing Circle signature headers" }));
            return;
          }
          if (!await signatureVerifier(rawBody, keyId, signature)) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "invalid Circle signature" }));
            return;
          }
        }

        const payload = JSON.parse(rawBody.toString("utf8")) as CircleWebhookNotification;
        if (!payload.notificationId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "missing notificationId" }));
          return;
        }
        const processed = await db
          .collection<{ _id: string; processedAt: Date }>("webhookNotifications")
          .findOne({ _id: payload.notificationId });
        if (processed) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, duplicate: true }));
          return;
        }

        const result = await processCircleWebhookPayload(db, payload, resolveLogIndex);
        if (result.success) {
          await db.collection<{ _id: string; processedAt: Date }>("webhookNotifications").updateOne(
            { _id: payload.notificationId },
            { $setOnInsert: { processedAt: new Date() } },
            { upsert: true },
          );
        }
        if (
          result.success
          && (result.eventName === "TokenCreated" || result.eventName === "Graduated")
        ) {
          onTopologyChanged?.();
        }
        res.writeHead(result.success ? 200 : 409, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("[webhook] error handling request:", error);
        res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "2" });
        res.end(JSON.stringify({ error: "event processing temporarily unavailable" }));
      }
    });
  });

  server.listen(port, () => {
    console.log(`Circle webhook receiver listening on http://localhost:${port}/webhook`);
  });
  return server;
}
