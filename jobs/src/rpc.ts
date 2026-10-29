import { DurableObject } from "cloudflare:workers";
import { Connection, type Commitment } from "@solana/web3.js";

interface RpcEnv {
  RPC: DurableObjectNamespace;
  RPC_URL: string;
  GENESIS_HASH: string;
  RPC_CU_PER_SECOND?: string;
}
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
export async function rpcFetch(env: RpcEnv, body: string, background = true) {
  return env.RPC.get(env.RPC.idFromName("devnet")).fetch(
    "https://rpc.internal/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RPC-Lane": background ? "background" : "interactive",
      },
      body,
    },
  );
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
  async fetch(request: Request): Promise<Response> {
    const body = await request.text();
    if (body.length > 100_000)
      return new Response("RPC request too large", { status: 413 });
    let call: { method: string; id?: unknown };
    try {
      call = JSON.parse(body);
      if (!call || typeof call.method !== "string" || Array.isArray(call))
        throw new Error();
    } catch {
      return new Response("Invalid RPC request", { status: 400 });
    }
    const next = this.tail
      .catch(() => {})
      .then(() =>
        this.request(
          call,
          body,
          request.headers.get("X-RPC-Lane") !== "interactive",
        ),
      );
    this.tail = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  private async request(
    call: { method: string; id?: unknown },
    body: string,
    background: boolean,
  ) {
    const rate = Number(this.env.RPC_CU_PER_SECOND ?? 40);
    if (!Number.isFinite(rate) || rate < 10 || rate > 10_000)
      return new Response("Invalid RPC budget", { status: 503 });
    const now = Date.now(),
      capacity = Math.max(160, rate * 2),
      bgCapacity = Math.max(80, rate);
    const state = (await this.ctx.storage.get<Budget>("budget")) ?? {
      at: now,
      tokens: capacity,
      background: bgCapacity,
      until: 0,
      failures: 0,
    };
    const elapsed = Math.max(0, now - state.at) / 1000;
    state.tokens = Math.min(capacity, state.tokens + elapsed * rate);
    state.background = Math.min(
      bgCapacity,
      state.background + (elapsed * rate) / 2,
    );
    state.at = now;
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(this.env.RPC_URL + this.env.GENESIS_HASH),
        ),
      ),
    ).join(",");
    const verified = await this.ctx.storage.get<string>("verified");
    const cost =
      (cheap.has(call.method) ? 10 : expensive.has(call.method) ? 40 : 20) +
      (verified === fingerprint ? 0 : 10);
    const wait = Math.max(
      state.until - now,
      ((cost - state.tokens) / rate) * 1000,
      background ? ((cost - state.background) / (rate / 2)) * 1000 : 0,
    );
    if (wait > 0) return this.deferred(wait, call.id);
    state.tokens -= cost;
    if (background) state.background -= cost;
    await this.ctx.storage.put("budget", state);
    try {
      if (verified !== fingerprint) {
        const check = await fetch(this.env.RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 0,
            method: "getGenesisHash",
            params: [],
          }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!check.ok) return this.failed(state, check, call.id);
        const result = (await check.json()) as { result?: string };
        if (!this.env.GENESIS_HASH || result.result !== this.env.GENESIS_HASH)
          return new Response("Unexpected Solana cluster", { status: 502 });
        await this.ctx.storage.put("verified", fingerprint);
      }
      if (call.method === "getGenesisHash")
        return Response.json({
          jsonrpc: "2.0",
          id: call.id,
          result: this.env.GENESIS_HASH,
        });
      const response = await fetch(this.env.RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 429 || response.status >= 500)
        return this.failed(state, response, call.id);
      state.failures = 0;
      await this.ctx.storage.put("budget", state);
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return this.failed(state, null, call.id);
    }
  }
  private deferred(wait: number, id: unknown) {
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
  private async failed(state: Budget, response: Response | null, id: unknown) {
    const retry = response?.headers.get("Retry-After"),
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
    await response?.body?.cancel();
    await this.ctx.storage.put("budget", state);
    console.warn(
      JSON.stringify({
        event: "rpc_cooldown",
        status: response?.status ?? "network",
        retryAt: state.until,
      }),
    );
    return this.deferred(state.until - Date.now(), id);
  }
}
