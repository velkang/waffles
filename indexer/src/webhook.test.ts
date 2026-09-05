import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { encodeEventTopics, encodeAbiParameters, getAbiItem, type TransactionReceipt } from "viem";
import { ammPairAbi, factoryAbi, curveAbi } from "./ingest.js";
import { config } from "./config.js";
import {
  processCircleWebhookPayload,
  recoverCreationTrades,
  verifyCircleSignatureWithPublicKey,
  type CircleWebhookNotification,
} from "./webhook.js";

// Minimal mock database for testing webhook ingestion
function createMockDb() {
  const launchesMap = new Map<string, any>();
  const tradesMap = new Map<string, any>();
  const pendingPoolSwapsMap = new Map<string, any>();
  const poolSyncsMap = new Map<string, any>();
  const indexedCircleEventsMap = new Map<string, any>();

  const db = {
    collection(name: string) {
      if (name === "launches") {
        return {
          async findOne(filter: any) {
            for (const doc of launchesMap.values()) {
              let match = true;
              for (const [k, v] of Object.entries(filter)) {
                if (doc[k] !== v) match = false;
              }
              if (match) return doc;
            }
            return null;
          },
          async updateOne(filter: any, update: any, options?: any) {
            const key = [...launchesMap.keys()].find((key) => {
              const doc = launchesMap.get(key);
              return filter.token ? doc.token === filter.token : doc.curve === filter.curve;
            }) ?? filter.token ?? filter.curve;
            let doc = launchesMap.get(key) || {};
            if (filter.price?.$exists === false && doc.price !== undefined) return { matchedCount: 0 };
            if (filter.graduated?.$ne === true && doc.graduated === true) return { matchedCount: 0 };
            if (update.$set) doc = { ...doc, ...update.$set };
            if (update.$setOnInsert && options?.upsert && !launchesMap.has(key)) {
              doc = { ...doc, ...update.$setOnInsert };
            }
            launchesMap.set(key, doc);
            return { acknowledged: true };
          },
        };
      }
      if (name === "trades") {
        return {
          async updateOne(filter: any, update: any) {
            const eventId = filter.eventId
              ?? filter.$or?.find((candidate: any) => candidate.eventId)?.eventId;
            const natural = filter.$or?.find(
              (candidate: any) => candidate.curveAddress && candidate.blockNumber !== undefined,
            ) ?? filter;
            const key = eventId
              ?? `${filter.curveAddress}:${filter.blockNumber}:${filter.logIndex}`;
            const legacyKey = `${natural.curveAddress}:${natural.blockNumber}:${natural.logIndex}`;
            let doc = tradesMap.get(key) || tradesMap.get(legacyKey) || {};
            if (update.$set) doc = { ...doc, ...update.$set };
            if (key !== legacyKey) tradesMap.delete(legacyKey);
            tradesMap.set(key, doc);
            return { acknowledged: true };
          },
        };
      }
      if (name === "indexedCircleEvents") {
        return {
          async findOne(filter: any) {
            return indexedCircleEventsMap.get(filter._id) ?? null;
          },
          async updateOne(filter: any, update: any) {
            indexedCircleEventsMap.set(filter._id, {
              ...(indexedCircleEventsMap.get(filter._id) ?? {}),
              _id: filter._id,
              ...(update.$setOnInsert ?? {}),
            });
            return { acknowledged: true };
          },
        };
      }
      const map = name === "pendingPoolSwaps" ? pendingPoolSwapsMap
        : name === "poolSyncs" ? poolSyncsMap
        : undefined;
      if (map) {
        return {
          async findOne(filter: any) {
            return map.get(filter._id) ?? null;
          },
          async updateOne(filter: any, update: any) {
            map.set(filter._id, { ...(map.get(filter._id) ?? {}), _id: filter._id, ...(update.$set ?? {}) });
            return { acknowledged: true };
          },
          async deleteOne(filter: any) {
            map.delete(filter._id);
            return { acknowledged: true };
          },
        };
      }
      throw new Error(`unknown collection: ${name}`);
    },
    _launches: launchesMap,
    _trades: tradesMap,
    _pendingPoolSwaps: pendingPoolSwapsMap,
    _poolSyncs: poolSyncsMap,
    _indexedCircleEvents: indexedCircleEventsMap,
  };
  return db as any;
}

