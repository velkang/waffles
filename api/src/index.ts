import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  program,
  fundAddress,
  zeroKey,
  configAddress,
  marketCustody,
} from "@waffles/shared/client";
import {
  DAY,
  buyFeeBps,
  epochAt,
  epochBounds,
  quoteBuy,
  quoteSell,
  type Market,
  type SolTrade,
  json,
} from "@waffles/shared/solana";
import {
  categoryTickets,
  completedLockWeeks,
  drawCount,
} from "@waffles/shared/rewards";
import type { Env } from "./env";
export { LiveHub } from "./live";
const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();
app.use("*", (c, next) =>
  c.req.header("Upgrade")?.toLowerCase() === "websocket"
    ? next()
    : secureHeaders({
        crossOriginResourcePolicy: c.req.path.startsWith("/v1/assets/images/")
          ? "cross-origin"
          : "same-origin",
      })(c, next),
);
app.use("*", bodyLimit({ maxSize: 5 * 1024 * 1024 + 20_000 }));
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("x-request-id", c.get("requestId"));
  await next();
});
app.onError((error, c) => {
  const status = error instanceof HTTPException ? error.status : 500;
  if (status === 500)
    console.error(
      json({ requestId: c.get("requestId"), error: error.message }),
    );
  return c.json(
    {
      error: status === 500 ? "Service temporarily unavailable" : error.message,
      requestId: c.get("requestId"),
    },
    status,
  );
});
function address(value: string | undefined) {
  try {
    if (!value) throw new Error();
    return new PublicKey(value).toBase58();
  } catch {
    throw new HTTPException(400, { message: "Invalid Solana address" });
  }
}
function integer(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new HTTPException(400, { message: "Invalid query limit" });
  return n;
}
async function dataRows<T>(
  db: D1Database,
  sql: string,
  ...values: unknown[]
): Promise<T[]> {
  const rows = await db
    .prepare(sql)
    .bind(...values)
    .all<{ data: string }>();
  return rows.results.map((r) => JSON.parse(r.data) as T);
}
async function getMarket(db: D1Database, mint: string) {
  return (
    (
      await dataRows<Market>(db, "SELECT data FROM markets WHERE mint=?", mint)
    )[0] ?? null
  );
}
function network(rpcUrl: string): "localnet" | "devnet" {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(rpcUrl).hostname)
    ? "localnet"
    : "devnet";
}
app.get("/health/live", (c) =>
  c.json({ status: "ok", network: `solana-${network(c.env.RPC_URL)}` }),
);
app.get("/health/ready", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  const complete = await c.env.DB.prepare(
    "SELECT value FROM checkpoints WHERE id='complete-time'",
  ).first<{ value: string }>();
  const lag = complete
    ? Math.max(0, Math.floor(Date.now() / 1000) - Number(complete.value))
    : null;
  return c.json(
    {
      status: lag !== null && lag < 120 ? "ready" : "indexing",
      lagSeconds: lag,
    },
    lag !== null && lag < 120 ? 200 : 503,
  );
});
app.get("/v1/config", (c) =>
  c.json({
    network: network(c.env.RPC_URL),
    programId: c.env.PROGRAM_ID,
    upgradeAuthority: c.env.UPGRADE_AUTHORITY || null,
    incentivesVault: fundAddress(2, zeroKey, 0).toBase58(),
    genesisHash: c.env.GENESIS_HASH,
    configured: Boolean(c.env.UPGRADE_AUTHORITY && c.env.GENESIS_HASH),
    rules: {
      tradingUsd: 1000,
      holdingSol: 1,
      creatorSolWeek: 1,
      categoryCap: 1000,
      prizeTargetUsd: 1000,
      smallPools: "incentives-vault-tickets-expire",
      launchFeeStartBps: 4000,
      launchDecaySeconds: 60,
    },
  }),
);
app.get("/v1/launches", async (c) => {
  const sort = c.req.query("sort") ?? "new";
  if (!["new", "trending", "graduating", "graduated", "volume"].includes(sort))
    throw new HTTPException(400, { message: "Unknown market view" });
  const limit = integer(c.req.query("limit"), 60, 100);
  const committed = c.req.query("committed") === "true";
  const where = [
    sort === "graduated"
      ? "state='pool'"
      : sort === "graduating"
        ? "state='curve'"
        : "1=1",
    committed
      ? "EXISTS(SELECT 1 FROM commitments c WHERE c.mint=markets.mint AND c.withdrawn=0 AND c.unlock_at>unixepoch()) OR CAST(json_extract(data,'$.routing.locked') AS INTEGER)>0 AND CAST(json_extract(data,'$.feeCliff') AS INTEGER)>unixepoch()"
      : "1=1",
  ];
  let launches = await dataRows<Market>(
    c.env.DB,
    `SELECT data FROM markets WHERE (${where[0]}) AND (${where[1]}) ORDER BY launched_at DESC LIMIT 1000`,
  );
  const stats = await c.env.DB.prepare(
    "SELECT mint,COUNT(DISTINCT trader) wallets FROM trades WHERE time>=? GROUP BY mint",
  )
    .bind(Math.floor(Date.now() / 1000) - 3600)
    .all<{ mint: string; wallets: number }>();
  const wallets = new Map(stats.results.map((r) => [r.mint, r.wallets]));
  if (sort === "trending")
    launches = launches
      .filter((m) => wallets.has(m.mint))
      .sort((a, b) => (wallets.get(b.mint) ?? 0) - (wallets.get(a.mint) ?? 0));
  if (sort === "volume")
    launches.sort((a, b) =>
      BigInt(a.volumeSol) === BigInt(b.volumeSol)
        ? a.mint.localeCompare(b.mint)
        : BigInt(a.volumeSol) > BigInt(b.volumeSol)
          ? -1
          : 1,
    );
  if (sort === "graduating")
    launches.sort((a, b) =>
      BigInt(a.tokenReserve) < BigInt(b.tokenReserve) ? -1 : 1,
    );
  return c.json({ launches: launches.slice(0, limit) });
});
app.get("/v1/launches/:mint", async (c) => {
  const mint = address(c.req.param("mint"));
  const checkpoint = await c.env.DB.prepare(
    "SELECT at,completed FROM holding_checkpoints WHERE mint=?",
  )
    .bind(mint)
    .first<{ at: number; completed: number }>();
  return c.json({
    launch: await getMarket(c.env.DB, mint),
    holdingCheckpoint: checkpoint
      ? { at: checkpoint.at, completed: Boolean(checkpoint.completed) }
      : null,
  });
});
app.get("/v1/trades", async (c) =>
  c.json({
    trades: await dataRows<SolTrade>(
      c.env.DB,
      "SELECT data FROM trades WHERE mint=? ORDER BY slot DESC,id DESC LIMIT ?",
      address(c.req.query("token")),
      integer(c.req.query("limit"), 200, 500),
    ),
  }),
);
app.get("/v1/commitments/:mint", async (c) =>
  c.json({
    commitments: await dataRows(
      c.env.DB,
      "SELECT data FROM commitments WHERE mint=? ORDER BY start_at DESC LIMIT 200",
      address(c.req.param("mint")),
    ),
  }),
);
app.get("/v1/protocol/actions", async (c) => {
  const actions = await c.env.DB.prepare(
    "SELECT id,kind,mint,amount,time,data FROM protocol_actions WHERE kind<>'fee' ORDER BY time DESC LIMIT 100",
  ).all();
  return c.json({ actions: actions.results });
});
app.get("/v1/commitment/:id", async (c) => {
  const connection = new Connection(c.env.RPC_URL, "finalized");
  const commitment = (await program(connection).account["commitment"].fetch(
    new PublicKey(address(c.req.param("id"))),
  )) as { nonce: { toString(): string } };
  return c.json({ nonce: commitment.nonce.toString() });
});
app.get("/v1/quote", async (c) => {
  const mint = address(c.req.query("token"));
  const market = await getMarket(c.env.DB, mint);
  if (!market) throw new HTTPException(404, { message: "Market not indexed" });
  if (market.state === "complete")
    throw new HTTPException(409, { message: "Graduation pending" });
  const input = c.req.query("amount");
  if (!input || !/^\d{1,20}$/.test(input) || BigInt(input) <= 0n)
    throw new HTTPException(400, { message: "Invalid amount" });
  const buy = c.req.query("side") === "buy",
    now = Math.floor(Date.now() / 1000);
  const feeBps = buy ? buyFeeBps(market.launchedAt, now) : 100n;
  const q = buy
    ? quoteBuy(
        BigInt(market.solReserve),
        BigInt(market.tokenReserve),
        BigInt(input),
        feeBps,
        market.state === "curve",
      )
    : quoteSell(
        BigInt(market.solReserve),
        BigInt(market.tokenReserve),
        BigInt(input),
        market.state === "curve",
      );
  return c.json(JSON.parse(json({ ...q, feeBps, asOf: now })));
});
app.get("/v1/candles", async (c) => {
  const mint = address(c.req.query("token"));
  const interval = integer(c.req.query("interval"), 60, 86400);
  const trades = await dataRows<SolTrade>(
    c.env.DB,
    "SELECT data FROM trades WHERE mint=? ORDER BY slot DESC,id DESC LIMIT 2000",
    mint,
  );
  const candles = new Map<
    number,
    {
      time: number;
      open: string;
      close: string;
      high: string;
      low: string;
      volume: string;
      trades: number;
    }
  >();
  for (const t of trades.reverse()) {
    const time = Math.floor(t.time / interval) * interval;
    let bar = candles.get(time);
    if (!bar) {
      bar = {
        time,
        open: t.price,
        close: t.price,
        high: t.price,
        low: t.price,
        volume: "0",
        trades: 0,
      };
      candles.set(time, bar);
    }
    bar.close = t.price;
    if (BigInt(t.price) > BigInt(bar.high)) bar.high = t.price;
    if (BigInt(t.price) < BigInt(bar.low)) bar.low = t.price;
    bar.volume = (BigInt(bar.volume) + BigInt(t.grossSol)).toString();
    bar.trades++;
  }
  return c.json({
    candles: [...candles.values()].slice(-240),
    truncated: trades.length === 2000,
  });
});
app.get("/v1/protocol/balances", async (c) => {
  if (!c.env.GENESIS_HASH)
    throw new HTTPException(503, {
      message: "Deployment configuration pending",
    });
  if (
    !(
      await c.env.RPC_LIMIT.limit({
        key: c.req.header("CF-Connecting-IP") ?? "local",
      })
    ).success
  )
    throw new HTTPException(429);
  const p = program(new Connection(c.env.RPC_URL, "finalized"));
  const [config, fund] = await Promise.all([
    p.account.config.fetchNullable(configAddress()),
    p.account.fund.fetchNullable(fundAddress(2, zeroKey, 0)),
  ]);
  if (!config)
    throw new HTTPException(503, { message: "Protocol is not initialized" });
  return c.json({
    incentivesSol: fund?.amount.toString() ?? "0",
    distributionAuthority: config.finalizer.toBase58(),
    buybackAuthority: config.keeper.toBase58(),
  });
});
app.get("/v1/creator-earnings/:mint", async (c) => {
  const mint = address(c.req.param("mint"));
  if (!c.env.GENESIS_HASH)
    throw new HTTPException(503, {
      message: "Deployment configuration pending",
    });
  if (
    !(
      await c.env.RPC_LIMIT.limit({
        key: c.req.header("CF-Connecting-IP") ?? "local",
      })
    ).success
  )
    throw new HTTPException(429);
  const connection = new Connection(c.env.RPC_URL, "finalized");
  const custody = await marketCustody(connection, new PublicKey(mint));
  if (!custody)
    throw new HTTPException(404, { message: "Market account not found" });
  const state = custody.state;
  if (!custody.consistent)
    console.error(
      json({
        event: "custody_discrepancy",
        mint,
        ...custody,
        state: undefined,
      }),
    );
  return c.json({
    directSol: state.direct.toString(),
    lockedSol: state.locked.toString(),
    buybackSol: state.buyback.toString(),
    custodyConsistent: custody.consistent,
  });
});
app.get("/v1/portfolios/:wallet", async (c) => {
  const wallet = address(c.req.param("wallet"));
  const positions = await c.env.DB.prepare(
    "SELECT mint,balance FROM ownership WHERE wallet=? AND balance<>'0'",
  )
    .bind(wallet)
    .all();
  const created = await dataRows<Market>(
    c.env.DB,
    "SELECT data FROM markets WHERE creator=?",
    wallet,
  );
  const commitments = await dataRows(
    c.env.DB,
    "SELECT data FROM commitments WHERE owner=? ORDER BY start_at DESC",
    wallet,
  );
  return c.json({ positions: positions.results, created, commitments });
});
async function liveTickets(db: D1Database, epoch: number) {
  const { start, end } = epochBounds(epoch);
  const amounts = new Map<
    string,
    { volume: bigint; held: bigint; locked: bigint }
  >();
  const entry = (wallet: string) => {
    let v = amounts.get(wallet);
    if (!v) {
      v = { volume: 0n, held: 0n, locked: 0n };
      amounts.set(wallet, v);
    }
    return v;
  };
  const trades = await db
    .prepare(
      "SELECT trader,usd_micros FROM trades WHERE time>=? AND time<? AND excluded=0",
    )
    .bind(start, end)
    .all<{ trader: string; usd_micros: string | null }>();
  let missingPrices = 0;
  for (const t of trades.results) {
    if (t.usd_micros === null) missingPrices++;
    else entry(t.trader).volume += BigInt(t.usd_micros);
  }
  const holding = await db
    .prepare("SELECT wallet,weight FROM holding_rewards WHERE epoch=?")
    .bind(epoch)
    .all<{ wallet: string; weight: string }>();
  for (const h of holding.results) entry(h.wallet).held += BigInt(h.weight);
  const deposits = await db
    .prepare(
      "SELECT owner,amount,start_at,unlock_at FROM fee_deposits WHERE start_at<? AND unlock_at>=?",
    )
    .bind(end, start)
    .all<{
      owner: string;
      amount: string;
      start_at: number;
      unlock_at: number;
    }>();
  for (const d of deposits.results)
    entry(d.owner).locked += completedLockWeeks(
      BigInt(d.amount),
      d.start_at,
      d.unlock_at,
      start,
      Math.min(end, Math.floor(Date.now() / 1000) + 1),
    );
  const locks = await dataRows<{
    owner: string;
    purchaseCost: string | null;
    startAt: number;
    unlockAt: number;
    asset: string;
  }>(
    db,
    "SELECT data FROM commitments WHERE start_at<? AND unlock_at>=?",
    end,
    start,
  );
  for (const l of locks)
    if (l.purchaseCost && l.asset === "token")
      entry(l.owner).locked += completedLockWeeks(
        BigInt(l.purchaseCost),
        l.startAt,
        l.unlockAt,
        start,
        Math.min(end, Math.floor(Date.now() / 1000) + 1),
      );
  return {
    rows: [...amounts].map(([wallet, v]) => ({
      wallet,
      ...categoryTickets(v.volume, v.held, v.locked),
      volumeUsd: v.volume.toString(),
    })),
    missingPrices,
  };
}
app.get("/v1/rewards/current", async (c) => {
  const epoch = epochAt(Math.floor(Date.now() / 1000)),
    bounds = epochBounds(epoch);
  const { rows, missingPrices } = await liveTickets(c.env.DB, epoch);
  const totals = rows.reduce(
    (s, r) => s + BigInt(r.trading) + BigInt(r.holding) + BigInt(r.creator),
    0n,
  );
  const record = await c.env.DB.prepare(
    "SELECT pool_sol FROM epochs WHERE epoch=?",
  )
    .bind(epoch)
    .first<{ pool_sol: string }>();
  const price = await c.env.DB.prepare(
    "SELECT usd_micros,publish_time FROM oracle_prices ORDER BY at DESC LIMIT 1",
  ).first<{ usd_micros: string; publish_time: number }>();
  const fresh =
    price && price.publish_time >= Math.floor(Date.now() / 1000) - 60;
  const pool = record?.pool_sol ?? "0";
  const count = fresh
    ? drawCount(BigInt(pool), BigInt(price.usd_micros), totals).toString()
    : null;
  return c.json({
    epoch,
    ...bounds,
    poolSol: pool,
    totalTickets: totals.toString(),
    winningTickets: count,
    missingPrices,
    provisional: true,
    user: rows.find((r) => r.wallet === c.req.query("address")) ?? null,
    leaderboard: rows
      .sort((a, b) =>
        Number(
          BigInt(b.trading) +
            BigInt(b.holding) +
            BigInt(b.creator) -
            BigInt(a.trading) -
            BigInt(a.holding) -
            BigInt(a.creator),
        ),
      )
      .slice(0, 100),
  });
});
app.get("/v1/rewards/epochs", async (c) => {
  const epochs = await c.env.DB.prepare(
    "SELECT * FROM epochs ORDER BY epoch DESC LIMIT 20",
  ).all();
  return c.json({ epochs: epochs.results });
});
app.get("/v1/rewards/claims/:wallet", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT c.* FROM claims c JOIN distributions d ON d.id=c.distribution WHERE c.wallet=? AND d.status='finalized' ORDER BY c.epoch DESC",
  )
    .bind(address(c.req.param("wallet")))
    .all<Record<string, unknown>>();
  return c.json({
    claims: rows.results.map((r) => ({
      ...r,
      proof: JSON.parse(r.proof as string),
      claimed: Boolean(r.claimed),
    })),
  });
});
app.get("/v1/distributions", async (c) => {
  const records = await c.env.DB.prepare(
    "SELECT id,epoch,kind,mint,amount,status,root,snapshot_hash,snapshot_key,data FROM distributions ORDER BY epoch DESC LIMIT 100",
  ).all();
  return c.json({ distributions: records.results });
});
app.get("/v1/analytics", async (c) => {
  const range = c.req.query("range") ?? "7d";
  if (!["24h", "7d", "30d", "all"].includes(range))
    throw new HTTPException(400, { message: "Invalid analytics range" });
  const now = Math.floor(Date.now() / 1000),
    from =
      range === "all"
        ? 0
        : now - (range === "24h" ? DAY : range === "7d" ? 7 * DAY : 30 * DAY);
  const trades = await dataRows<SolTrade>(
    c.env.DB,
    "SELECT data FROM trades WHERE time>=? ORDER BY time",
    from,
  );
  let volume = 0n,
    fees = 0n;
  const wallets = new Set<string>();
  for (const t of trades) {
    volume += BigInt(t.grossSol);
    fees += BigInt(t.fee);
    wallets.add(t.trader);
  }
  const launches = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM markets WHERE launched_at>=?",
  )
    .bind(from)
    .first<{ n: number }>();
  const commitments = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM commitments WHERE start_at>=?",
  )
    .bind(from)
    .first<{ n: number }>();
  return c.json({
    range,
    asOf: now,
    volumeSol: volume.toString(),
    feesSol: fees.toString(),
    wallets: wallets.size,
    launches: launches?.n ?? 0,
    commitments: commitments?.n ?? 0,
  });
});
app.post("/v1/internal/publish", async (c) => {
  if (
    !c.env.OPERATIONS_TOKEN ||
    c.req.header("Authorization") !== `Bearer ${c.env.OPERATIONS_TOKEN}`
  )
    throw new HTTPException(401);
  const response = await c.env.LIVE.get(c.env.LIVE.idFromName("devnet")).fetch(
    new Request("https://live/publish", {
      method: "POST",
      body: await c.req.text(),
    }),
  );
  return new Response(response.body, response);
});
app.get("/v1/events", (c) =>
  c.env.LIVE.get(c.env.LIVE.idFromName("devnet")).fetch(c.req.raw),
);
app.get("/v1/events/replay", async (c) => {
  const after = Number(c.req.query("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) throw new HTTPException(400);
  const rows = await c.env.DB.prepare(
    "SELECT sequence,type,mint,wallet,data FROM outbox WHERE sequence>? ORDER BY sequence LIMIT 500",
  )
    .bind(after)
    .all<{
      sequence: number;
      type: string;
      mint: string;
      wallet: string;
      data: string;
    }>();
  return c.json({
    events: rows.results.map((e) => ({ ...e, data: JSON.parse(e.data) })),
    resync: rows.results.length === 500,
  });
});
const rpcMethods = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSignatureStatuses",
  "getTransaction",
  "getGenesisHash",
  "getMinimumBalanceForRentExemption",
  "simulateTransaction",
  "sendTransaction",
  "getSlot",
]);
app.post(
  "/v1/rpc",
  async (c, next) => {
    if (
      !(
        await c.env.RPC_LIMIT.limit({
          key: c.req.header("CF-Connecting-IP") ?? "local",
        })
      ).success
    )
      throw new HTTPException(429, { message: "RPC request limit reached" });
    await next();
  },
  bodyLimit({ maxSize: 100_000 }),
  async (c) => {
    const body = await c.req.json<{
      method: string;
      params: unknown[];
      id: unknown;
    }>();
    if (!body || !rpcMethods.has(body.method) || !Array.isArray(body.params))
      throw new HTTPException(400, { message: "RPC method unavailable" });
    const response = await fetch(c.env.RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, jsonrpc: "2.0" }),
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  },
);
app.post("/v1/uploads", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  if (!(await c.env.UPLOAD_LIMIT.limit({ key: ip })).success)
    throw new HTTPException(429, {
      message: "Upload limit reached. Try again in a minute.",
    });
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024 || file.size < 12)
    throw new HTTPException(400, { message: "Choose an image up to 5 MB" });
  const buffer = new Uint8Array(await file.arrayBuffer());
  const h = (s: string) =>
    new TextDecoder().decode(buffer.slice(0, s.length)) === s;
  const valid =
    file.type === "image/png"
      ? buffer.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
      : file.type === "image/jpeg"
        ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        : file.type === "image/webp"
          ? h("RIFF") &&
            new TextDecoder().decode(buffer.slice(8, 12)) === "WEBP"
          : file.type === "image/gif"
            ? h("GIF87a") || h("GIF89a")
            : false;
  if (!valid)
    throw new HTTPException(400, {
      message: "Image contents do not match the declared format",
    });
  const objectKey = `images/${crypto.randomUUID()}`;
  await c.env.ARTIFACTS.put(objectKey, buffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public,max-age=31536000,immutable",
    },
  });
  return c.json(
    {
      url: `${c.env.MEDIA_ORIGIN || new URL(c.req.url).origin}/v1/assets/${objectKey}`,
    },
    201,
  );
});
app.get("/v1/assets/*", async (c) => {
  const name = c.req.path.slice("/v1/assets/".length);
  if (!/^(images|snapshots|distributions)\/[a-zA-Z0-9/_\-.]+$/.test(name))
    throw new HTTPException(404);
  const obj = await c.env.ARTIFACTS.get(name);
  if (!obj) throw new HTTPException(404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers });
});
app.use("/v1/ops/*", async (c, next) => {
  if (!c.env.ACCESS_TEAM || !c.env.ACCESS_AUD)
    throw new HTTPException(503, {
      message: "Operational access is not configured",
    });
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) throw new HTTPException(401);
  try {
    await jwtVerify(
      token,
      createRemoteJWKSet(
        new URL(
          `https://${c.env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`,
        ),
      ),
      {
        issuer: `https://${c.env.ACCESS_TEAM}.cloudflareaccess.com`,
        audience: c.env.ACCESS_AUD,
      },
    );
  } catch {
    throw new HTTPException(403);
  }
  await next();
});
app.post("/v1/ops/:operation", async (c) => {
  if (!c.env.OPERATIONS_TOKEN) throw new HTTPException(503);
  const response = await c.env.JOBS.fetch(
    new Request(`https://jobs.internal/${c.req.param("operation")}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.OPERATIONS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: await c.req.text(),
    }),
  );
  return new Response(response.body, response);
});
export { app, liveTickets };
export default app;
