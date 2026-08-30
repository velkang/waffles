import assert from "node:assert/strict";
import test from "node:test";
import { CircleMonitorManager } from "./circle-monitors.js";
import type { CircleWebhookNotification } from "./webhook.js";

test("reconciler imports every event source and creates all required monitors idempotently", async () => {
  const launches = [
    {
      curve: "0x2222222222222222222222222222222222222222",
      pool: "0x6666666666666666666666666666666666666666",
    },
  ];
  const db = {
    collection(name: string) {
      assert.equal(name, "launches");
      return {
        find() {
          return { async toArray() { return launches; } };
        },
      };
    },
  } as any;

  const imports: any[] = [];
  const monitors: any[] = [];
  const client = {
    async importContract(input: any) {
      imports.push(input);
      return {};
    },
    async createEventMonitor(input: any) {
      monitors.push(input);
      return {};
    },
    async listEventMonitors() {
      return { data: { eventMonitors: [] } };
    },
  } as any;

  const manager = new CircleMonitorManager(db, client, "ARC-TESTNET");
  await manager.reconcile();
  await manager.reconcile();

  assert.equal(imports.length, 3, "factory, curve, and pool should each be imported once");
  assert.equal(monitors.length, 5, "factory, curve events, and pool events should all be monitored");
  assert.deepEqual(
    new Set(monitors.map((monitor) => monitor.eventSignature)),
    new Set([
      "TokenCreated(address,address,address,string,string,string,string,string,string,string,uint256,uint256)",
      "Traded(address,bool,uint256,uint256,uint256,uint256,uint256)",
      "Graduated(address,address,uint256,uint256)",
      "Swap(address,address,uint256,uint256,uint256,uint256)",
      "Sync(uint256,uint256)",
    ]),
  );

  const idempotencyKeys = [...imports, ...monitors].map((request) => request.idempotencyKey);
  assert.equal(new Set(idempotencyKeys).size, idempotencyKeys.length);
  for (const key of idempotencyKeys) {
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("reconciler reuses and enables an existing monitor without creating it", async () => {
  const db = {
    collection() {
      return { find() { return { async toArray() { return []; } }; } };
    },
  } as any;
  const updates: any[] = [];
  const client = {
    async importContract() { return {}; },
    async listEventMonitors(input: any) {
      return {
        data: {
          eventMonitors: [{
            id: "existing",
            isEnabled: false,
            contractAddress: input.contractAddress,
            eventSignature: input.eventSignature,
          }],
        },
      };
    },
    async createEventMonitor() {
      assert.fail("existing monitor must not be recreated");
    },
    async updateEventMonitor(input: any) { updates.push(input); return {}; },
  } as any;

  await new CircleMonitorManager(db, client, "ARC-TESTNET").reconcile();
  assert.deepEqual(updates, [{ id: "existing", isEnabled: true }]);
});

test("retries an expired Circle idempotency key with a fresh UUID", async () => {
  const db = {
    collection() {
      return { find() { return { async toArray() { return []; } }; } };
    },
  } as any;
  const keys: string[] = [];
  const client = {
    async importContract() { return {}; },
    async listEventMonitors() { return { data: { eventMonitors: [] } }; },
    async createEventMonitor(input: any) {
      keys.push(input.idempotencyKey);
      if (keys.length === 1) throw { code: 175403 };
      return {};
    },
  } as any;

  await new CircleMonitorManager(db, client, "ARC-TESTNET").reconcile();
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
});

test("resolves the log index omitted by Circle webhooks from Circle event logs", async () => {
  const signatureHash = `0x${"11".repeat(32)}` as const;
  const txHash = `0x${"22".repeat(32)}` as const;
  const contractAddress = `0x${"33".repeat(20)}` as const;
  const blockHash = `0x${"44".repeat(32)}` as const;
  const data = `0x${"55".repeat(32)}` as const;
  const calls: any[] = [];
  const client = {
    async listEventLogs(input: any) {
      calls.push(input);
      return {
        data: {
          eventLogs: [{
            id: "event-log-id",
            blockchain: "ARC-TESTNET",
            contractAddress,
            txHash,
            blockHash,
            blockHeight: 123,
            logIndex: "17",
            eventSignature: "Traded(address,bool,uint256,uint256,uint256,uint256,uint256)",
            eventSignatureHash: signatureHash,
            topics: [signatureHash],
            data,
            userOpHash: "",
            firstConfirmDate: "2026-08-30T10:00:00.000Z",
          }],
        },
      };
    },
  } as any;
  const body: CircleWebhookNotification = {
    notificationType: "contracts.eventLog",
    notification: {
      blockchain: "ARC-TESTNET",
      contractAddress,
      txHash,
      blockHash,
      blockHeight: 123,
      eventSignatureHash: signatureHash,
      topics: [signatureHash],
      data,
      firstConfirmDate: "2026-08-30T10:00:00.000Z",
    },
    timestamp: "2026-08-30T10:00:01.000Z",
  };

  const manager = new CircleMonitorManager({} as any, client, "ARC-TESTNET");
  assert.equal(await manager.resolveLogIndex(body), 17);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contractAddress, contractAddress);
  assert.equal(calls[0].from, "2026-08-30T09:58:00.000Z");
  assert.equal(calls[0].to, "2026-08-30T10:02:01.000Z");
});