function creationFixture() {
  const db = createMockDb();
  const token = "0x1111111111111111111111111111111111111111" as const;
  const curve = "0x2222222222222222222222222222222222222222" as const;
  const creator = "0x3333333333333333333333333333333333333333" as const;

  const topics = encodeEventTopics({
    abi: factoryAbi,
    eventName: "TokenCreated",
    args: {
      token,
      curve,
      creator,
    },
  });

  const eventItem = getAbiItem({ abi: factoryAbi, name: "TokenCreated" });
  const nonIndexedInputs = eventItem.inputs.filter((i) => !("indexed" in i && i.indexed));
  const data = encodeAbiParameters(nonIndexedInputs as any, [
    "SuperToken",
    "SUPER",
    "A super token",
    "ipfs://image",
    "https://super.fun",
    "@supertoken",
    "t.me/supertoken",
    0n,
    1000000n,
  ]);

  const payload: CircleWebhookNotification = {
    notificationType: "contracts.eventLog",
    notification: {
      contractAddress: config.factoryAddress,
      blockchain: "ARC-TESTNET",
      txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      blockHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      blockHeight: 123456,
      logIndex: 7,
      topics: topics as `0x${string}`[],
      data,
      firstConfirmDate: "2026-01-26T12:00:00Z",
    },
    timestamp: "2026-01-26T12:00:01Z",
  };

  return { db, token, curve, creator, payload };
}

function creationReceipt(payload: CircleWebhookNotification, logs: any[] = []): TransactionReceipt {
  return {
    status: "success",
    transactionHash: payload.notification.txHash,
    blockNumber: BigInt(payload.notification.blockHeight),
    blockHash: payload.notification.blockHash,
    logs,
  } as TransactionReceipt;
}

function devBuyLog(curve: `0x${string}`, trader: `0x${string}`) {
  const event = getAbiItem({ abi: curveAbi, name: "Traded" });
  return {
    address: curve,
    topics: encodeEventTopics({ abi: curveAbi, eventName: "Traded", args: { trader, isBuy: true } }),
    data: encodeAbiParameters(event.inputs.filter((input) => !input.indexed) as any,
      [5_000_000n, 10_000_000n * 10n ** 18n, 123n, 123_000_000n, 400n]),
    logIndex: 8,
  };
}

test("creation without a dev buy completes receipt recovery once", async () => {
  const { db, token, payload } = creationFixture();
  let reads = 0;
  const readReceipt = async () => { reads += 1; return creationReceipt(payload); };
  const result = await processCircleWebhookPayload(db, payload, undefined, { readReceipt });
  assert.equal(result.success, true);
  assert.equal(result.eventName, "TokenCreated");
  await recoverCreationTrades(db, db._launches.get(token), readReceipt);
  assert.equal(reads, 1);
  assert.equal(db._trades.size, 0);

  const stored = db._launches.get(token.toLowerCase());
  assert.ok(stored);
  assert.equal(stored.name, "SuperToken");
  assert.equal(stored.symbol, "SUPER");
  assert.equal(stored.feeBps, 0);
  assert.equal(stored.twitter, "@supertoken");
  assert.equal(stored.graduated, false);
});

test("creation recovers the dev buy and deduplicates a later Circle delivery", async () => {
  const { db, token, curve, creator, payload } = creationFixture();
  const log = devBuyLog(curve, creator);
  const receipt = creationReceipt(payload, [
    { ...log, address: token }, // unrelated emitter must not become a curve trade
    { ...log, topics: payload.notification.topics, data: payload.notification.data },
    log,
  ]);
  await processCircleWebhookPayload(db, payload, undefined, { readReceipt: async () => receipt });
  assert.equal(db._trades.size, 1);
  const trade = [...db._trades.values()][0] as any;
  assert.equal(trade.trader, creator);
  assert.equal(trade.usdcAmount, "5000000");
  assert.equal(trade.logIndex, 8);
  assert.equal(trade.txHash, payload.notification.txHash);
  assert.equal(trade.timestamp.getTime(), Date.parse(payload.notification.firstConfirmDate!));
  assert.equal(db._launches.get(token).price, "123");

  const delivered = await processCircleWebhookPayload(db, {
    ...payload,
    notification: { ...payload.notification, contractAddress: curve,
      topics: log.topics as `0x${string}`[], data: log.data, logIndex: log.logIndex,
      eventSignatureHash: log.topics[0] as `0x${string}` },
  });
  assert.equal(delivered.duplicate, true);
  assert.equal(db._trades.size, 1);
});

