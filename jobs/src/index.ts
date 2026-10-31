import { rpcConnection, RpcDeferred } from "./rpc";
import { DurableObject } from "cloudflare:workers";
import { program, fundAddress, zeroKey } from "@waffles/shared/client";
import { epochAt, json } from "@waffles/shared/solana";
import { applyBlock } from "./ingest";
import { fetchRange, readRange, verifyHistory, programHistoryHead, programHistoryChanged, type RangeJob } from "./ranges";
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
  private programHead?: { through: number; signature: string };
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
      if (path === "/range") {
        const { start } = await request.json() as { start: number };
        if (!Number.isSafeInteger(start) || start < Number(this.env.START_SLOT))
          return new Response("Invalid range", { status: 400 });
        // A queue delivery is only a wakeup. The database is authoritative.
        await this.ctx.storage.setAlarm(Date.now() + 5000);
        try {
          const job = await this.range();
          if (job && job.start === start && !job.complete &&
              (job.retry_at <= Date.now() || (!job.object_key && job.attempts === 0)))
            await this.download(job);
        } catch (error) {
          if (!await this.pauseForQuota(error)) throw error;
        }
        return new Response("retained");
      }
      await this.apply();
      return new Response("applied");
    });
  }
  async alarm() {
    await this.serial(async () => {
      const resumeAt = await this.ctx.storage.get<number>("d1-resume-at");
      if (resumeAt && resumeAt > Date.now()) {
        await this.ctx.storage.setAlarm(resumeAt);
        return;
      }
      // Rearm before work so failures cannot silently stop scheduling.
      await this.ctx.storage.setAlarm(Date.now() + 5000);
      for (const work of [() => this.apply(), () => this.discover()]) {
        try {
          await work();
        } catch (error) {
          if (await this.pauseForQuota(error)) return;
          if (error instanceof RpcDeferred) {
            await this.ctx.storage.setAlarm(Math.max(Date.now() + 5000, error.retryAt));
            return;
          }
          console.error("ingestion", String(error));
        }
      }
      const last = (await this.ctx.storage.get<number>("maintenance-at")) ?? 0;
      if (Date.now() - last >= 60_000) {
        await this.ctx.storage.put("maintenance-at", Date.now());
        try {
          await maintain(this.env);
        } catch (error) {
          if (await this.pauseForQuota(error)) return;
          console.error("maintenance", String(error));
        }
      }
    });
  }
  private async pauseForQuota(error: unknown) {
    const resumeAt = quotaResetAt(error);
    if (!resumeAt) return false;
    await this.ctx.storage.put("d1-resume-at", resumeAt);
    await this.ctx.storage.setAlarm(resumeAt);
    console.warn(json({ event: "d1_quota_pause", resumeAt }));
    return true;
  }
  private async reserve(kind: "messages" | "writes", count: number) {
    const day = new Date().toISOString().slice(0, 10);
    const saved = await this.ctx.storage.get<{ day: string; messages: number; writes: number }>("ingestion-budget");
    const budget = saved?.day === day ? saved : { day, messages: 0, writes: 0 };
    // 1,500 messages normally cost 4,500 Queue operations. Reserve headroom
    // for retries, maintenance, API traffic, and other apps on this account.
    const limit = kind === "messages" ? 1500 : 40_000;
    if (budget[kind] + count > limit) throw new IngestionPaused(nextReset(), `${kind} budget`);
    budget[kind] += count;
    // Reserve before side effects. A crash can overcount, never undercount.
    await this.ctx.storage.put("ingestion-budget", budget);
  }
  private async range() {
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>();
    return this.env.DB.prepare(
      "SELECT * FROM ingestion_ranges WHERE start>? AND applied=0 ORDER BY start LIMIT 1",
    ).bind(saved ? Number(saved.value) : Number(this.env.START_SLOT) - 1).first<RangeJob>();
  }
  private async download(job: RangeJob) {
    await this.reserve("writes", 8);
    try {
      const result = await fetchRange(this.env, job);
      if (result.complete || result.retryAt <= Date.now())
        await this.ctx.storage.setAlarm(Date.now() + 1);
      else await this.ctx.storage.setAlarm(result.retryAt);
    } catch (error) {
      if (quotaResetAt(error)) throw error;
      const retryAt = error instanceof RpcDeferred ? error.retryAt : Date.now() + 30_000;
      await this.env.DB.prepare(
        "UPDATE ingestion_ranges SET retry_at=?,attempts=attempts+1,last_error='fetch_failed' WHERE start=? AND applied=0",
      ).bind(retryAt, job.start).run();
      console.error(json({ event: "range_deferred", start: job.start, retryAt }));
    }
  }
  private async discover() {
    if (!this.env.GENESIS_HASH || Number(this.env.START_SLOT) <= 0)
      throw new Error("Set GENESIS_HASH and START_SLOT to the verified deployment slot");
    const pending = await this.range();
    if (pending) {
      // Recover lost/expired messages without producing a second queue job.
      if (!pending.complete && pending.retry_at <= Date.now()) await this.download(pending);
      return;
    }
    const queueResume = await this.ctx.storage.get<number>("queue-resume-at");
    let queued = !queueResume || queueResume <= Date.now();
    const saved = await this.env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>();
    const start = saved ? Number(saved.value) + 1 : Number(this.env.START_SLOT);
    const head = await rpcConnection(this.env).getSlot("finalized");
    if (start > head) return;
    if (head - start < 255) {
      const through = start - 1;
      if (this.programHead?.through !== through) {
        const previous = await this.env.DB.prepare(
          "SELECT * FROM ingestion_ranges WHERE start<=? AND applied=1 ORDER BY start DESC LIMIT 1",
        ).bind(through).first<RangeJob>();
        const archive = previous ? await readRange(this.env, previous) : null;
        const signature = archive ? programHistoryHead(archive, this.env.PROGRAM_ID) : undefined;
        this.programHead = signature ? { through, signature } : undefined;
      }
      // Quiet periods batch to 256 slots; Waffles calls wake promptly instead.
      if (this.programHead && !await programHistoryChanged(this.env, this.programHead.signature, head)) return;
      if (!this.programHead && head - start < 127) return;
    }
    const end = Math.min(head, start + 8191);
    if (queued) {
      try {
        await this.reserve("messages", 1);
      } catch (error) {
        if (!(error instanceof IngestionPaused)) throw error;
        queued = false;
        await this.ctx.storage.put("queue-resume-at", error.retryAt);
      }
    }
    await this.reserve("writes", 4);
    await this.env.DB.prepare(
      "INSERT INTO ingestion_ranges(start,end,retry_at) VALUES(?,?,?)",
    ).bind(start, end, Date.now() + (queued ? 120_000 : 0)).run();
    console.log(json({ event: "range_scheduled", start, end, wakeup: queued ? "queue" : "alarm" }));
    if (!queued) return;
    try {
      await this.env.BLOCKS.send({ start, end });
    } catch (error) {
      // The range already exists durably; its lease will recover it.
      const reset = quotaResetAt(error);
      if (reset) {
        await this.ctx.storage.put("queue-resume-at", reset);
        await this.env.DB.prepare("UPDATE ingestion_ranges SET retry_at=? WHERE start=?")
          .bind(Date.now(), start).run();
      } else throw error;
    }
  }

  private async apply() {
    const job = await this.range();
    if (!job?.complete) { await this.publish(); return; }
    if (job.retry_at > Date.now()) return;
    try {
      const archive = await readRange(this.env, job);
      if (archive.blocks.length !== archive.slots.length)
        throw new Error("Incomplete range cannot advance history");
      const saved = await this.env.DB.prepare(
        "SELECT id,value FROM checkpoints WHERE id IN ('complete-slot','complete-block','complete-time')",
      ).all<{ id: string; value: string }>();
      const values = new Map(saved.results.map((row) => [row.id, Number(row.value)]));
      const through = values.get("complete-slot");
      if (job.start !== (through === undefined ? Number(this.env.START_SLOT) : through + 1))
        throw new Error("Range does not follow the complete checkpoint");
      if (through === undefined && archive.slots[0] !== Number(this.env.START_SLOT))
        throw new Error("Deployment block missing from finalized range");
      let previous = values.get("complete-block") ?? through;
      let time = values.get("complete-time");
      if (archive.version === 2) {
        // Sparse blocks need account-graph coverage, not adjacent-block parents.
        await verifyHistory(this.env, archive);
        const watermark = archive.history!.watermark!;
        previous = watermark.slots.at(-1) ?? previous;
        if (watermark.time !== null) time = Math.max(time ?? watermark.time, watermark.time);
      } else {
        // Preserve verification for an in-flight archive from the old reader.
        for (const { slot, block } of archive.blocks) {
          if (previous !== undefined && block.parentSlot !== previous)
            throw new Error("Missing finalized block in range");
          previous = slot;
          time = Math.max(time ?? block.blockTime!, block.blockTime!);
        }
      }
      const reserveWrites = (rows: number) => this.reserve("writes", rows);
      await reserveWrites(8);
      for (const { slot, block } of archive.blocks) {
        if (block.transactions.length)
          await applyBlock(this.env, slot, block, { reserveWrites });
      }
      if (time !== undefined)
        await flushOwnership(this.env, time, { accrueHolders: false, reserveWrites });
      const statements = [
        this.env.DB.prepare("UPDATE ingestion_ranges SET applied=1 WHERE start=?").bind(job.start),
        this.env.DB.prepare(
          "INSERT INTO checkpoints(id,value) VALUES('complete-slot',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        ).bind(String(job.end)),
      ];
      if (previous !== undefined) statements.push(this.env.DB.prepare(
        "INSERT INTO checkpoints(id,value) VALUES('complete-block',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      ).bind(String(previous)));
      if (time !== undefined) statements.push(this.env.DB.prepare(
        "INSERT INTO checkpoints(id,value) VALUES('complete-time',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      ).bind(String(time)));
      await this.env.DB.batch(statements);
      const signature = programHistoryHead(archive, this.env.PROGRAM_ID);
      this.programHead = signature ? { through: job.end, signature } : undefined;
      await this.ctx.storage.setAlarm(Date.now() + 1);
      console.log(json({ event: "range_applied", start: job.start, end: job.end, time }));
      await this.publish();
    } catch (error) {
      if (!quotaResetAt(error)) {
        await this.reserve("writes", 2);
        await this.env.DB.prepare(
          "UPDATE ingestion_ranges SET retry_at=?,last_error='apply_failed' WHERE start=? AND applied=0",
        ).bind(Date.now() + 30_000, job.start).run();
      }
      throw error;
    }
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
    await this.reserve("writes", rows.results.length * 3);
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

function nextReset() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) + 5000;
}
class IngestionPaused extends Error {
  constructor(public readonly retryAt: number, reason: string) { super(reason); }
}
function quotaResetAt(error: unknown): number | null {
  if (error instanceof IngestionPaused) return error.retryAt;
  const message = String(error) + (error instanceof Error ? String(error.cause ?? "") : "");
  if ((/D1/i.test(message) && /free tier daily row (read|write) limit/i.test(message)) ||
      (/(queue|operations)/i.test(message) && /(daily|quota).*(limit|exceed)|exceed.*(daily|quota)/i.test(message)))
    return nextReset();
  return null;
}

export default {
  async queue(batch: MessageBatch<{ start: number; end: number } | { slot: number }>, env: Env) {
    for (const message of batch.messages) {
      const ranged = "start" in message.body;
      const response = await env.COORDINATOR.get(env.COORDINATOR.idFromName("devnet")).fetch(
        ranged ? "https://coordinator/range" : "https://coordinator/discover",
        { method: "POST", ...(ranged ? { body: json(message.body) } : {}) },
      );
      // Legacy per-block messages only wake the same durable range pipeline.
      if (!response.ok) throw new Error("Range coordinator unavailable");
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
        await env.COORDINATOR.get(env.COORDINATOR.idFromName("devnet")).fetch(
          "https://coordinator/discover", { method: "POST" },
        );
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
} satisfies ExportedHandler<Env, { start: number; end: number } | { slot: number }>;
