import { DurableObject } from "cloudflare:workers";
import { Connection } from "@solana/web3.js";
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
import { oracle } from "./oracle";
import type { Env } from "./env";
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
        await this.discover();
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
      await this.apply();
      await this.discover();
    });
  }
  private async discover() {
    if (!this.env.GENESIS_HASH || Number(this.env.START_SLOT) <= 0)
      throw new Error(
        "Set GENESIS_HASH and START_SLOT to the verified deployment slot",
      );
    const connection = new Connection(this.env.RPC_URL, "finalized");
    if ((await connection.getGenesisHash()) !== this.env.GENESIS_HASH)
      throw new Error("Wrong Solana cluster");
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='discovered-slot'",
    ).first<{ value: string }>();
    const start = saved ? Number(saved.value) + 1 : Number(this.env.START_SLOT),
      head = await connection.getSlot("finalized");
    if (start <= head) {
      const end = Math.min(head, start + 99);
      const slots = await connection.getBlocks(start, end, "finalized");
      if (slots.length)
        await this.env.BLOCKS.sendBatch(
          slots.map((slot) => ({ body: { slot } })),
        );
      // The discovery checkpoint moves only after all corresponding sends succeed.
      await this.env.DB.prepare(
        "INSERT INTO checkpoints(id,value) VALUES('discovered-slot',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
        .bind(String(end))
        .run();
    }
    await this.ctx.storage.setAlarm(Date.now() + 2000);
  }
  private async apply() {
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>();
    let previous = saved ? Number(saved.value) : null;
    const ready = await this.env.DB.prepare(
      "SELECT slot,parent,object_key,hash FROM pending_blocks WHERE applied=0 ORDER BY slot LIMIT 20",
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
export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        try {
          await env.COORDINATOR.get(env.COORDINATOR.idFromName("devnet")).fetch(
            "https://coordinator/discover",
            { method: "POST" },
          );
        } catch (e) {
          console.error("ingestion", String(e));
        }
        if (!env.GENESIS_HASH) return;
        const connection = new Connection(env.RPC_URL, "finalized"),
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
      })(),
    );
  },
  async queue(batch: MessageBatch<{ slot: number }>, env: Env) {
    await Promise.all(
      batch.messages.map(async (message) => {
        try {
          await fetchBlock(env, message.body.slot);
          message.ack();
        } catch (error) {
          console.error("block job", message.body.slot, String(error));
          message.retry({ delaySeconds: 30 });
        }
      }),
    );
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.OPERATIONS_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.OPERATIONS_TOKEN}`
    )
      return new Response("Unauthorized", { status: 401 });
    try {
      const path = new URL(request.url).pathname;
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
