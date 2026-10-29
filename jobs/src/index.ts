import { rpcConnection, RpcDeferred } from "./rpc";
import { DurableObject } from "cloudflare:workers";
import { program, fundAddress, zeroKey } from "@waffles/shared/client";
import { epochAt, json } from "@waffles/shared/solana";
import { sha, hex } from "@waffles/shared/rewards";
import { fetchBlock, applyBlock } from "./ingest";
import { flushOwnership } from "./settlement";
import {
  keepMarkets,
  settleHolders,
  protocolDistribution,
  reconcileMarkets,
} from "./operations";
import { oracle, accountPendingPrices } from "./oracle";
import type { Env } from "./env";
export { RpcBudget } from "./rpc";
export { Settlement } from "./settlement";
export class Coordinator extends DurableObject<Env> {
  private chain: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.catch(() => {}).then(fn);
    this.chain = next;
    return next;
  }
  async fetch(request: Request) {
    return this.serial(async () => {
      const path = new URL(request.url).pathname;
      if (path === "/discover") {
        await this.ctx.storage.setAlarm(Date.now() + 1);
        return new Response("scheduled");
      }
      if (path === "/snapshot") {
        const { at } = (await request.json()) as { at: number };
        const complete = await this.env.DB.prepare(
          "SELECT value FROM checkpoints WHERE id='complete-time'",
        ).first<{ value: string }>();
        if (
          !Number.isSafeInteger(at) ||
          !complete ||
          Number(complete.value) < at
        )
          return new Response("Indexing incomplete", { status: 409 });
        await flushOwnership(this.env, at);
        return new Response("closed");
      }
      await this.apply();
      return new Response("applied");
    });
  }
  async alarm() {
    await this.serial(async () => {
      // Rearm before work so failures cannot silently stop scheduling.
      await this.ctx.storage.setAlarm(Date.now() + 2000);
      for (const work of [() => this.apply(), () => this.discover()]) {
        try {
          await work();
        } catch (error) {
          console.error("ingestion", String(error));
        }
      }
      const last = (await this.ctx.storage.get<number>("maintenance-at")) ?? 0;
      if (Date.now() - last >= 60_000) {
        await this.ctx.storage.put("maintenance-at", Date.now());
        try {
          await maintain(this.env);
        } catch (error) {
          console.error("maintenance", String(error));
        }
      }
    });
  }
  private async discover() {
    if (!this.env.GENESIS_HASH || Number(this.env.START_SLOT) <= 0)
      throw new Error(
        "Set GENESIS_HASH and START_SLOT to the verified deployment slot",
      );
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>();
    let start = Math.max(
      saved ? Number(saved.value) + 1 : Number(this.env.START_SLOT),
      ((await this.ctx.storage.get<number>("empty-through")) ?? 0) + 1,
    );
    let window = await this.ctx.storage.get<{
      start: number;
      end: number;
      slots: number[];
    }>("discovery-window");
    if (window && start > window.end) window = undefined;
    if (
      window &&
      start >= window.start &&
      !window.slots.some((slot) => slot >= start)
    ) {
      start = window.end + 1;
      await this.ctx.storage.put("empty-through", window.end);
      window = undefined;
    }
    if (!window || start < window.start) {
      const connection = rpcConnection(this.env);
      const head = await connection.getSlot("finalized");
      if (start > head) return;
      const end = Math.min(head, start + 99);
      const slots = await connection.getBlocks(start, end, "finalized");
      window = { start, end, slots };
      await this.ctx.storage.put("discovery-window", window);
      await this.env.DB.prepare(
        "INSERT INTO checkpoints(id,value) VALUES('discovered-slot',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
        .bind(String(end))
        .run();
    }
    const slot = window.slots.find((slot) => slot >= start);
    if (slot === undefined) return;
    const archived = await this.env.DB.prepare(
      "SELECT slot FROM pending_blocks WHERE slot=?",
    )
      .bind(slot)
      .first();
    if (archived) return;
    // A durable lease recovers messages lost to expiry, crashes, or the dead-letter queue.
    const job = await this.env.DB.prepare(
      "SELECT retry_at FROM fetch_jobs WHERE slot=?",
    )
      .bind(slot)
      .first<{ retry_at: number }>();
    if (job && job.retry_at > Date.now()) return;
    const later = await this.env.DB.prepare(
      "SELECT slot FROM pending_blocks WHERE slot>? ORDER BY slot LIMIT 1",
    )
      .bind(slot)
      .first();
    if (later || job) {
      // Repair a known gap ahead of the old queue backlog; archived jobs remain reusable.
      await runFetchJob(this.env, slot);
      return;
    }
    await this.env.DB.prepare(
      "INSERT INTO fetch_jobs(slot,retry_at) VALUES(?,?) ON CONFLICT(slot) DO UPDATE SET retry_at=excluded.retry_at",
    )
      .bind(slot, Date.now() + 120_000)
      .run();
    await this.env.BLOCKS.send({ slot });
  }

  private async apply() {
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>();
    let previous = saved ? Number(saved.value) : null;
    const ready = await this.env.DB.prepare(
      "SELECT slot,parent,object_key,hash FROM pending_blocks WHERE applied=0 ORDER BY slot LIMIT 1",
    ).all<{ slot: number; parent: number; object_key: string; hash: string }>();
    for (const row of ready.results) {
      if (previous === null && row.slot !== Number(this.env.START_SLOT)) break;
      if (previous !== null && row.parent !== previous) break;
      const object = await this.env.ARTIFACTS.get(row.object_key);
      if (!object) throw new Error("Archived block missing");
      const raw = await new Response(
        object.body.pipeThrough(new DecompressionStream("gzip")),
      ).text();
      if (hex(await sha(new TextEncoder().encode(raw))) !== row.hash)
        throw new Error("Replay artifact checksum mismatch");
      const block = JSON.parse(raw);
      await applyBlock(this.env, row.slot, block);
      await flushOwnership(this.env, block.blockTime);
      previous = row.slot;
    }
    await this.publish();
  }
  private async publish() {
    const rows = await this.env.DB.prepare(
      "SELECT sequence,type,mint,wallet,data FROM outbox WHERE published=0 ORDER BY sequence LIMIT 100",
    ).all<{
      sequence: number;
      type: string;
      mint: string;
      wallet: string;
      data: string;
    }>();
    if (!rows.results.length) return;
    const response = await this.env.API.fetch(
      "https://api.internal/v1/internal/publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.OPERATIONS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: json(
          rows.results.map((r) => ({ ...r, data: JSON.parse(r.data) })),
        ),
      },
    );
    if (!response.ok) throw new Error("Live outbox delivery failed");
    await this.env.DB.batch(
      rows.results.map((r) =>
        this.env.DB.prepare(
          "UPDATE outbox SET published=1 WHERE sequence=?",
        ).bind(r.sequence),
      ),
    );
  }
}
async function maintain(env: Env) {
  if (!env.GENESIS_HASH) return;
  const connection = rpcConnection(env),
    epoch = epochAt(Math.floor(Date.now() / 1000));
  const fund = (await program(connection).account["fund"].fetchNullable(
    fundAddress(0, zeroKey, epoch),
  )) as { amount: { toString(): string } } | null;
  await env.DB.prepare(
    "INSERT INTO epochs(epoch,status,pool_sol) VALUES(?,'open',?) ON CONFLICT(epoch) DO UPDATE SET pool_sol=excluded.pool_sol WHERE status='open'",
  )
    .bind(epoch, fund?.amount.toString() ?? "0")
    .run();
  try {
    await accountPendingPrices(env);
    await oracle(env, Math.floor(Date.now() / 1000) - 3);
  } catch (e) {
    console.warn("oracle", String(e));
  }
  try {
    await reconcileMarkets(env);
  } catch (error) {
    console.error("custody_reconciliation", String(error));
  }
  if (env.KEEPER_SECRET) await keepMarkets(env);
  if (env.FINALIZER_SECRET) {
    const due = await env.DB.prepare(
      "SELECT epoch FROM epochs WHERE epoch<? AND status IN ('open','snapshot') ORDER BY epoch LIMIT 1",
    )
      .bind(epoch)
      .first<{ epoch: number }>();
    if (due) {
      try {
        await env.SETTLEMENT.create({
          id: `epoch-${due.epoch}`,
          params: { epoch: due.epoch },
        });
      } catch (error) {
        console.warn("settlement exists or unavailable", String(error));
      }
    }
  }
}

