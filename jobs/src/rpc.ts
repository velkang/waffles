import { DurableObject } from "cloudflare:workers";
import { Connection, type Commitment } from "@solana/web3.js";

interface RpcEnv {
  RPC: DurableObjectNamespace;
  RPC_URL: string;
  GENESIS_HASH: string;
  RPC_CU_PER_SECOND?: string;
}
interface RpcCall { method: string; id?: unknown }
interface Budget {
  at: number;
  tokens: number;
  background: number;
  until: number;
  failures: number;
}
export class RpcDeferred extends Error {
  constructor(public readonly retryAt: number) {
    super("RPC temporarily busy; retry after the shared cooldown");
  }
}
// AbortSignal.timeout leaves its timer pending after a fast response, and a
// pending timer keeps a Durable Object active (and billed) until it fires.
export async function fetchWithTimeout(url: string | URL, init: RequestInit, ms = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
// Upstream network checks are cached per isolate; a cold isolate pays one
// budgeted getGenesisHash before its first call.
const verifiedUpstreams = new Set<string>();
function deferred(wait: number, id: unknown) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code: -32005, message: "RPC busy. Please retry shortly." },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(wait / 1000))),
        "Cache-Control": "no-store",
      },
    },
  );
}
// The limiter only grants capacity. Callers perform the upstream request so
// the Durable Object is never held open (and billed) while Alchemy responds.
export async function rpcFetch(env: RpcEnv, body: string, background = true) {
  if (body.length > 100_000)
    return new Response("RPC request too large", { status: 413 });
  let calls: RpcCall[];
  try {
    const parsed = JSON.parse(body);
    calls = Array.isArray(parsed) ? parsed : [parsed];
    if (!calls.length || calls.length > 4 ||
        calls.some((call) => !call || typeof call.method !== "string") ||
        (Array.isArray(parsed) && (!background || calls.some((call) => !["getBlock", "getSignaturesForAddress"].includes(call.method)))))
      throw new Error();
  } catch {
    return new Response("Invalid RPC request", { status: 400 });
  }
  const id = calls[0].id;
  const upstream = `${env.RPC_URL}\n${env.GENESIS_HASH}`;
  const verify = !verifiedUpstreams.has(upstream);
  const limiter = env.RPC.get(env.RPC.idFromName("devnet"));
  const grant = await limiter.fetch("https://rpc.internal/reserve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ methods: calls.map((call) => call.method), id, background, verify }),
  });
  if (!grant.ok) return grant;
  await grant.body?.cancel();
  const failed = async (response: Response | null) => {
    await response?.body?.cancel();
    return limiter.fetch("https://rpc.internal/failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status: response?.status ?? null,
        retryAfter: response?.headers.get("Retry-After") ?? null,
      }),
    });
  };
  try {
    if (verify) {
      const check = await fetchWithTimeout(env.RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "getGenesisHash", params: [] }),
      });
      if (!check.ok) return failed(check);
      const result = (await check.json()) as { result?: string };
      if (!env.GENESIS_HASH || result.result !== env.GENESIS_HASH)
        return new Response("Unexpected Solana cluster", { status: 502 });
      verifiedUpstreams.add(upstream);
    }
    if (calls.length === 1 && calls[0].method === "getGenesisHash")
      return Response.json({ jsonrpc: "2.0", id, result: env.GENESIS_HASH });
    const response = await fetchWithTimeout(env.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (response.status === 429 || response.status >= 500) return failed(response);
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return failed(null);
  }
}
export function rpcConnection(
  env: RpcEnv,
  commitment: Commitment = "finalized",
  background = true,
) {
  return new Connection("https://rpc.internal", {
    commitment,
    disableRetryOnRateLimit: true,
    fetch: async (_url, init) => {
      const response = await rpcFetch(env, String(init?.body), background);
      if (response.status === 429 || response.status === 503) {
        await response.body?.cancel();
        throw new RpcDeferred(
          Date.now() +
            Math.max(1, Number(response.headers.get("Retry-After")) || 5) *
              1000,
        );
      }
      return response;
    },
  });
}
// Alchemy's documented costs for the Solana methods used here.
const cheap = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlocks",
  "getGenesisHash",
  "getMinimumBalanceForRentExemption",
  "getTokenAccountsByOwner",
]);
const expensive = new Set([
  "getBlock",
  "getTransaction",
  "getSignaturesForAddress",
]);
export class RpcBudget extends DurableObject<RpcEnv> {
  private tail: Promise<unknown> = Promise.resolve();
  private budget?: Budget;
  private persistAt = 0;
  private requestBudget?: { day: string; remaining: number };
  private async reserveBackgroundRequest() {
    const day = new Date().toISOString().slice(0, 10);
    if (this.requestBudget?.day === day && this.requestBudget.remaining > 0) {
      this.requestBudget.remaining--;
      return true;
    }
    const saved = await this.ctx.storage.get<{ day: string; used: number }>("rpc-requests");
    const used = saved?.day === day ? saved.used : 0;
    const count = Math.min(128, 60_000 - used);
    if (count <= 0) return false;
    // Reserve a small batch before use; eviction forfeits unused requests.
    await this.ctx.storage.put("rpc-requests", { day, used: used + count });
    this.requestBudget = { day, remaining: count - 1 };
    return true;
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    let input: { methods?: unknown; id?: unknown; background?: unknown; verify?: unknown; status?: unknown; retryAfter?: unknown };
    try {
      input = await request.json();
    } catch {
      return new Response("Invalid RPC request", { status: 400 });
    }
    const next = this.tail
      .catch(() => {})
      .then(() => path === "/failed" ? this.failed(input) : path === "/reserve" ? this.reserve(input) : new Response("Not found", { status: 404 }));
    this.tail = next.then(() => {}, () => {});
    return next;
  }
  private async reserve(input: { methods?: unknown; id?: unknown; background?: unknown; verify?: unknown }) {
    const methods = input.methods;
    if (!Array.isArray(methods) || !methods.length || methods.length > 4 ||
        methods.some((method) => typeof method !== "string"))
      return new Response("Invalid RPC request", { status: 400 });
    const background = input.background !== false;
    const rate = Number(this.env.RPC_CU_PER_SECOND ?? 40);
    if (!Number.isFinite(rate) || rate < 10 || rate > 10_000)
      return new Response("Invalid RPC budget", { status: 503 });
    const now = Date.now(),
      capacity = Math.max(160, rate * 2),
      bgCapacity = Math.max(80, rate);
    const state = this.budget ?? (await this.ctx.storage.get<Budget>("budget")) ?? {
      at: now,
      tokens: capacity,
      background: bgCapacity,
      until: 0,
      failures: 0,
    };
    this.budget = state;
    const elapsed = Math.max(0, now - state.at) / 1000;
    state.tokens = Math.min(capacity, state.tokens + elapsed * rate);
    state.background = Math.min(
      bgCapacity,
      state.background + (elapsed * rate) / 2,
    );
    // A restored reservation can be dated in the future. Denied requests must
    // not move that timestamp back and refill capacity reserved by the old process.
    state.at = Math.max(state.at, now);
    const cost =
      (methods as string[]).reduce((total, method) => total + (cheap.has(method) ? 10 : expensive.has(method) ? 40 : 20), 0) +
      (input.verify === true ? 10 : 0);
    const wait = Math.max(
      state.until - now,
      ((cost - state.tokens) / rate) * 1000,
      background ? ((cost - state.background) / (rate / 2)) * 1000 : 0,
    );
    if (cost > capacity || (background && cost > bgCapacity))
      return new Response("RPC batch exceeds configured budget", { status: 400 });
    if (wait > 0) return deferred(wait, input.id);
    if (background && !await this.reserveBackgroundRequest()) {
      const date = new Date();
      const reset = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) + 5000;
      return deferred(reset - now, input.id);
    }
    state.tokens -= cost;
    if (background) state.background -= cost;
    if (now >= this.persistAt) {
      // Reserve the entire next two seconds before granting. Live grants use
      // the precise in-memory bucket. After eviction the persisted bucket
      // assumes all reserved capacity was spent, never granting extra.
      const until = now + 2000;
      await this.ctx.storage.put("budget", {
        ...state, at: until, tokens: 0, background: 0,
        until: Math.max(state.until, until),
      });
      this.persistAt = until;
    }
    // Successes are not reported back (that would cost another request), so
    // escalate backoff across failures and forget it after two quiet minutes.
    if (state.failures && now - state.until > 120_000) state.failures = 0;
    return new Response(null, { status: 204 });
  }
  private async failed(input: { id?: unknown; status?: unknown; retryAfter?: unknown }) {
    const state = this.budget ?? (await this.ctx.storage.get<Budget>("budget")) ?? {
      at: Date.now(), tokens: 0, background: 0, until: 0, failures: 0,
    };
    this.budget = state;
    const retry = typeof input.retryAfter === "string" ? input.retryAfter : null,
      seconds = retry ? Number(retry) : NaN;
    const hinted = retry
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(retry) - Date.now()
      : 0;
    const backoff =
      Math.min(60_000, 1000 * 2 ** Math.min(state.failures, 6)) +
      Math.random() * 1000;
    state.failures++;
    state.until =
      Date.now() + Math.max(backoff, Number.isFinite(hinted) ? hinted : 0);
    await this.ctx.storage.put("budget", state);
    console.warn(
      JSON.stringify({
        event: "rpc_cooldown",
        status: typeof input.status === "number" ? input.status : "network",
        retryAt: state.until,
      }),
    );
    return deferred(state.until - Date.now(), input.id);
  }
}