test("receipt failure is retryable and is not acknowledged as completed", async () => {
  const { db, token, curve, creator, payload } = creationFixture();
  await assert.rejects(processCircleWebhookPayload(db, payload, undefined, {
    readReceipt: async () => { throw new Error("receipt not yet available"); },
  }), /receipt not yet available/);
  assert.equal(db._indexedCircleEvents.size, 0);
  assert.ok(db._launches.get(token), "launch remains discoverable for monitor setup and recovery");
  const result = await processCircleWebhookPayload(db, payload, undefined, {
    readReceipt: async () => creationReceipt(payload, [devBuyLog(curve, creator)]),
  });
  assert.equal(result.success, true);
  assert.equal(db._trades.size, 1);
});

for (const graduated of [false, true]) {
test(`existing launch recovery preserves newer metrics (graduated=${graduated})`, async () => {
  const { db, token, curve, creator, payload } = creationFixture();
  await processCircleWebhookPayload(db, payload, undefined, {
    readReceipt: async () => creationReceipt(payload),
  });
  // Model a launch indexed by the old indexer, without a completed receipt marker.
  db._indexedCircleEvents.clear();
  const launch = db._launches.get(token);
  Object.assign(launch, { price: "999", mcap: "999000000", progressBps: 10000,
    graduated, pool: "0x6666666666666666666666666666666666666666" });
  const before = { ...launch };
  let reads = 0;
  const readReceipt = async () => { reads += 1; return creationReceipt(payload, [devBuyLog(curve, creator)]); };
  await recoverCreationTrades(db, launch, readReceipt);
  await recoverCreationTrades(db, launch, readReceipt);
  assert.equal(reads, 1);
  assert.equal(db._trades.size, 1);
  assert.deepEqual(db._launches.get(token), before);
});

}

test("webhook ingests Traded event and updates launch metrics", async () => {
  const db = createMockDb();
  const curve = "0x2222222222222222222222222222222222222222" as const;

  // Pre-seed launch in db
  db._launches.set(curve.toLowerCase(), {
    curve: curve.toLowerCase(),
    token: "0x1111111111111111111111111111111111111111",
    feeBps: 100,
  });

  const topics = encodeEventTopics({
    abi: curveAbi,
    eventName: "Traded",
    args: {
      trader: "0x5555555555555555555555555555555555555555",
      isBuy: true,
    },
  });

  const eventItem = getAbiItem({ abi: curveAbi, name: "Traded" });
  const nonIndexedInputs = eventItem.inputs.filter((i) => !("indexed" in i && i.indexed));
  const data = encodeAbiParameters(nonIndexedInputs as any, [
    100_000_000n,
    50_000_000_000_000_000_000n,
    2000n,
    2000000n,
    500n,
  ]);

  const payload: CircleWebhookNotification = {
    notificationType: "contracts.eventLog",
    notification: {
      contractAddress: curve,
      blockchain: "ARC-TESTNET",
      txHash: "0x9999999999999999999999999999999999999999999999999999999999999999",
      blockHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
      blockHeight: 123457,
      logIndex: 8,
      topics: topics as `0x${string}`[],
      data,
      firstConfirmDate: "2026-01-26T12:05:00Z",
    },
    timestamp: "2026-01-26T12:05:01Z",
  };

  const result = await processCircleWebhookPayload(db, payload);
  assert.equal(result.success, true);
  assert.equal(result.eventName, "Traded");

  const launch = db._launches.get(curve.toLowerCase());
  assert.equal(launch.price, "2000");
  assert.equal(launch.mcap, "2000000");
  assert.equal(launch.progressBps, 500);

  const secondPayload: CircleWebhookNotification = {
    ...payload,
    notification: {
      ...payload.notification,
      txHash: "0x7777777777777777777777777777777777777777777777777777777777777777",
      logIndex: undefined,
    },
  };
  let resolverCalls = 0;
  await processCircleWebhookPayload(db, secondPayload, async (received) => {
    resolverCalls += 1;
    assert.equal(received, secondPayload);
    return 9;
  });
  assert.equal(resolverCalls, 1);
  assert.equal(secondPayload.notification.logIndex, 9);
  assert.equal(db._trades.size, 2, "distinct Circle event logs must not collide");

  const duplicate = await processCircleWebhookPayload(db, secondPayload, async () => 9);
  assert.equal(duplicate.duplicate, true);
  assert.equal(db._trades.size, 2);
});

