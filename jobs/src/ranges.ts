import { type ParsedBlockResponse, type ParsedAccountsModeBlockResponse } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { json } from "@waffles/shared/solana";
import { sha, hex } from "@waffles/shared/rewards";
import { rpcConnection, rpcFetch, RpcDeferred } from "./rpc";
import type { Env } from "./env";
import { createdMints, flatten } from "./ingest";

export interface RangeJob {
  start: number;
  end: number;
  object_key: string | null;
  hash: string | null;
  complete: number;
  applied: number;
  retry_at: number;
  attempts: number;
}
export interface RangeArchive {
  version: 1 | 2;
  start: number;
  end: number;
  slots: number[];
  blocks: { slot: number; block: ParsedBlockResponse; signatures?: string[] }[];
  history?: {
    queries: Record<string, HistoryQuery>;
    bootstrap?: { rangesBefore: number; eventsBefore: number; rangesDone: boolean; eventsDone: boolean; startRead: boolean };
    watermark?: { slots: number[]; time: number | null };
  };
}
interface Anchor { signature: string; slot: number }
interface SignatureRow extends Anchor { err: unknown }
interface HistoryQuery {
  anchor?: Anchor;
  pages: { before: string | null; rows: SignatureRow[] }[];
}
// web3.js 1.99 types full parsed responses as accounts-only. Validate the
// requested instruction-bearing shape rather than trusting that declaration.
function fullBlock(block: ParsedBlockResponse | ParsedAccountsModeBlockResponse): block is ParsedBlockResponse {
  return block.transactions.every((tx) => "message" in tx.transaction &&
    Array.isArray(tx.transaction.message.instructions));
}
async function replayObject(env: Env, key: string | null, hash: string | null): Promise<unknown> {
  const object = key && await env.ARTIFACTS.get(key);
  if (!object) throw new Error("Replay artifact missing");
  const raw = await new Response(
    object.body.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  if (hex(await sha(new TextEncoder().encode(raw))) !== hash)
    throw new Error("Range replay artifact checksum mismatch");
  return JSON.parse(raw);
}
export async function readRange(env: Env, job: RangeJob): Promise<RangeArchive> {
  const archive = await replayObject(env, job.object_key, job.hash) as RangeArchive;
  if (![1, 2].includes(archive.version) || archive.start !== job.start || archive.end !== job.end ||
      archive.blocks.length > archive.slots.length ||
      archive.slots.some((slot, i) => !Number.isSafeInteger(slot) || slot < job.start ||
        slot > job.end || (i > 0 && slot <= archive.slots[i - 1])) ||
      archive.blocks.some((entry, i) => (archive.version === 1 ? entry.slot !== archive.slots[i] : !archive.slots.includes(entry.slot)) ||
        !Number.isSafeInteger(entry.block.blockTime) || !fullBlock(entry.block) ||
        !Number.isSafeInteger(entry.block.parentSlot) || entry.block.parentSlot >= entry.slot))
    throw new Error("Invalid range replay artifact");
  if (new Set(archive.blocks.map((entry) => entry.slot)).size !== archive.blocks.length)
    throw new Error("Duplicate block in range replay artifact");
  return archive;
}

// Retain relevant transactions from canonical candidate blocks. The caller adds
// only event-verified Waffles mints; merely mentioning a foreign mint is insufficient.
export function relevantBlock(
  block: ParsedBlockResponse, mints: Set<string>, programId: string,
  accounts = new Set<string>(),
) {
  const transactions = block.transactions.filter((tx) => {
    if (tx.meta?.err) return false;
    const keys = tx.transaction.message.accountKeys.map(({ pubkey }) => String(pubkey));
    const balances = [...(tx.meta?.preTokenBalances ?? []), ...(tx.meta?.postTokenBalances ?? [])];
    const waffles = keys.includes(programId);
    const relevant = waffles || (keys.includes(TOKEN_PROGRAM_ID.toBase58()) &&
      (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances || !balances.length ||
       balances.some((balance) => mints.has(balance.mint)) || keys.some((key) => accounts.has(key))));
    if (relevant) for (const balance of balances) {
      if (mints.has(balance.mint)) accounts.add(keys[balance.accountIndex]);
    }
    if (relevant) for (const ix of flatten(tx)) {
      if (String(ix.programId) === TOKEN_PROGRAM_ID.toBase58() && "parsed" in ix &&
          ["initializeAccount", "initializeAccount2", "initializeAccount3"].includes(ix.parsed.type) &&
          mints.has(ix.parsed.info.mint)) accounts.add(ix.parsed.info.account);
    }
    return relevant;
  });
  return { ...block, transactions };
}

async function rpcReplies(env: Env, calls: { id: string | number; method: string; params: unknown[] }[]) {
  if (!calls.length) return [];
  const response = await rpcFetch(env, json(calls.map((call) => ({ jsonrpc: "2.0", ...call }))));
  if (response.status === 429 || response.status === 503) {
    await response.body?.cancel();
    throw new RpcDeferred(Date.now() + Math.max(1, Number(response.headers.get("Retry-After")) || 5) * 1000);
  }
  if (!response.ok) throw new Error(`History RPC batch failed (${response.status})`);
  const replies = await response.json() as { id: string | number; result?: unknown; error?: { code: number } }[];
  if (!Array.isArray(replies) || replies.length !== calls.length ||
      new Set(replies.map((reply) => reply.id)).size !== calls.length ||
      replies.some((reply) => !calls.some((call) => call.id === reply.id)))
    throw new Error("Incomplete history RPC batch response");
  return replies;
}
async function rpcBlocks(env: Env, slots: number[]) {
  const replies = await rpcReplies(env, slots.map((slot) => ({
    id: slot, method: "getBlock", params: [slot, { encoding: "jsonParsed", commitment: "finalized",
      maxSupportedTransactionVersion: 1, transactionDetails: "full", rewards: false }],
  })));
  return new Map(replies.map((reply) => {
    const block = reply.result as ParsedBlockResponse | undefined;
    return [Number(reply.id), block && Number.isSafeInteger(block.blockTime) && fullBlock(block)
      ? block : new Error(`Finalized block ${reply.id} unavailable`)] as const;
  }));
}

function batchSize(env: Env) {
  return Math.min(4, Math.max(1,
    Math.floor((Math.max(80, Number(env.RPC_CU_PER_SECOND ?? 40)) - 10) / 40),
  ));
}

// One bounded fetch turn. Partial archives survive failures and are reused on
// the next alarm; no per-block queue messages, database rows, or retry writes.
export async function fetchRange(env: Env, job: RangeJob) {
  const archive = job.object_key ? await readRange(env, job) : await newHistory(env, job);
  if (archive.version === 2) return fetchHistory(env, job, archive);
  if (archive.slots.some((slot, i) => !Number.isSafeInteger(slot) || slot < job.start ||
      slot > job.end || (i > 0 && slot <= archive.slots[i - 1])))
    throw new Error("Invalid finalized slot range");
  const rows = await env.DB.prepare("SELECT mint FROM markets").all<{ mint: string }>();
  const mints = new Set(rows.results.map((row) => row.mint));
  const tracked = await env.DB.prepare("SELECT address FROM token_accounts").all<{ address: string }>();
  const accounts = new Set(tracked.results.map((row) => row.address));
  for (const entry of archive.blocks) {
    for (const mint of createdMints(env, entry.block)) mints.add(mint);
    relevantBlock(entry.block, mints, env.PROGRAM_ID, accounts);
  }
  // Reuse already archived history from the previous per-block implementation.
  const legacy = await env.DB.prepare(
    "SELECT slot,object_key,hash FROM pending_blocks WHERE slot BETWEEN ? AND ?",
  ).bind(job.start, job.end).all<{ slot: number; object_key: string; hash: string }>();
  const saved = new Map(legacy.results.map((row) => [row.slot, row]));
  const deadline = Date.now() + 45_000;
  const count = batchSize(env);
  let failure: unknown;
  while (archive.blocks.length < archive.slots.length && Date.now() < deadline) {
    const slots = archive.slots.slice(archive.blocks.length, archive.blocks.length + count);
    const started = Date.now();
    const remoteCount = slots.filter((slot) => !saved.has(slot)).length;
    const remote = rpcBlocks(env, slots.filter((slot) => !saved.has(slot)));
    const fetched = await Promise.allSettled(slots.map(async (slot) => {
      const old = saved.get(slot);
      if (old) {
        const object = await env.ARTIFACTS.get(old.object_key);
        if (!object) throw new Error("Archived block missing");
        const raw = await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).text();
        if (hex(await sha(new TextEncoder().encode(raw))) !== old.hash)
          throw new Error("Replay artifact checksum mismatch");
        return JSON.parse(raw) as ParsedBlockResponse;
      }
      const block = (await remote).get(slot);
      if (!block || block instanceof Error) throw block ?? new Error("Block response missing");
      return block;
    }));
    // Only append a contiguous prefix. Later successes cannot bridge a gap.
    for (let i = 0; i < fetched.length; i++) {
      const result = fetched[i];
      if (result.status === "rejected") {
        failure ??= result.reason;
        continue;
      }
      if (!failure) {
        for (const mint of createdMints(env, result.value)) mints.add(mint);
        archive.blocks.push({ slot: slots[i], block: relevantBlock(result.value, mints, env.PROGRAM_ID, accounts) });
      }
    }
    if (failure instanceof RpcDeferred && failure.retryAt < deadline) {
      // Short shared-budget waits stay inside this turn instead of writing
      // another archive/checkpoint for every small RPC burst.
      const wait = Math.max(1, failure.retryAt - Date.now());
      await new Promise((resolve) => setTimeout(resolve, wait));
      failure = undefined;
      continue;
    }
    if (failure) break;
    // Pace normal traffic locally so the shared limiter does not need to
    // reject every burst. Its guard still enforces account-wide contention.
    const delay = Math.ceil(remoteCount * 40 / (Number(env.RPC_CU_PER_SECOND ?? 40) / 2) * 1000) - (Date.now() - started);
    if (delay > 0 && archive.blocks.length < archive.slots.length && Date.now() + delay < deadline)
      await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return retainArchive(env, job, archive, archive.blocks.length === archive.slots.length, failure);
}
async function retainArchive(env: Env, job: RangeJob, archive: RangeArchive, complete: boolean, failure?: unknown) {
  const raw = new TextEncoder().encode(json(archive));
  if (raw.byteLength > 16 * 1024 * 1024)
    throw new Error("Range replay input exceeds 16 MB; ingestion stopped safely");
  const hash = hex(await sha(raw));
  const objectKey = `ranges/${job.start}/${hash}.json.gz`;
  const compressed = await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  await env.ARTIFACTS.put(objectKey, compressed, {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
  });
  const retryAt = failure instanceof RpcDeferred ? failure.retryAt : failure
    ? Date.now() + Math.min(300_000, 2000 * 2 ** Math.min(job.attempts, 7))
    : Date.now();
  await env.DB.prepare(
    "UPDATE ingestion_ranges SET object_key=?,hash=?,complete=?,retry_at=?,attempts=attempts+?,last_error=? WHERE start=? AND applied=0",
  ).bind(objectKey, hash, complete ? 1 : 0, retryAt, failure ? 1 : 0,
    failure instanceof RpcDeferred ? "rpc_deferred" : failure ? "fetch_failed" : null, job.start).run();
  console.log(json({ event: "range_archived", start: job.start, end: job.end,
    version: archive.version, blocks: archive.blocks.length, total: archive.slots.length, complete, retryAt,
    ...(failure instanceof Error ? { reason: failure.message } : {}),
  }));
  return { complete, retryAt };
}

function anchorsFrom(archive: RangeArchive) {
  const anchors = new Map<string, Anchor>();
  for (const [address, query] of Object.entries(archive.history?.queries ?? {}))
    if (query.anchor) anchors.set(address, query.anchor);
  for (const { slot, block } of [...archive.blocks].sort((a, b) => a.slot - b.slot)) {
    for (const tx of block.transactions) {
      if (tx.meta?.err) continue;
      for (const { pubkey } of tx.transaction.message.accountKeys) {
        const address = String(pubkey);
        if (address in (archive.history?.queries ?? {}))
          anchors.set(address, { slot, signature: tx.transaction.signatures[0] });
      }
    }
  }
  return anchors;
}
async function newHistory(env: Env, job: RangeJob): Promise<RangeArchive> {
  const previous = await env.DB.prepare(
    "SELECT * FROM ingestion_ranges WHERE start<? AND applied=1 ORDER BY start DESC LIMIT 1",
  ).bind(job.start).first<RangeJob>();
  const prior = previous ? await readRange(env, previous) : null;
  const anchors = prior?.version === 2 ? anchorsFrom(prior) : new Map<string, Anchor>();
  const accounts = await env.DB.prepare("SELECT address FROM token_accounts").all<{ address: string }>();
  const roots = new Set([env.PROGRAM_ID, ...accounts.results.map((row) => row.address), ...anchors.keys()]);
  return {
    version: 2, start: job.start, end: job.end, slots: [], blocks: [],
    history: {
      queries: Object.fromEntries([...roots].map((address) => [address, { anchor: anchors.get(address), pages: [] }])),
      bootstrap: { rangesBefore: job.start, eventsBefore: job.start, rangesDone: false, eventsDone: false, startRead: false },
    },
  };
}
function learnAnchors(archive: RangeArchive, slot: number, block: ParsedBlockResponse) {
  for (const tx of block.transactions) {
    if (tx.meta?.err) continue;
    for (const { pubkey } of tx.transaction.message.accountKeys) {
      const query = archive.history!.queries[String(pubkey)];
      if (query && !query.anchor) query.anchor = { slot, signature: tx.transaction.signatures[0] };
    }
  }
}
async function bootstrapHistory(env: Env, archive: RangeArchive, deadline: number) {
  const history = archive.history!, cursor = history.bootstrap!;
  const missing = () => Object.values(history.queries).some((query) => !query.anchor);
  if (!missing()) return;
  if (!cursor.rangesDone) {
    const rows = await env.DB.prepare(
      "SELECT * FROM ingestion_ranges WHERE start<? AND applied=1 ORDER BY start DESC LIMIT 8",
    ).bind(cursor.rangesBefore).all<RangeJob>();
    for (const row of rows.results) {
      if (Date.now() >= deadline) return;
      const saved = await readRange(env, row);
      for (const entry of [...saved.blocks].reverse()) learnAnchors(archive, entry.slot, entry.block);
      cursor.rangesBefore = row.start;
      if (!missing()) return;
    }
    cursor.rangesDone = rows.results.length < 8;
  }
  if (!cursor.eventsDone) {
    const rows = await env.DB.prepare(
      "SELECT DISTINCT p.slot,p.object_key,p.hash FROM indexed_events e JOIN pending_blocks p ON p.slot=e.slot WHERE e.slot<? ORDER BY e.slot DESC LIMIT 8",
    ).bind(cursor.eventsBefore).all<{ slot: number; object_key: string; hash: string }>();
    for (const row of rows.results) {
      if (Date.now() >= deadline) return;
      const block = await replayObject(env, row.object_key, row.hash) as ParsedBlockResponse;
      if (!fullBlock(block)) throw new Error("Invalid bootstrap block");
      learnAnchors(archive, row.slot, block);
      cursor.eventsBefore = row.slot;
      if (!missing()) return;
    }
    cursor.eventsDone = rows.results.length < 8;
  }
  if (cursor.rangesDone && cursor.eventsDone && !cursor.startRead) {
    const start = Number(env.START_SLOT);
    const blocks = await rpcBlocks(env, [start]);
    const block = blocks.get(start);
    if (!block || block instanceof Error) throw new Error("Deployment history unavailable for bootstrap");
    learnAnchors(archive, start, block);
    cursor.startRead = true;
    if (start >= archive.start && start <= archive.end) {
      archive.slots = [...new Set([...archive.slots, start])].sort((a, b) => a - b);
      archive.blocks.push({ slot: start, block, signatures: block.transactions.map((tx) => tx.transaction.signatures[0]) });
    }
  }
  if (cursor.rangesDone && cursor.eventsDone && cursor.startRead && missing())
    throw new Error("Cannot anchor tracked account history from retained replay inputs");
}
function queryComplete(query: HistoryQuery, start: number) {
  if (!query.anchor || !query.pages.length) return false;
  let before: string | null = null, slot = Infinity, found = false;
  const seen = new Set<string>();
  for (const page of query.pages) {
    if (page.before !== before || !Array.isArray(page.rows) || page.rows.length > 1000)
      throw new Error("Invalid history pagination");
    for (const row of page.rows) {
      if (!row || typeof row.signature !== "string" || !row.signature || seen.has(row.signature) ||
          !Number.isSafeInteger(row.slot) || row.slot < 0 || row.slot > slot ||
          (row.err !== null && typeof row.err !== "object" && typeof row.err !== "string"))
        throw new Error("Invalid or repeated history receipt");
      seen.add(row.signature);
      slot = row.slot;
      if (row.signature === query.anchor.signature) {
        if (row.slot !== query.anchor.slot || row.err !== null) throw new Error("History anchor conflicts with replay input");
        found = true;
      }
    }
    before = page.rows.at(-1)?.signature ?? before;
  }
  const last = query.pages.at(-1)!;
  if (last.rows.length < 1000 && !found) throw new Error("Recorded history anchor missing from RPC results");
  return found && (last.rows.length < 1000 || slot < start);
}
function historyAccounts(env: Env, archive: RangeArchive, mints: Set<string>, accounts: Set<string>) {
  for (const entry of [...archive.blocks].sort((a, b) => a.slot - b.slot))
    for (const mint of createdMints(env, entry.block)) mints.add(mint);
  for (const entry of archive.blocks) relevantBlock(entry.block, mints, env.PROGRAM_ID, accounts);
  return accounts;
}
export async function verifyHistory(env: Env, archive: RangeArchive) {
  if (archive.version !== 2 || !archive.history?.watermark) throw new Error("History coverage missing");
  const { queries, watermark } = archive.history;
  const known = await env.DB.prepare("SELECT address FROM token_accounts").all<{ address: string }>();
  const rows = await env.DB.prepare("SELECT mint FROM markets").all<{ mint: string }>();
  const required = historyAccounts(env, archive, new Set(rows.results.map((row) => row.mint)),
    new Set([env.PROGRAM_ID, ...known.results.map((row) => row.address)]));
  for (const address of required) if (!queries[address]) throw new Error("Unqueried token account in history coverage");
  if (watermark.slots.some((slot, i) => !Number.isSafeInteger(slot) || slot < archive.start || slot > archive.end ||
      (i > 0 && slot <= watermark.slots[i - 1])) ||
      (watermark.slots.length ? !Number.isSafeInteger(watermark.time) : watermark.time !== null))
    throw new Error("Invalid finalized history watermark");
  if (archive.blocks.length !== archive.slots.length ||
      archive.blocks.some((entry, i) => entry.slot !== archive.slots[i] || !watermark.slots.includes(entry.slot)))
    throw new Error("Missing candidate history block");
  const blocks = new Map(archive.blocks.map((entry) => [entry.slot, entry]));
  const expected = new Set<number>();
  for (const query of Object.values(queries)) {
    if (!queryComplete(query, archive.start)) throw new Error("Incomplete account history coverage");
    for (const { rows } of query.pages) for (const row of rows) {
      if (row.err !== null || row.slot < archive.start || row.slot > archive.end) continue;
      expected.add(row.slot);
      if (!blocks.get(row.slot)?.signatures?.includes(row.signature))
        throw new Error("History receipt missing from canonical block");
    }
  }
  if (archive.slots.some((slot) => !expected.has(slot))) throw new Error("Unexpected history candidate block");
}
export function programHistoryHead(archive: RangeArchive, programId: string) {
  const query = archive.history?.queries[programId];
  return query?.pages.flatMap((page) => page.rows).find((row) => row.slot <= archive.end)?.signature;
}
export async function programHistoryChanged(env: Env, signature: string, head: number) {
  const [reply] = await rpcReplies(env, [{ id: env.PROGRAM_ID, method: "getSignaturesForAddress",
    params: [env.PROGRAM_ID, { commitment: "finalized", minContextSlot: head, limit: 1 }],
  }]);
  if (reply.error || !Array.isArray(reply.result)) throw new Error("Program history hint unavailable");
  // An empty index must be verified by the full reader, never treated as quiet.
  return reply.result[0]?.signature !== signature;
}
async function fetchHistory(env: Env, job: RangeJob, archive: RangeArchive) {
  const deadline = Date.now() + 45_000;
  let failure: unknown;
  const history = archive.history!;
  const markets = await env.DB.prepare("SELECT mint FROM markets").all<{ mint: string }>();
  const mints = new Set(markets.results.map((row) => row.mint));
  historyAccounts(env, archive, mints, new Set(Object.keys(history.queries)));
  while (Date.now() < deadline) {
    try {
      if (Object.values(history.queries).some((query) => !query.anchor)) {
        await bootstrapHistory(env, archive, deadline);
        if (Object.values(history.queries).some((query) => !query.anchor)) continue;
      }
      const pending = Object.entries(history.queries).filter(([, query]) => !queryComplete(query, archive.start));
      if (pending.length) {
        const count = batchSize(env);
        const batch = pending.slice(0, count);
        const replies = await rpcReplies(env, batch.map(([address, query]) => ({
          id: address, method: "getSignaturesForAddress", params: [address, {
            commitment: "finalized", minContextSlot: archive.end, limit: 1000,
            ...(query.pages.at(-1)?.rows.at(-1) ? { before: query.pages.at(-1)!.rows.at(-1)!.signature } : {}),
          }],
        })));
        for (const reply of replies) {
          if (reply.error || !Array.isArray(reply.result)) throw new Error("Account history RPC unavailable");
          const query = history.queries[String(reply.id)];
          query.pages.push({ before: query.pages.at(-1)?.rows.at(-1)?.signature ?? null,
            rows: reply.result.map((row) => ({ signature: row.signature, slot: row.slot, err: row.err })) });
          try { queryComplete(query, archive.start); }
          catch (error) { query.pages.pop(); throw error; }
          for (const row of query.pages.at(-1)!.rows)
            if (row.err === null && row.slot >= archive.start && row.slot <= archive.end)
              archive.slots = [...new Set([...archive.slots, row.slot])].sort((a, b) => a - b);
        }
        continue;
      }
      const loaded = new Set(archive.blocks.map((entry) => entry.slot));
      const missing = archive.slots.filter((slot) => !loaded.has(slot)).slice(0, batchSize(env));
      if (missing.length) {
        const replies = await rpcBlocks(env, missing);
        for (const slot of missing) {
          const block = replies.get(slot);
          if (!block || block instanceof Error) throw block ?? new Error("Candidate block unavailable");
          for (const mint of createdMints(env, block)) mints.add(mint);
          const accounts = new Set(Object.keys(history.queries).filter((address) => address !== env.PROGRAM_ID));
          const filtered = relevantBlock(block, mints, env.PROGRAM_ID, accounts);
          archive.blocks.push({ slot, block: filtered, signatures: block.transactions.map((tx) => tx.transaction.signatures[0]) });
          archive.blocks.sort((a, b) => a.slot - b.slot);
          for (const address of accounts) if (!history.queries[address]) {
            const tx = filtered.transactions.find((tx) => tx.transaction.message.accountKeys.some(({ pubkey }) => String(pubkey) === address));
            if (!tx) throw new Error("New token account has no transaction anchor");
            history.queries[address] = { anchor: { slot, signature: tx.transaction.signatures[0] }, pages: [] };
          }
        }
        continue;
      }
      if (!history.watermark) {
        const connection = rpcConnection(env);
        const slots = await connection.getBlocks(job.start, job.end, "finalized");
        const time = slots.length ? await connection.getBlockTime(slots.at(-1)!) : null;
        if (slots.length && !Number.isSafeInteger(time)) throw new Error("Finalized boundary time unavailable");
        history.watermark = { slots, time };
      }
      await verifyHistory(env, archive);
      return retainArchive(env, job, archive, true);
    } catch (error) {
      if (error instanceof RpcDeferred && error.retryAt < deadline) {
        const wait = Math.max(1, error.retryAt - Date.now());
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      failure = error;
      break;
    }
  }
  return retainArchive(env, job, archive, false, failure);
}
