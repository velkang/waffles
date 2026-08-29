import assert from "node:assert/strict";
import test from "node:test";
import { CircleMonitorManager } from "./circle-monitors.js";

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