async function runFetchJob(env: Env, slot: number) {
  try {
    await fetchBlock(env, slot);
    await env.DB.prepare("DELETE FROM fetch_jobs WHERE slot=?")
      .bind(slot)
      .run();
  } catch (error) {
    const job = await env.DB.prepare(
      "SELECT attempts FROM fetch_jobs WHERE slot=?",
    )
      .bind(slot)
      .first<{ attempts: number }>();
    const attempts = (job?.attempts ?? 0) + 1;
    const retryAt =
      error instanceof RpcDeferred
        ? error.retryAt
        : Date.now() +
          Math.min(300_000, 2000 * 2 ** Math.min(attempts, 8)) +
          Math.random() * 1000;
    await env.DB.prepare(
      "INSERT INTO fetch_jobs(slot,attempts,retry_at,last_error) VALUES(?,?,?,?) ON CONFLICT(slot) DO UPDATE SET attempts=excluded.attempts,retry_at=excluded.retry_at,last_error=excluded.last_error",
    )
      .bind(
        slot,
        attempts,
        retryAt,
        error instanceof RpcDeferred ? "rpc_deferred" : "fetch_failed",
      )
      .run();
    console.warn(
      json({
        event: "block_deferred",
        slot: slot,
        attempts,
        retryAt,
      }),
    );
  }
}