test("webhook reconciles a Swap that arrives before its matching Sync", async () => {
  const db = createMockDb();
  const pool = "0x6666666666666666666666666666666666666666" as const;
  const curve = "0x2222222222222222222222222222222222222222";
  db._launches.set(curve, {
    curve,
    token: "0x1111111111111111111111111111111111111111",
    pool,
  });

  const swapTopics = encodeEventTopics({
    abi: ammPairAbi,
    eventName: "Swap",
    args: {
      sender: "0x5555555555555555555555555555555555555555",
      to: "0x5555555555555555555555555555555555555555",
    },
  });
  const swapItem = getAbiItem({ abi: ammPairAbi, name: "Swap" });
  const swapData = encodeAbiParameters(
    swapItem.inputs.filter((input) => !("indexed" in input && input.indexed)) as any,
    [0n, 100_000_000n, 50_000_000_000_000_000_000n, 0n],
  );
  const baseNotification = {
    contractAddress: pool,
    blockchain: "ARC-TESTNET",
    txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    blockHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
    blockHeight: 123458,
    firstConfirmDate: "2026-01-26T12:06:00Z",
  };
  const swapPayload: CircleWebhookNotification = {
    notificationType: "contracts.eventLog",
    notification: {
      ...baseNotification,
      logIndex: 13,
      topics: swapTopics as `0x${string}`[],
      data: swapData,
    },
    timestamp: "2026-01-26T12:06:01Z",
  };
  const pending = await processCircleWebhookPayload(db, swapPayload);
  assert.equal(pending.pending, true);
  assert.equal(db._trades.size, 0);

  const syncTopics = encodeEventTopics({ abi: ammPairAbi, eventName: "Sync" });
  const syncItem = getAbiItem({ abi: ammPairAbi, name: "Sync" });
  const syncData = encodeAbiParameters(syncItem.inputs as any, [900_000_000_000_000_000_000n, 1_800_000_000n]);
  const syncPayload: CircleWebhookNotification = {
    notificationType: "contracts.eventLog",
    notification: {
      ...baseNotification,
      logIndex: 12,
      topics: syncTopics as `0x${string}`[],
      data: syncData,
    },
    timestamp: "2026-01-26T12:06:01Z",
  };
  await processCircleWebhookPayload(db, syncPayload);

  assert.equal(db._trades.size, 1);
  const trade = [...db._trades.values()][0];
  assert.notEqual(trade.priceAfter, "0");
  assert.equal(trade.logIndex, 13);
  assert.equal(trade.usdcAmount, "100000000");
  assert.equal(trade.usdcGrossAmount, "100000000");
  assert.equal(trade.feeAmount, "1000000");
  assert.equal(db._pendingPoolSwaps.size, 0);
});

test("verifies Circle ECDSA webhook signatures against the raw request body", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const rawBody = Buffer.from('{"notificationType":"contracts.eventLog"}');
  const signature = sign("sha256", rawBody, privateKey).toString("base64");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const rawPublicKey = spki.subarray(spki.length - 65).toString("base64");

  assert.equal(verifyCircleSignatureWithPublicKey(rawBody, signature, rawPublicKey), true);
  assert.equal(verifyCircleSignatureWithPublicKey(Buffer.from("tampered"), signature, rawPublicKey), false);
});