export default {
  async queue(batch: MessageBatch<{ slot: number }>, env: Env) {
    for (const message of batch.messages) {
      await runFetchJob(env, message.body.slot);
      message.ack();
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.OPERATIONS_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.OPERATIONS_TOKEN}`
    )
      return new Response("Unauthorized", { status: 401 });
    try {
      const path = new URL(request.url).pathname;
      if (path === "/start") {
        return env.COORDINATOR.get(env.COORDINATOR.idFromName("devnet")).fetch(
          "https://coordinator/discover",
          { method: "POST" },
        );
      }
      const body = (await request.json()) as {
        epoch?: number;
        slot?: number;
        mint?: string;
        amount?: string;
        rewards?: { wallet: string; amount: string }[];
      };
      if (path === "/settle") {
        const epoch = body.epoch;
        if (!Number.isSafeInteger(epoch)) throw new Error("Epoch required");
        const workflow = await env.SETTLEMENT.create({
          id: `epoch-${epoch}`,
          params: { epoch: epoch! },
        });
        return Response.json({ id: workflow.id });
      }
      if (path === "/replay") {
        if (
          !Number.isSafeInteger(body.slot) ||
          body.slot! < Number(env.START_SLOT)
        )
          throw new Error("Invalid slot");
        await env.BLOCKS.send({ slot: body.slot! });
        return Response.json({ scheduled: true });
      }
      if (path === "/holders") {
        await settleHolders(env, body.epoch!);
        return Response.json({ settled: true });
      }
      if (path === "/incentives") {
        await protocolDistribution(env, body.epoch!, body.rewards ?? []);
        return Response.json({ settled: true });
      }
      if (path === "/incentives-buyback") {
        if (!body.mint || !body.amount || !/^[0-9]+$/.test(body.amount))
          throw new Error("Target mint and integer lamport amount required");
        await keepMarkets(env, {
          mint: body.mint,
          amount: BigInt(body.amount),
        });
        return Response.json({ checked: true });
      }
      if (path === "/keeper") {
        await keepMarkets(env);
        return Response.json({ submitted: true });
      }
      return new Response("Unknown operation", { status: 404 });
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 409 });
    }
  },
} satisfies ExportedHandler<Env, { slot: number }>;
