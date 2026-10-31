import { env, SELF, runInDurableObject } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey, type ParsedBlockResponse } from "@solana/web3.js";
import {
  json,
  INITIAL_SOL,
  INITIAL_TOKENS,
  SUPPLY,
  epochAt,
  epochBounds,
  type Market,
} from "@waffles/shared/solana";
import { sha, claimLeaf, merkle, verifyProof } from "@waffles/shared/rewards";
const mint = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey.toBase58(),
  wallet = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey.toBase58();
const market: Market = {
  mint,
  market: mint,
  creator: wallet,
  name: "A real indexed fixture",
  symbol: "TEST",
  description: "Runtime test",
  imageUri: "",
  launchedAt: 100,
  state: "curve",
  solReserve: INITIAL_SOL.toString(),
  tokenReserve: INITIAL_TOKENS.toString(),
  supply: SUPPLY.toString(),
  volumeSol: "0",
  routing: { direct: 10000, locked: 0, holders: 0, buyback: 0 },
  feeCliff: 0,
  upgradeAuthority: null,
};
async function seed() {
  await env.DB.prepare(
    "INSERT INTO markets(mint,creator,state,launched_at,data) VALUES(?,?,?,?,?)",
  )
    .bind(mint, wallet, "curve", 100, json(market))
    .run();
}
describe("Hono and D1 inside Workers", () => {
  it("serves health and makes an unconfigured deployment explicit", async () => {
    expect((await SELF.fetch("https://waffles/health/live")).status).toBe(200);
    const config = (await (
      await SELF.fetch("https://waffles/v1/config")
    ).json()) as { configured: boolean; network: string };
    expect(config.configured).toBe(false);
    expect(config.network).toBe("devnet");
    expect(
      (
        await app.request(
          "https://waffles/v1/protocol/balances",
          {},
          { ...env, GENESIS_HASH: "" },
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await app.request(
          `https://waffles/v1/creator-earnings/${mint}`,
          {},
          { ...env, GENESIS_HASH: "" },
        )
      ).status,
    ).toBe(503);
    expect((await SELF.fetch("https://waffles/health/ready")).status).toBe(503);
  });
  it("returns honest empty markets and validates public queries", async () => {
    expect(
      await (await SELF.fetch("https://waffles/v1/launches")).json(),
    ).toEqual({ launches: [] });
    expect(
      (await SELF.fetch("https://waffles/v1/launches?limit=100000")).status,
    ).toBe(400);
    expect(
      (await SELF.fetch("https://waffles/v1/launches/not-an-address")).status,
    ).toBe(400);
  });
  it.each([
    ["http://127.0.0.1:5174/v1/assets/images/original", true],
    ["http://localhost:5174/v1/assets/images/original", true],
    ["http://[::1]:5174/v1/assets/images/original", true],
    ["https://images.example/token.jpg", false],
    ["http://localhost:5174/other/image.jpg", false],
    ["", false],
  ])("resolves local uploaded images without changing other URLs: %s", async (imageUri, local) => {
    await seed();
    await env.DB.prepare("UPDATE markets SET data=? WHERE mint=?")
      .bind(json({ ...market, imageUri }), mint)
      .run();
    const mediaOrigin = "https://public.waffles.example";
    for (const path of [
      "/v1/launches",
      `/v1/launches/${mint}`,
      `/v1/portfolios/${wallet}`,
    ]) {
      const response = await app.request(
        `https://api.waffles.example${path}`,
        {},
        { ...env, MEDIA_ORIGIN: mediaOrigin },
      );
      expect(response.status).toBe(200);
      const data = await response.json() as {
        launches?: Market[];
        launch?: Market;
        created?: Market[];
      };
      const result = data.launch ?? data.launches?.[0] ?? data.created?.[0];
      expect(result?.imageUri).toBe(
        local ? `${mediaOrigin}/v1/assets/images/original` : imageUri,
      );
    }
    const stored = await env.DB.prepare("SELECT data FROM markets WHERE mint=?")
      .bind(mint)
      .first<{ data: string }>();
    expect(JSON.parse(stored!.data).imageUri).toBe(imageUri);
  });
  it("preserves Solana address case and quotes from stored integer reserves", async () => {
    await seed();
    const result = (await (
      await SELF.fetch(`https://waffles/v1/launches/${mint}`)
    ).json()) as { launch: Market };
    expect(result.launch.mint).toBe(mint);
    expect(
      (
        (await (
          await SELF.fetch(`https://waffles/v1/launches/${mint.toLowerCase()}`)
        ).json()) as { launch: Market | null }
      ).launch,
    ).not.toEqual(expect.objectContaining({ mint }));
    const quote = (await (
      await SELF.fetch(
        `https://waffles/v1/quote?token=${mint}&side=buy&amount=1000000000`,
      )
    ).json()) as { output: string; feeBps: string };
    expect(BigInt(quote.output)).toBeGreaterThan(0n);
    expect(quote.feeBps).toBe("100");
  });
  it("counts historical USD volume with the agreed ticket threshold", async () => {
    await seed();
    const time = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO trades(id,mint,trader,slot,time,signature,gross_sol,usd_micros,excluded,data) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        "t",
        mint,
        wallet,
        1,
        time,
        "sig",
        "10000000000",
        "1500000000",
        0,
        "{}",
      )
      .run();
    const result = (await (
      await SELF.fetch(`https://waffles/v1/rewards/current?address=${wallet}`)
    ).json()) as { user: { trading: string }; missingPrices: number };
    expect(result.user.trading).toBe("1");
    expect(result.missingPrices).toBe(0);
  });
  it("never exposes unfinalized claim roots as claimable", async () => {
    await env.DB.prepare(
      "INSERT INTO distributions(id,epoch,kind,mint,amount,status,data) VALUES('d',1,'raffle',?,'100','drawn','{}')",
    )
      .bind(mint)
      .run();
    await env.DB.prepare(
      "INSERT INTO claims(id,distribution,epoch,mint,kind,wallet,amount,proof) VALUES('c','d',1,?,'raffle',?,'100','[]')",
    )
      .bind(mint, wallet)
      .run();
    expect(
      await (
        await SELF.fetch(`https://waffles/v1/rewards/claims/${wallet}`)
      ).json(),
    ).toEqual({ claims: [] });
    await env.DB.prepare(
      "UPDATE distributions SET status='finalized' WHERE id='d'",
    ).run();
    const result = (await (
      await SELF.fetch(`https://waffles/v1/rewards/claims/${wallet}`)
    ).json()) as { claims: unknown[] };
    expect(result.claims).toHaveLength(1);
  });
  it("rolls back a failed D1 batch rather than advancing the checkpoint", async () => {
    await env.DB.prepare(
      "INSERT INTO indexed_events(id,slot) VALUES('duplicate',1)",
    ).run();
    await expect(
      env.DB.batch([
        env.DB.prepare(
          "INSERT INTO checkpoints(id,value) VALUES('complete-slot','2')",
        ),
        env.DB.prepare(
          "INSERT INTO indexed_events(id,slot) VALUES('duplicate',2)",
        ),
      ]),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare(
        "SELECT value FROM checkpoints WHERE id='complete-slot'",
      ).first(),
    ).toBeNull();
  });
  it("protects operational routes even when no Access configuration is present", async () => {
    expect(
      (
        await SELF.fetch("https://waffles/v1/ops/settle", {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await SELF.fetch("https://waffles/v1/internal/publish", {
          method: "POST",
          body: "[]",
        })
      ).status,
    ).toBe(401);
  });
  it("publishes a durable outbox batch through the service binding", async () => {
    const response = await SELF.fetch("https://waffles/v1/internal/publish", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-only-operations",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ sequence: 1, type: "market", data: {} }]),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
  it("keeps WebSocket upgrades usable and delivers committed live events", async () => {
    const response = await SELF.fetch(
      "https://waffles/v1/events?topic=launches",
      { headers: { Upgrade: "websocket" } },
    );
    expect(response.status).toBe(101);
    const socket = response.webSocket!;
    const ready = new Promise<MessageEvent>((resolve) =>
      socket.addEventListener("message", resolve, { once: true }),
    );
    socket.accept();
    expect(JSON.parse((await ready).data as string).type).toBe("stream.ready");
    const event = new Promise<MessageEvent>((resolve) =>
      socket.addEventListener("message", resolve, { once: true }),
    );
    const result = await SELF.fetch("https://waffles/v1/internal/publish", {
      method: "POST",
      headers: { Authorization: "Bearer test-only-operations" },
      body: JSON.stringify([{ sequence: 22, type: "claim", wallet, data: {} }]),
    });
    expect(result.status).toBe(200);
    expect(JSON.parse((await event).data as string).sequence).toBe(22);
    socket.close(1000, "Test complete");
  });
  it("executes hashing and Merkle proofs in the Workers runtime", async () => {
    const key = new Uint8Array(32).fill(1),
      leaf = await claimLeaf(key, key, 1n, 0, key, key, 10n),
      tree = await merkle([leaf]);
    expect(await verifyProof(leaf, tree.proofs[0], tree.root)).toBe(true);
    expect((await sha(key)).length).toBe(32);
  });
});

// Run finalized ownership accounting against real D1, including activity outside Waffles.
import { applyBlock } from "../../jobs/src/ingest";
import type { Env as JobsEnv } from "../../jobs/src/env";
const tokenProgram = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const source = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey;
const destination = Keypair.fromSeed(new Uint8Array(32).fill(4)).publicKey;
const receiver = Keypair.fromSeed(
  new Uint8Array(32).fill(5),
).publicKey.toBase58();
async function ownership() {
  await seed();
  await env.DB.prepare(
    "INSERT INTO holding_checkpoints(mint,at) VALUES(?,86500)",
  )
    .bind(mint)
    .run();
  await env.DB.prepare(
    "INSERT INTO ownership(mint,wallet,balance,lots,updated_at) VALUES(?,?,'100',?,100)",
  )
    .bind(
      mint,
      receiver,
      json([
        {
          id: "purchase",
          owner: receiver,
          mint,
          tokens: "100",
          cost: "2000000000",
          boughtAt: 100,
        },
      ]),
    )
    .run();
}
function transferBlock(slot: number, time: number, to: string, amount = "25") {
  const tokenBalance = (
    accountIndex: number,
    owner: string,
    balance: string,
  ) => ({
    accountIndex,
    mint,
    owner,
    uiTokenAmount: {
      amount: balance,
      decimals: 6,
      uiAmount: 0,
      uiAmountString: "0",
    },
  });
  return {
    blockTime: time,
    parentSlot: slot - 1,
    transactions: [
      {
        transaction: {
          signatures: [`fixture-${slot}`],
          message: {
            accountKeys: [
              { pubkey: source },
              { pubkey: destination },
              { pubkey: tokenProgram },
            ],
            instructions: [
              {
                programId: tokenProgram,
                parsed: {
                  type: "transfer",
                  info: {
                    source: source.toBase58(),
                    destination: destination.toBase58(),
                    amount,
                  },
                },
              },
            ],
          },
        },
        meta: {
          err: null,
          innerInstructions: [],
          preTokenBalances: [
            tokenBalance(0, receiver, "100"),
            tokenBalance(1, to, "0"),
          ],
          postTokenBalances: [
            tokenBalance(0, receiver, (100n - BigInt(amount)).toString()),
            tokenBalance(1, to, amount),
          ],
        },
      },
    ],
  } as unknown as ParsedBlockResponse;
}
describe("finalized ownership and replay", () => {
  it("preserves purchase lots for same-owner transfers and ignores duplicate delivery", async () => {
    await ownership();
    const block = JSON.parse(
      json(transferBlock(1, 200, receiver)),
    ) as ParsedBlockResponse;
    await applyBlock(env as unknown as JobsEnv, 1, block);
    await applyBlock(env as unknown as JobsEnv, 1, block);
    const row = await env.DB.prepare(
      "SELECT balance,lots FROM ownership WHERE mint=? AND wallet=?",
    )
      .bind(mint, receiver)
      .first<{ balance: string; lots: string }>();
    expect(row!.balance).toBe("100");
    expect(JSON.parse(row!.lots)[0].cost).toBe("2000000000");
    expect(
      (await env.DB.prepare("SELECT count(*) n FROM indexed_events").first<{
        n: number;
      }>())!.n,
    ).toBe(1);
  });
  it("terminates transferred FIFO cost, gives receivers no holding bonus and accrues holder time", async () => {
    await ownership();
    await applyBlock(
      env as unknown as JobsEnv,
      2,
      transferBlock(2, 200, wallet),
    );
    const row = await env.DB.prepare(
      "SELECT balance,lots FROM ownership WHERE mint=? AND wallet=?",
    )
      .bind(mint, receiver)
      .first<{ balance: string; lots: string }>();
    expect(row!.balance).toBe("75");
    expect(JSON.parse(row!.lots)[0].cost).toBe("1500000000");
    const received = await env.DB.prepare(
      "SELECT balance,lots FROM ownership WHERE mint=? AND wallet=?",
    )
      .bind(mint, wallet)
      .first<{ balance: string; lots: string }>();
    expect(received!.balance).toBe("25");
    expect(JSON.parse(received!.lots)).toEqual([]);
    expect(
      (await env.DB.prepare(
        "SELECT weight FROM holder_weights WHERE mint=? AND wallet=?",
      )
        .bind(mint, receiver)
        .first<{ weight: string }>())!.weight,
    ).toBe("10000");
  });
  it("blocks settlement progress when token ownership history is incomplete", async () => {
    await ownership();
    await expect(
      applyBlock(
        env as unknown as JobsEnv,
        3,
        transferBlock(3, 200, wallet, "101"),
      ),
    ).rejects.toThrow("Incomplete token ownership history");
    expect(
      await env.DB.prepare(
        "SELECT value FROM checkpoints WHERE id='complete-slot'",
      ).first(),
    ).toBeNull();
    expect(
      (await env.DB.prepare(
        "SELECT balance FROM ownership WHERE mint=? AND wallet=?",
      )
        .bind(mint, receiver)
        .first<{ balance: string }>())!.balance,
    ).toBe("100");
  });
});

import { snapshot } from "../../jobs/src/settlement";
it("reuses the canonical snapshot across Workflow restarts and rejects corrupt R2 artifacts", async () => {
  const canonical = json({
    epoch: 1,
    entries: [],
    poolSol: "1000000000",
    solUsdMicros: "200000000",
  });
  const digest = Array.from(await sha(new TextEncoder().encode(canonical)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const path = `snapshots/1/${digest}.json`;
  await env.ARTIFACTS.put(path, canonical);
  await env.DB.prepare(
    "INSERT INTO epochs(epoch,status,pool_sol,snapshot_hash,snapshot_key) VALUES(1,'snapshot','1000000000',?,?)",
  )
    .bind(digest, path)
    .run();
  // Even after funding moved on-chain, the already-frozen allocation must survive.
  const frozen = await snapshot(env as unknown as JobsEnv, 1);
  expect(frozen.poolSol).toBe("1000000000");
  expect(frozen.hash).toBe(digest);
  await env.ARTIFACTS.put(path, "corrupt");
  await expect(snapshot(env as unknown as JobsEnv, 1)).rejects.toThrow(
    "Retained snapshot integrity failure",
  );
});

import { settleHolders } from "../../jobs/src/operations";
it("blocks holder settlement before finalized history reaches the weekly cutoff", async () => {
  await expect(settleHolders(env as unknown as JobsEnv, 1)).rejects.toThrow(
    "Finalized ingestion has not reached the holder epoch boundary",
  );
});

it("blocks incomplete token metadata and unrecorded ownership movement", async () => {
  await ownership();
  const missing = transferBlock(4, 200, wallet);
  delete missing.transactions[0].meta!.postTokenBalances![1].owner;
  await expect(
    applyBlock(env as unknown as JobsEnv, 4, missing),
  ).rejects.toThrow("Incomplete token ownership metadata");
  const hidden = transferBlock(5, 200, wallet);
  hidden.transactions[0].transaction.message.instructions = [];
  await expect(
    applyBlock(env as unknown as JobsEnv, 5, hidden),
  ).rejects.toThrow("Incomplete token balance history");
  const noInner = transferBlock(6, 200, wallet);
  noInner.transactions[0].transaction.message.accountKeys.push({
    pubkey: new PublicKey(env.PROGRAM_ID),
    signer: false,
    writable: false,
  });
  noInner.transactions[0].meta!.innerInstructions = null;
  await expect(
    applyBlock(env as unknown as JobsEnv, 6, noInner),
  ).rejects.toThrow("Incomplete token inner-instruction history");
  expect(
    await env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first(),
  ).toBeNull();
});

import { pda } from "@waffles/shared/client";
import { createdMints } from "../../jobs/src/ingest";
it.each(["active", "withdrawn", "noncanonical"])(
  "counts only releasable commitment tokens: %s",
  async (state) => {
    await ownership();
    const id = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;
    const vault =
      state === "noncanonical" ? destination : pda("locked-tokens", id);
    const active = state === "active";
    const commitment = {
      id: id.toBase58(),
      mint,
      owner: wallet,
      asset: "token",
      amount: "100",
      purchaseCost: "1000",
      startAt: 100,
      unlockAt: 1000,
      withdrawn: state === "withdrawn",
      kind: "purchased-tokens",
    };
    await env.DB.prepare(
      "INSERT INTO commitments(id,mint,owner,start_at,unlock_at,withdrawn,data) VALUES(?,?,?,100,1000,?,?)",
    )
      .bind(
        id.toBase58(),
        mint,
        wallet,
        state === "withdrawn" ? 1 : 0,
        json(commitment),
      )
      .run();
    await env.DB.prepare(
      "INSERT INTO ownership(mint,wallet,balance,lots,updated_at) VALUES(?,?,?,'[]',100)",
    )
      .bind(mint, wallet, active ? "100" : "0")
      .run();
    const block = transferBlock(10, 200, id.toBase58());
    const tx = block.transactions[0];
    tx.transaction.message.accountKeys[1].pubkey = vault;
    (tx.transaction.message.instructions[0] as any).parsed.info.destination =
      vault.toBase58();
    tx.meta!.preTokenBalances![1].uiTokenAmount.amount = "100";
    tx.meta!.postTokenBalances![1].uiTokenAmount.amount = "125";
    await applyBlock(env as unknown as JobsEnv, 10, block);
    const balance = await env.DB.prepare(
      "SELECT balance FROM ownership WHERE mint=? AND wallet=?",
    )
      .bind(mint, wallet)
      .first<{ balance: string }>();
    expect(balance!.balance).toBe(active ? "100" : "0");
    expect(
      (await env.DB.prepare(
        "SELECT balance FROM ownership WHERE mint=? AND wallet=?",
      )
        .bind(mint, receiver)
        .first<{ balance: string }>())!.balance,
    ).toBe("75");
  },
);

it("preserves purchase eligibility when account authority stays the same", async () => {
  await ownership();
  const block = transferBlock(11, 200, receiver);
  const tx = block.transactions[0];
  tx.transaction.message.instructions = [
    {
      programId: tokenProgram,
      parsed: {
        type: "setAuthority",
        info: {
          account: source.toBase58(),
          authorityType: "accountOwner",
          newAuthority: receiver,
        },
      },
    },
  ] as any;
  tx.meta!.postTokenBalances = tx.meta!.preTokenBalances;
  await applyBlock(env as unknown as JobsEnv, 11, block);
  const row = await env.DB.prepare(
    "SELECT balance,lots FROM ownership WHERE mint=? AND wallet=?",
  )
    .bind(mint, receiver)
    .first<{ balance: string; lots: string }>();
  expect(row!.balance).toBe("100");
  expect(JSON.parse(row!.lots)[0].cost).toBe("2000000000");
});

import app from "../src/index";
it("identifies loopback validators as localnet and public devnet as devnet", async () => {
  for (const [rpc, network] of [
    ["http://127.0.0.1:8899", "localnet"],
    ["http://localhost:8899", "localnet"],
    ["https://api.devnet.solana.com", "devnet"],
  ]) {
    const response = await app.request(
      "https://waffles/v1/config",
      {},
      { ...env, RPC_URL: rpc },
    );
    expect(((await response.json()) as { network: string }).network).toBe(
      network,
    );
  }
});

import jobs from "../../jobs/src/index";

it("ignores vote-only transactions without per-block database writes", async () => {
  const block = transferBlock(14, 200, wallet);
  const tx = block.transactions[0];
  tx.transaction.message.accountKeys = [
    {
      pubkey: new PublicKey("Vote111111111111111111111111111111111111111"),
      signer: false,
      writable: false,
    },
  ];
  tx.transaction.message.instructions = [];
  tx.meta!.preTokenBalances = [];
  tx.meta!.postTokenBalances = [];
  tx.meta!.innerInstructions = null;
  await applyBlock(env as unknown as JobsEnv, 14, block);
  expect(
    await env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first(),
  ).toBeNull();
  expect(
    (await env.DB.prepare("SELECT count(*) n FROM indexed_events").first<{
      n: number;
    }>())!.n,
  ).toBe(0);
});

it("ignores unrelated tokens before the first Waffles market", async () => {
  await applyBlock(
    env as unknown as JobsEnv,
    15,
    transferBlock(15, 200, wallet),
  );
  expect(
    (await env.DB.prepare("SELECT count(*) n FROM ownership").first<{
      n: number;
    }>())!.n,
  ).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first(),
  ).toBeNull();
});

it("uploads validated images without a verification challenge", async () => {
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const form = new FormData();
  form.set("file", new File([bytes], "token.png", { type: "image/png" }));
  const response = await SELF.fetch("https://waffles/v1/uploads", {
    method: "POST",
    body: form,
  });
  expect(response.status).toBe(201);
  const { url } = (await response.json()) as { url: string };
  const asset = await SELF.fetch(url);
  expect(asset.status).toBe(200);
  expect(asset.headers.get("Content-Type")).toBe("image/png");
  expect(asset.headers.get("Cross-Origin-Resource-Policy")).toBe(
    "cross-origin",
  );
  expect(
    (await SELF.fetch("https://waffles/v1/config")).headers.get(
      "Cross-Origin-Resource-Policy",
    ),
  ).toBe("same-origin");
  expect(new Uint8Array(await asset.arrayBuffer())).toEqual(bytes);
  const invalid = new FormData();
  invalid.set(
    "file",
    new File(["This is not a PNG image"], "invalid.png", { type: "image/png" }),
  );
  expect(
    (
      await SELF.fetch("https://waffles/v1/uploads", {
        method: "POST",
        body: invalid,
      })
    ).status,
  ).toBe(400);
});

it("starts alarm scheduling only with the operations token", async () => {
  const fetch = vi.fn(async () => new Response("scheduled"));
  const coordinator = {
    idFromName: vi.fn(() => "devnet"),
    get: vi.fn(() => ({ fetch })),
  };
  const bindings = {
    ...env,
    OPERATIONS_TOKEN: "test-start",
    COORDINATOR: coordinator,
  } as unknown as JobsEnv;
  const denied = await jobs.fetch(
    new Request("https://jobs/start", { method: "POST" }),
    bindings,
  );
  expect(denied.status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  const started = await jobs.fetch(
    new Request("https://jobs/start", {
      method: "POST",
      headers: { Authorization: "Bearer test-start" },
    }),
    bindings,
  );
  expect(started.status).toBe(200);
  expect(await started.text()).toBe("scheduled");
  expect(coordinator.idFromName).toHaveBeenCalledWith("devnet");
  expect(fetch).toHaveBeenCalledWith("https://coordinator/discover", {
    method: "POST",
  });
});

import { RpcBudget, rpcConnection, RpcDeferred } from "../../jobs/src/rpc";
import { Coordinator } from "../../jobs/src/index";
import { fetchRange, readRange, relevantBlock, verifyHistory, type RangeJob, type RangeArchive } from "../../jobs/src/ranges";
import { flushOwnership } from "../../jobs/src/settlement";

async function rangeJob(start = 12, end = 15) {
  await env.DB.prepare("INSERT INTO ingestion_ranges(start,end) VALUES(?,?)")
    .bind(start, end).run();
  return (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=?")
    .bind(start).first<RangeJob>())!;
}
async function retainRange(archive: RangeArchive) {
  const job = await rangeJob(archive.start, archive.end);
  const raw = new TextEncoder().encode(json(archive));
  const hash = Array.from(await sha(raw), (b) => b.toString(16).padStart(2, "0")).join("");
  const objectKey = `test-ranges/${archive.start}/${hash}`;
  await env.ARTIFACTS.put(objectKey, await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  await env.DB.prepare("UPDATE ingestion_ranges SET object_key=?,hash=?,complete=1 WHERE start=?")
    .bind(objectKey, hash, job.start).run();
}
function headers(slot: number, parent: number, time = 200) {
  return { ...transferBlock(slot, time, wallet), parentSlot: parent, transactions: [] };
}
const thirdAccount = Keypair.fromSeed(new Uint8Array(32).fill(6)).publicKey;
const thirdOwner = Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58();
const receipt = (signature: string, slot: number) => ({ signature, slot, err: null });
async function anchoredHistory(withSource = false) {
  if (withSource) {
    await ownership();
    await env.DB.prepare("INSERT INTO token_accounts(address,mint,owner) VALUES(?,?,?)")
      .bind(source.toBase58(), mint, receiver).run();
  }
  await env.DB.prepare("INSERT INTO checkpoints(id,value) VALUES('complete-slot','11')").run();
  await retainRange({ version: 2, start: 12, end: 16, slots: [], blocks: [], history: {
    queries: {
      [env.PROGRAM_ID]: { anchor: receipt("program-anchor", 11), pages: [] },
      ...(withSource ? { [source.toBase58()]: { anchor: receipt("source-anchor", 11), pages: [] } } : {}),
    },
  } });
  await env.DB.prepare("UPDATE ingestion_ranges SET complete=0 WHERE start=12").run();
  return (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
}
function historyRpc(histories: Record<string, ReturnType<typeof receipt>[]>, blocks: Record<number, ParsedBlockResponse>) {
  const calls: { method: string; params: any[] }[] = [];
  const fetch = async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));
    const respond = (call: { id: unknown; method: string; params: any[] }) => {
      calls.push(call);
      let result: unknown;
      if (call.method === "getSignaturesForAddress") {
        const rows = histories[call.params[0]] ?? [];
        const before = call.params[1].before;
        const start = before ? rows.findIndex((row) => row.signature === before) + 1 : 0;
        result = rows.slice(start, start + 1000);
      } else if (call.method === "getBlock") {
        expect(call.params[1].maxSupportedTransactionVersion).toBe(1);
        result = blocks[call.params[0]] ?? null;
      } else if (call.method === "getBlocks") result = [12, 13, 14, 15, 16];
      else if (call.method === "getBlockTime") result = 204;
      else throw new Error(`Unexpected history RPC ${call.method}`);
      return { jsonrpc: "2.0", id: call.id, result };
    };
    return Response.json(Array.isArray(payload) ? payload.map(respond) : respond(payload));
  };
  return { calls, bindings: { ...env, RPC: { idFromName: () => "history", get: () => ({ fetch }) } } as unknown as JobsEnv };
}
function relayBlock(slot = 14) {
  const block = transferBlock(slot, 201, thirdOwner, "10"), tx = block.transactions[0];
  tx.transaction.signatures = ["relay"];
  tx.transaction.message.accountKeys[0].pubkey = destination;
  tx.transaction.message.accountKeys[1].pubkey = thirdAccount;
  const ix = tx.transaction.message.instructions[0];
  if ("parsed" in ix) Object.assign(ix.parsed.info, {
    source: destination.toBase58(), destination: thirdAccount.toBase58(),
  });
  tx.meta!.preTokenBalances![0].owner = wallet;
  tx.meta!.preTokenBalances![0].uiTokenAmount.amount = "25";
  tx.meta!.postTokenBalances![0].owner = wallet;
  tx.meta!.postTokenBalances![0].uiTokenAmount.amount = "15";
  return block;
}
function burnCloseBlock() {
  const block = transferBlock(15, 202, thirdOwner, "10"), tx = block.transactions[0];
  tx.transaction.signatures = ["burn-close"];
  tx.transaction.message.accountKeys[0].pubkey = thirdAccount;
  tx.transaction.message.instructions = [
    { programId: tokenProgram, program: "spl-token", parsed: { type: "burn", info: { account: thirdAccount.toBase58(), mint, amount: "10" } } },
    { programId: tokenProgram, program: "spl-token", parsed: { type: "closeAccount", info: { account: thirdAccount.toBase58() } } },
  ];
  tx.meta!.preTokenBalances = [tx.meta!.preTokenBalances![0]];
  tx.meta!.preTokenBalances[0].owner = thirdOwner;
  tx.meta!.preTokenBalances[0].uiTokenAmount.amount = "10";
  tx.meta!.postTokenBalances = [];
  return block;
}
async function applyHistory(stub: DurableObjectStub) {
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const publish = vi.spyOn(instance as unknown as { publish(): Promise<void> }, "publish").mockResolvedValue();
    try { await instance.fetch(new Request("https://coordinator/apply")); }
    finally { publish.mockRestore(); await state.storage.deleteAlarm(); }
  });
}

it("follows outside transfers into newly discovered and later-closed accounts before advancing", async () => {
  const job = await anchoredHistory(true);
  const { bindings, calls } = historyRpc({
    [env.PROGRAM_ID]: [receipt("program-anchor", 11)],
    [source.toBase58()]: [receipt("fixture-12", 12), receipt("source-anchor", 11)],
    [destination.toBase58()]: [receipt("relay", 14), receipt("fixture-12", 12)],
    [thirdAccount.toBase58()]: [receipt("burn-close", 15), receipt("relay", 14)],
  }, { 12: transferBlock(12, 200, wallet), 14: relayBlock(), 15: burnCloseBlock() });
  await fetchRange(bindings, job);
  const saved = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(saved.complete).toBe(1);
  const archive = await readRange(bindings, saved);
  expect(archive.slots).toEqual([12, 14, 15]);
  expect(Object.keys(archive.history!.queries)).toContain(thirdAccount.toBase58());
  await verifyHistory(bindings, archive);
  const thirdQuery = archive.history!.queries[thirdAccount.toBase58()];
  delete archive.history!.queries[thirdAccount.toBase58()];
  await expect(verifyHistory(bindings, archive)).rejects.toThrow("Unqueried token account");
  archive.history!.queries[thirdAccount.toBase58()] = thirdQuery;
  const signatures = archive.blocks[1].signatures;
  archive.blocks[1].signatures = [];
  await expect(verifyHistory(bindings, archive)).rejects.toThrow("History receipt missing");
  archive.blocks[1].signatures = signatures;
  expect(calls.some((call) => call.method === "getTokenAccountsByOwner")).toBe(false);
  await applyHistory(env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID())));
  const balances = await env.DB.prepare("SELECT wallet,balance FROM ownership WHERE mint=?").bind(mint)
    .all<{ wallet: string; balance: string }>();
  expect(new Map(balances.results.map((row) => [row.wallet, row.balance]))).toEqual(
    new Map([[receiver, "75"], [wallet, "15"], [thirdOwner, "0"]]),
  );
  expect(await env.DB.prepare("SELECT address FROM token_accounts WHERE address=?").bind(thirdAccount.toBase58()).first()).not.toBeNull();
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("16");
});

it("uses canonical within-block order rather than signature order", async () => {
  const job = await anchoredHistory(true);
  const block = transferBlock(12, 200, wallet);
  block.transactions[0].transaction.signatures = ["z-first"];
  const second = relayBlock(12).transactions[0];
  second.transaction.signatures = ["a-second"];
  block.transactions.push(second);
  const { bindings } = historyRpc({
    [env.PROGRAM_ID]: [receipt("program-anchor", 11)],
    [source.toBase58()]: [receipt("z-first", 12), receipt("source-anchor", 11)],
    [destination.toBase58()]: [receipt("a-second", 12), receipt("z-first", 12)],
    [thirdAccount.toBase58()]: [receipt("a-second", 12)],
  }, { 12: block });
  await fetchRange(bindings, job);
  const saved = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(saved.complete).toBe(1);
  await applyHistory(env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID())));
  expect((await env.DB.prepare("SELECT balance FROM ownership WHERE wallet=?").bind(wallet).first<{ balance: string }>())?.balance).toBe("15");
});

it("paginates beyond newer activity to an older anchor without downloading irrelevant blocks", async () => {
  const job = await anchoredHistory();
  const rows = Array.from({ length: 1000 }, (_, i) => receipt(`future-${i}`, 2000 - i));
  rows.push(receipt("program-anchor", 11));
  const { bindings, calls } = historyRpc({ [env.PROGRAM_ID]: rows }, {});
  await fetchRange(bindings, job);
  const saved = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(saved.complete).toBe(1);
  const archive = await readRange(bindings, saved);
  expect(archive.slots).toEqual([]);
  expect(calls.filter((call) => call.method === "getSignaturesForAddress")).toHaveLength(2);
  expect(calls.filter((call) => call.method === "getBlock")).toHaveLength(0);
  await applyHistory(env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID())));
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-time'").first<{ value: string }>())?.value).toBe("204");
});

it("does not interpret a missing recorded anchor as an empty period and retries the rejected page", async () => {
  const job = await anchoredHistory();
  const histories = { [env.PROGRAM_ID]: [] as ReturnType<typeof receipt>[] };
  const { bindings } = historyRpc(histories, {});
  await fetchRange(bindings, job);
  const partial = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(partial.complete).toBe(0);
  expect((await readRange(bindings, partial)).history!.queries[env.PROGRAM_ID].pages).toEqual([]);
  histories[env.PROGRAM_ID] = [receipt("program-anchor", 11)];
  await fetchRange(bindings, partial);
  expect((await env.DB.prepare("SELECT complete FROM ingestion_ranges WHERE start=12").first<{ complete: number }>())?.complete).toBe(1);
});

it("rejects a repeated pagination page without advancing the checkpoint", async () => {
  const job = await anchoredHistory();
  const page = Array.from({ length: 1000 }, (_, i) => receipt(`repeat-${i}`, 2000 - i));
  let reads = 0;
  const fetch = async (_url: string, init: RequestInit) => {
    const calls = JSON.parse(String(init.body));
    reads++;
    return Response.json(calls.map((call: { id: string }) => ({ jsonrpc: "2.0", id: call.id, result: page })));
  };
  const bindings = { ...env, RPC: { idFromName: () => "repeat", get: () => ({ fetch }) } } as unknown as JobsEnv;
  await fetchRange(bindings, job);
  expect(reads).toBe(2);
  expect((await env.DB.prepare("SELECT complete FROM ingestion_ranges WHERE start=12").first<{ complete: number }>())?.complete).toBe(0);
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("11");
});

it("waits through a short RPC cooldown without checkpointing every throttled burst", async () => {
  const job = await anchoredHistory();
  const { bindings } = historyRpc({ [env.PROGRAM_ID]: [receipt("program-anchor", 11)] }, {});
  const downstream = bindings.RPC.get(bindings.RPC.idFromName("history"));
  let limited = true;
  const fetch = async (url: string, init: RequestInit) => {
    if (limited) {
      limited = false;
      return new Response("busy", { status: 429, headers: { "Retry-After": "1" } });
    }
    return downstream.fetch(url, init);
  };
  await fetchRange({ ...bindings, RPC: { idFromName: () => "wait", get: () => ({ fetch }) } } as unknown as JobsEnv, job);
  expect(await env.DB.prepare("SELECT complete,attempts FROM ingestion_ranges WHERE start=12").first())
    .toEqual({ complete: 1, attempts: 0 });
});

it("retains existing range metadata when widening the history window bound", async () => {
  await env.DB.prepare("DROP TABLE ingestion_ranges").run();
  const old = env.TEST_MIGRATIONS.find((migration) => migration.name === "0003_ingestion_ranges.sql")!;
  const next = env.TEST_MIGRATIONS.find((migration) => migration.name === "0004_history_windows.sql")!;
  await env.DB.batch(old.queries.map((sql) => env.DB.prepare(sql)));
  await env.DB.prepare("INSERT INTO ingestion_ranges(start,end,object_key,hash,complete,applied) VALUES(12,523,'retained','hash',1,1)").run();
  await env.DB.batch(next.queries.map((sql) => env.DB.prepare(sql)));
  expect(await env.DB.prepare("SELECT object_key,hash,complete,applied FROM ingestion_ranges WHERE start=12").first())
    .toEqual({ object_key: "retained", hash: "hash", complete: 1, applied: 1 });
  await env.DB.prepare("INSERT INTO ingestion_ranges(start,end) VALUES(1000,9191)").run();
  await expect(env.DB.prepare("INSERT INTO ingestion_ranges(start,end) VALUES(10000,18192)").run()).rejects.toThrow();
});

it("batches quiet head periods but wakes promptly for a new Waffles call after restart", async () => {
  await anchoredHistory();
  const stored = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  // Finish a real anchored quiet range, so the hint is reconstructed from its archive.
  const { bindings: quiet } = historyRpc({ [env.PROGRAM_ID]: [receipt("program-anchor", 11)] }, {});
  await fetchRange(quiet, stored);
  const id = env.COORDINATOR.idFromName(crypto.randomUUID());
  let stub = env.COORDINATOR.get(id);
  await applyHistory(stub);
  let latest = "program-anchor";
  const fetch = async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));
    const respond = (call: any) => ({ jsonrpc: "2.0", id: call.id,
      result: call.method === "getSlot" ? 100 : [receipt(latest, latest === "program-anchor" ? 11 : 99)],
    });
    return Response.json(Array.isArray(payload) ? payload.map(respond) : respond(payload));
  };
  const check = async (instance: Coordinator, state: DurableObjectState, wake: boolean) => {
    const local = (instance as unknown as { env: JobsEnv }).env, previous = local.RPC;
    local.RPC = { idFromName: () => "hint", get: () => ({ fetch }) } as unknown as DurableObjectNamespace;
    const send = vi.spyOn(local.BLOCKS, "send").mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });
    try {
      await (instance as unknown as { discover(): Promise<void> }).discover();
      if (wake) expect(send).toHaveBeenCalledExactlyOnceWith({ start: 17, end: 100 });
      else expect(send).not.toHaveBeenCalled();
    } finally { send.mockRestore(); local.RPC = previous; await state.storage.deleteAlarm(); }
  };
  await runInDurableObject<Coordinator, void>(stub, (instance, state) => check(instance, state, false));
  await expect(runInDurableObject<Coordinator, void>(stub, (_instance, state) => state.abort("hint restart"))).rejects.toThrow("hint restart");
  stub = env.COORDINATOR.get(id);
  await runInDurableObject<Coordinator, void>(stub, (instance, state) => check(instance, state, false));
  latest = "new-call";
  await runInDurableObject<Coordinator, void>(stub, (instance, state) => check(instance, state, true));
});

it("accounts for a token account initialized, funded, burned and closed within one transaction", async () => {
  await ownership();
  const block = transferBlock(12, 200, wallet), tx = block.transactions[0];
  tx.meta!.preTokenBalances = [tx.meta!.preTokenBalances![0]];
  tx.meta!.postTokenBalances = [tx.meta!.postTokenBalances![0]];
  tx.transaction.message.instructions.unshift({ programId: tokenProgram, program: "spl-token", parsed: {
    type: "initializeAccount3", info: { account: destination.toBase58(), mint, owner: wallet },
  } });
  tx.transaction.message.instructions.push(
    { programId: tokenProgram, program: "spl-token", parsed: { type: "burn", info: { account: destination.toBase58(), mint, amount: "25" } } },
    { programId: tokenProgram, program: "spl-token", parsed: { type: "closeAccount", info: { account: destination.toBase58() } } },
  );
  const tracked = new Set<string>();
  relevantBlock(block, new Set([mint]), env.PROGRAM_ID, tracked);
  expect(tracked.has(destination.toBase58())).toBe(true);
  await applyBlock(env as unknown as JobsEnv, 12, block);
  expect((await env.DB.prepare("SELECT balance FROM ownership WHERE wallet=?").bind(wallet).first<{ balance: string }>())?.balance).toBe("0");
});

it("does not mistake a closed address reused for a foreign mint for Waffles holdings", async () => {
  await ownership();
  const block = transferBlock(12, 200, wallet), tx = block.transactions[0];
  const foreign = { ...tx.meta!.postTokenBalances![1], mint: thirdAccount.toBase58(),
    uiTokenAmount: { ...tx.meta!.postTokenBalances![1].uiTokenAmount, amount: "7" } };
  tx.meta!.preTokenBalances = [tx.meta!.preTokenBalances![0]];
  tx.meta!.postTokenBalances = [tx.meta!.postTokenBalances![0], foreign];
  tx.transaction.message.instructions.unshift({ programId: tokenProgram, program: "spl-token", parsed: {
    type: "initializeAccount3", info: { account: destination.toBase58(), mint, owner: wallet },
  } });
  tx.transaction.message.instructions.push(
    { programId: tokenProgram, program: "spl-token", parsed: { type: "burn", info: { account: destination.toBase58(), mint, amount: "25" } } },
    { programId: tokenProgram, program: "spl-token", parsed: { type: "closeAccount", info: { account: destination.toBase58() } } },
    { programId: tokenProgram, program: "spl-token", parsed: { type: "initializeAccount3", info: { account: destination.toBase58(), mint: thirdAccount.toBase58(), owner: wallet } } },
    { programId: tokenProgram, program: "spl-token", parsed: { type: "mintTo", info: { account: destination.toBase58(), amount: "7" } } },
  );
  const tracked = new Set<string>();
  relevantBlock(block, new Set([mint]), env.PROGRAM_ID, tracked);
  expect(tracked.has(destination.toBase58())).toBe(true);
  await applyBlock(env as unknown as JobsEnv, 12, block);
  expect((await env.DB.prepare("SELECT balance FROM ownership WHERE wallet=?").bind(wallet).first<{ balance: string }>())?.balance).toBe("0");
  expect(await env.DB.prepare("SELECT mint FROM token_accounts WHERE address=?").bind(destination.toBase58()).first()).toBeNull();
  expect(await env.DB.prepare("SELECT mint FROM ownership WHERE mint=?").bind(thirdAccount.toBase58()).first()).toBeNull();
});

it("discovers only event-verified launch mints rather than foreign balances mentioned in a Waffles call", () => {
  const block = transferBlock(12, 200, wallet), tx = block.transactions[0];
  tx.transaction.message.accountKeys.push({ pubkey: new PublicKey(env.PROGRAM_ID), signer: false, writable: false });
  tx.transaction.message.instructions = [{
    programId: new PublicKey(env.PROGRAM_ID), accounts: [],
    // Fixed Created-event vector encoded by the installed Anchor library.
    data: "bdbn4SHaezrHaVaBCoYQjNCCwidut48mQJFCm2ZYDqQkkJE4sJ1oEST6RUrexjG8LNMKBPcSN3c3wg8YkLVW9zfP7VJtNU6Nraoq7acbQdZSKHsMLGudivYpcUdypqR3urp8y8okhSsaWMSXFs8F9y6u9M2WjhwikZYpWKDLhLFe2hVkuBu",
  }];
  const foreignMint = thirdAccount.toBase58();
  tx.meta!.postTokenBalances!.push({ ...tx.meta!.postTokenBalances![0], mint: foreignMint });
  const discovered = createdMints(env as unknown as JobsEnv, block);
  expect(discovered).toEqual([mint]);
  const mints = new Set(discovered);
  relevantBlock(block, mints, env.PROGRAM_ID);
  expect(mints.has(foreignMint)).toBe(false);
});

it("archives a finalized range including version-1 instructions without per-block rows", async () => {
  const job = await rangeJob();
  await fetchRange(env as unknown as JobsEnv, job);
  const saved = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(saved.complete).toBe(1);
  const archive = await readRange(env as unknown as JobsEnv, saved);
  expect(archive.slots).toEqual([12, 14, 15]);
  expect(archive.blocks.map((entry) => entry.slot)).toEqual([12, 14, 15]);
  expect(archive.blocks[0].block.transactions[0].version).toBe(1);
  expect(await env.DB.prepare("SELECT slot FROM pending_blocks").first()).toBeNull();
  expect(await env.DB.prepare("SELECT id FROM checkpoints").first()).toBeNull();
});

it("retains the contiguous download prefix and resumes without fetching completed blocks again", async () => {
  await retainRange({ version: 1, start: 12, end: 15, slots: [12, 14, 15], blocks: [] });
  await env.DB.prepare("UPDATE ingestion_ranges SET complete=0 WHERE start=12").run();
  const job = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  let fail = true;
  const fetched: number[] = [];
  const upstream = env.RPC.get(env.RPC.idFromName(crypto.randomUUID()));
  const fetch = async (url: string, init: RequestInit) => {
    const payload = JSON.parse(String(init.body));
    const calls = Array.isArray(payload) ? payload : [payload];
    for (const call of calls) if (call.method === "getBlock") fetched.push(call.params[0]);
    const response = await upstream.fetch(url, init);
    if (Array.isArray(payload) && calls.some((call) => call.params[0] === 14) && fail) {
      fail = false;
      const replies = await response.json() as { id: number }[];
      return Response.json(replies.map((reply) => reply.id === 14
        ? { jsonrpc: "2.0", id: 14, error: { code: -32004, message: "temporarily unavailable" } }
        : reply));
    }
    return response;
  };
  const bindings = { ...env, RPC: { idFromName: () => "unused", get: () => ({ fetch }) } } as unknown as JobsEnv;
  await fetchRange(bindings, job);
  const partial = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(partial.complete).toBe(0);
  expect((await readRange(bindings, partial)).blocks.map((entry) => entry.slot)).toEqual([12]);
  await fetchRange(bindings, partial);
  const complete = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect(complete.complete).toBe(1);
  expect(fetched.filter((slot) => slot === 12)).toHaveLength(1);
  expect(fetched.filter((slot) => slot === 14)).toHaveLength(2);
});

it("reuses legacy block archives and rejects altered range replay artifacts", async () => {
  const block = headers(12, 11);
  const raw = new TextEncoder().encode(json(block));
  const hash = Array.from(await sha(raw), (b) => b.toString(16).padStart(2, "0")).join("");
  await env.ARTIFACTS.put("legacy-block", await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  await env.DB.prepare("INSERT INTO pending_blocks(slot,parent,time,object_key,hash) VALUES(12,11,200,'legacy-block',?)")
    .bind(hash).run();
  const fetch = vi.fn(async () => { throw new Error("RPC must not be called"); });
  const bindings = { ...env, RPC: { idFromName: () => "unused", get: () => ({ fetch }) } } as unknown as JobsEnv;
  await retainRange({ version: 1, start: 12, end: 13, slots: [12], blocks: [] });
  await env.DB.prepare("UPDATE ingestion_ranges SET complete=0 WHERE start=12").run();
  await fetchRange(bindings, (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!);
  expect(fetch).not.toHaveBeenCalled();
  const job = (await env.DB.prepare("SELECT * FROM ingestion_ranges WHERE start=12").first<RangeJob>())!;
  expect((await readRange(bindings, job)).blocks).toHaveLength(1);
  await env.ARTIFACTS.put(job.object_key!, await new Response(
    new Blob(["{}"]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  await expect(readRange(bindings, job)).rejects.toThrow("checksum mismatch");
});

it("retains external transfers, burns, owner changes and incomplete tracked-account metadata", () => {
  const block = transferBlock(12, 200, wallet);
  expect(relevantBlock(block, new Set([mint]), env.PROGRAM_ID).transactions).toHaveLength(1);
  expect(relevantBlock(block, new Set(), env.PROGRAM_ID).transactions).toHaveLength(0);
  const missing = JSON.parse(json(block)) as ParsedBlockResponse;
  missing.transactions[0].meta!.preTokenBalances = [];
  missing.transactions[0].meta!.postTokenBalances = [];
  expect(relevantBlock(missing, new Set([mint]), env.PROGRAM_ID,
    new Set([source.toBase58()])).transactions).toHaveLength(1);
  const ownerChange = transferBlock(12, 200, wallet);
  ownerChange.transactions[0].meta!.postTokenBalances = undefined;
  expect(relevantBlock(ownerChange, new Set(), env.PROGRAM_ID).transactions).toHaveLength(1);
});

it("applies skipped-slot ranges atomically at the checkpoint and accepts duplicate delivery", async () => {
  await env.DB.prepare("INSERT INTO checkpoints(id,value) VALUES('complete-slot','11')").run();
  await retainRange({ version: 1, start: 12, end: 16, slots: [12, 14, 15],
    blocks: [{ slot: 12, block: headers(12, 11) }, { slot: 14, block: headers(14, 12) }, { slot: 15, block: headers(15, 14) }] });
  const stub = env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID()));
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    await instance.fetch(new Request("https://coordinator/apply"));
    await instance.fetch(new Request("https://coordinator/apply"));
    await state.storage.deleteAlarm();
  });
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("16");
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-block'").first<{ value: string }>())?.value).toBe("15");
  await retainRange({ version: 1, start: 17, end: 18, slots: [17], blocks: [{ slot: 17, block: headers(17, 15, 201) }] });
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    await instance.fetch(new Request("https://coordinator/apply"));
    await state.storage.deleteAlarm();
  });
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("18");
});

it("does not apply earlier transactions or advance across a missing parent", async () => {
  await ownership();
  await env.DB.prepare("INSERT INTO checkpoints(id,value) VALUES('complete-slot','11')").run();
  await retainRange({ version: 1, start: 12, end: 14, slots: [12, 14], blocks: [
    { slot: 12, block: transferBlock(12, 200, wallet) },
    { slot: 14, block: headers(14, 13) },
  ] });
  const stub = env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID()));
  await runInDurableObject<Coordinator, void>(stub, async (instance) => {
    await expect(instance.fetch(new Request("https://coordinator/apply"))).rejects.toThrow("Missing finalized block");
  });
  expect((await env.DB.prepare("SELECT balance FROM ownership WHERE wallet=?").bind(receiver).first<{ balance: string }>())?.balance).toBe("100");
  expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("11");
});

it("keeps exact holder-time weights without rewriting inactive positions every block", async () => {
  await ownership();
  await applyBlock(env as unknown as JobsEnv, 12, transferBlock(12, 200, wallet));
  await flushOwnership(env as unknown as JobsEnv, 300, { accrueHolders: false });
  expect((await env.DB.prepare("SELECT updated_at FROM ownership WHERE wallet=?").bind(receiver).first<{ updated_at: number }>())?.updated_at).toBe(200);
  await flushOwnership(env as unknown as JobsEnv, 400);
  const weights = await env.DB.prepare("SELECT wallet,weight FROM holder_weights WHERE mint=?").bind(mint).all<{ wallet: string; weight: string }>();
  const byWallet = new Map(weights.results.map((row) => [row.wallet, row.weight]));
  expect(byWallet.get(receiver)).toBe("25000");
  expect(byWallet.get(wallet)).toBe("5000");
});

it("splits lazy holder accrual exactly at the weekly boundary", async () => {
  await ownership();
  const epoch = epochAt(100), boundary = epochBounds(epoch).end;
  await applyBlock(env as unknown as JobsEnv, 12, transferBlock(12, boundary + 10, wallet));
  await flushOwnership(env as unknown as JobsEnv, boundary + 20);
  const rows = await env.DB.prepare("SELECT epoch,wallet,weight FROM holder_weights WHERE mint=?")
    .bind(mint).all<{ epoch: number; wallet: string; weight: string }>();
  const weights = new Map(rows.results.map((row) => [`${row.epoch}:${row.wallet}`, row.weight]));
  expect(weights.get(`${epoch}:${receiver}`)).toBe((100n * BigInt(boundary - 100)).toString());
  expect(weights.get(`${epoch + 1}:${receiver}`)).toBe("1750");
  expect(weights.get(`${epoch + 1}:${wallet}`)).toBe("250");
});

it("tracks a mint and its accounts introduced earlier in the same range", () => {
  const created = transferBlock(12, 200, wallet);
  created.transactions[0].transaction.message.accountKeys.push({
    pubkey: new PublicKey(env.PROGRAM_ID), signer: false, writable: false,
  });
  const mints = new Set<string>([mint]), accounts = new Set<string>();
  relevantBlock(created, mints, env.PROGRAM_ID, accounts);
  expect(mints.has(mint)).toBe(true);
  expect(accounts.has(destination.toBase58())).toBe(true);
  expect(relevantBlock(transferBlock(14, 201, wallet), mints, env.PROGRAM_ID, accounts).transactions).toHaveLength(1);
});

it("reserves daily queue and write budgets before effects and resets on the next UTC day", async () => {
  const stub = env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID()));
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const work = instance as unknown as { reserve(kind: "messages" | "writes", count: number): Promise<void> };
    const day = new Date().toISOString().slice(0, 10);
    await state.storage.put("ingestion-budget", { day, messages: 1499, writes: 39999 });
    await work.reserve("messages", 1);
    await work.reserve("writes", 1);
    await expect(work.reserve("messages", 1)).rejects.toThrow("messages budget");
    await expect(work.reserve("writes", 1)).rejects.toThrow("writes budget");
    await state.storage.put("ingestion-budget", { day: "2000-01-01", messages: 1500, writes: 40000 });
    await work.reserve("messages", 1);
    expect(await state.storage.get("ingestion-budget")).toEqual({ day, messages: 1, writes: 0 });
  });
});

it("drains legacy queue notifications by waking durable range work rather than re-fetching each block", async () => {
  const fetch = vi.fn(async (_url: string) => new Response("scheduled"));
  const message = { body: { slot: 12 }, ack: vi.fn() };
  await jobs.queue({ messages: [message] } as unknown as MessageBatch<{ slot: number }>, {
    ...env, COORDINATOR: { idFromName: () => "devnet", get: () => ({ fetch }) },
  } as unknown as JobsEnv);
  expect(fetch.mock.calls[0][0]).toBe("https://coordinator/discover");
  expect(message.ack).toHaveBeenCalledOnce();
});

it("sends one range job and recovers an expired lease after a coordinator restart", async () => {
  const id = env.COORDINATOR.idFromName(crypto.randomUUID());
  let stub = env.COORDINATOR.get(id);
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const bindings = (instance as unknown as { env: JobsEnv }).env;
    const send = vi.spyOn(bindings.BLOCKS, "send").mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });
    await state.storage.put("maintenance-at", Date.now());
    try {
      await instance.alarm();
      await instance.alarm();
      expect(send).toHaveBeenCalledExactlyOnceWith({ start: 12, end: 1000 });
      expect((await env.DB.prepare("SELECT start FROM ingestion_ranges").all()).results).toHaveLength(1);
    } finally {
      send.mockRestore();
      await state.storage.deleteAlarm();
    }
  });
  await env.DB.prepare("UPDATE ingestion_ranges SET retry_at=0").run();
  await expect(runInDurableObject<Coordinator, void>(stub, (_instance, state) => {
    state.abort("range restart");
  })).rejects.toThrow("range restart");
  stub = env.COORDINATOR.get(id);
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    await instance.alarm();
    await state.storage.deleteAlarm();
  });
  expect((await env.DB.prepare("SELECT complete FROM ingestion_ranges WHERE start=12").first<{ complete: number }>())?.complete).toBe(1);
});

it("stops new sends after a provider queue quota error while retaining recoverable work", async () => {
  const stub = env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID()));
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const bindings = (instance as unknown as { env: JobsEnv }).env;
    const send = vi.spyOn(bindings.BLOCKS, "send").mockRejectedValue(
      new Error("Queue has exceeded daily operations limit"),
    );
    await state.storage.put("maintenance-at", Date.now());
    try {
      await instance.alarm();
      expect(await state.storage.get<number>("queue-resume-at")).toBeGreaterThan(Date.now());
      await instance.alarm(); // Finish the already-persisted range without another send.
      await instance.alarm(); // Apply it, but do not enqueue the next range.
      expect(send).toHaveBeenCalledOnce();
      expect((await env.DB.prepare("SELECT value FROM checkpoints WHERE id='complete-slot'").first<{ value: string }>())?.value).toBe("1000");
    } finally {
      send.mockRestore();
      await state.storage.deleteAlarm();
    }
  });
});

it("uses the durable alarm instead of sending when the daily message reservation is exhausted", async () => {
  const stub = env.COORDINATOR.get(env.COORDINATOR.idFromName(crypto.randomUUID()));
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const bindings = (instance as unknown as { env: JobsEnv }).env;
    const send = vi.spyOn(bindings.BLOCKS, "send").mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });
    await state.storage.put("ingestion-budget", {
      day: new Date().toISOString().slice(0, 10), messages: 1500, writes: 0,
    });
    try {
      await instance.alarm();
      expect(send).not.toHaveBeenCalled();
      expect(await state.storage.get<number>("queue-resume-at")).toBeGreaterThan(Date.now());
      expect(await env.DB.prepare("SELECT start FROM ingestion_ranges").first()).not.toBeNull();
    } finally {
      send.mockRestore();
      await state.storage.deleteAlarm();
    }
  });
});
const rpcCall = (
  stub: DurableObjectStub,
  method: string,
  params: unknown[] = [],
  lane = "background",
) =>
  stub.fetch("https://rpc/", {
    method: "POST",
    headers: { "X-RPC-Lane": lane },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

it("shares provider cooldown across callers and retains it after restart", async () => {
  const id = env.RPC.idFromName(crypto.randomUUID());
  let stub = env.RPC.get(id);
  const limited = await rpcCall(stub, "getBalance", ["rate-limit"]);
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThanOrEqual(59);
  await limited.text();
  await expect(
    runInDurableObject<RpcBudget, void>(stub, (_instance, state) => {
      state.abort("test restart");
    }),
  ).rejects.toThrow("test restart");
  stub = env.RPC.get(id);
  const blocked = await rpcCall(stub, "getBalance", ["normal"], "interactive");
  expect(blocked.status).toBe(429);
  await runInDurableObject<RpcBudget, void>(stub, async (instance, state) => {
    const budget = (await state.storage.get<any>("budget"))!;
    budget.until = 0;
    await state.storage.put("budget", budget);
    (instance as unknown as { budget?: unknown }).budget = undefined;
  });
  expect((await rpcCall(stub, "getBalance", ["normal"])).status).toBe(200);
});

it("reserves RPC capacity for interactive work and rejects JSON batches", async () => {
  const stub = env.RPC.get(env.RPC.idFromName(crypto.randomUUID()));
  expect((await rpcCall(stub, "getBalance", ["normal"])).status).toBe(200);
  await runInDurableObject<RpcBudget, void>(stub, async (instance, state) => {
    const budget = (await state.storage.get<any>("budget"))!;
    budget.background = 0;
    budget.tokens = 320;
    budget.until = 0;
    budget.at = Date.now();
    await state.storage.put("budget", budget);
    (instance as unknown as { budget?: unknown }).budget = undefined;
  });
  expect((await rpcCall(stub, "getBlock", [12, {}])).status).toBe(429);
  expect(
    (await rpcCall(stub, "getBalance", ["normal"], "interactive")).status,
  ).toBe(200);
  expect(
    (await stub.fetch("https://rpc/", { method: "POST", body: "[]" })).status,
  ).toBe(400);
  expect((await stub.fetch("https://rpc/", {
    method: "POST", headers: { "X-RPC-Lane": "interactive" },
    body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "getBlock", params: [12] }]),
  })).status).toBe(400);
});

it("does not hide SDK retries inside a coordinated deferral", async () => {
  const fetch = vi.fn(
    async () =>
      new Response("busy", { status: 429, headers: { "Retry-After": "60" } }),
  );
  const bindings = {
    ...env,
    RPC: { idFromName: () => "devnet", get: () => ({ fetch }) },
  } as unknown as JobsEnv;
  await expect(rpcConnection(bindings).getSlot()).rejects.toBeInstanceOf(
    RpcDeferred,
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it("validates the upstream network once and caches validation across requests", async () => {
  const stub = env.RPC.get(env.RPC.idFromName(crypto.randomUUID()));
  const first = (await (
    await rpcCall(stub, "getBalance", ["network-checks"])
  ).json()) as { result: { value: number } };
  const second = (await (
    await rpcCall(stub, "getBalance", ["network-checks"])
  ).json()) as { result: { value: number } };
  expect(second.result.value).toBe(first.result.value);
});

it("persists one conservative RPC reservation for successive requests and grants no fresh burst after restart", async () => {
  const id = env.RPC.idFromName(crypto.randomUUID());
  let stub = env.RPC.get(id);
  expect((await rpcCall(stub, "getBalance", ["normal"])).status).toBe(200);
  let reserved: unknown;
  await runInDurableObject<RpcBudget, void>(stub, async (_instance, state) => {
    reserved = await state.storage.get("budget");
  });
  expect((await rpcCall(stub, "getBalance", ["normal"])).status).toBe(200);
  await runInDurableObject<RpcBudget, void>(stub, async (_instance, state) => {
    expect(await state.storage.get("budget")).toEqual(reserved);
  });
  await expect(runInDurableObject<RpcBudget, void>(stub, (_instance, state) => {
    state.abort("reservation restart");
  })).rejects.toThrow("reservation restart");
  stub = env.RPC.get(id);
  expect((await rpcCall(stub, "getBalance", ["normal"])).status).toBe(429);
  await runInDurableObject<RpcBudget, void>(stub, async (instance) => {
    expect((instance as unknown as { budget: { at: number } }).budget.at).toBeGreaterThan(Date.now());
  });
});

it("pauses background RPC at its daily budget while preserving interactive access", async () => {
  const stub = env.RPC.get(env.RPC.idFromName(crypto.randomUUID()));
  await runInDurableObject<RpcBudget, void>(stub, async (_instance, state) => {
    await state.storage.put("rpc-requests", {
      day: new Date().toISOString().slice(0, 10), used: 60000,
    });
  });
  const blocked = await rpcCall(stub, "getBalance", ["normal"]);
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(1);
  expect((await rpcCall(stub, "getBalance", ["normal"], "interactive")).status).toBe(200);
});

import { accountPendingPrices } from "../../jobs/src/oracle";
it("backfills pending USD from historical prices while unavailable prices stay pending", async () => {
  await seed();
  await env.DB.prepare(
    "INSERT INTO trades(id,mint,trader,slot,time,signature,gross_sol,usd_micros,excluded,data) VALUES('pending',?,?,1,200,'sig','2000000000',NULL,0,'{}')",
  )
    .bind(mint, wallet)
    .run();
  const bindings = {
    ...env,
    PYTH_URL: "https://oracle.test",
  } as unknown as JobsEnv;
  await expect(accountPendingPrices(bindings)).rejects.toThrow(
    "Historical SOL/USD unavailable",
  );
  expect(
    (await env.DB.prepare(
      "SELECT usd_micros FROM trades WHERE id='pending'",
    ).first<{ usd_micros: string | null }>())!.usd_micros,
  ).toBeNull();
  await env.DB.prepare(
    "INSERT INTO oracle_prices(at,publish_time,usd_micros,r2_key) VALUES(200,200,'150000000','oracle/200.json')",
  ).run();
  await accountPendingPrices(bindings);
  expect(
    (await env.DB.prepare(
      "SELECT usd_micros FROM trades WHERE id='pending'",
    ).first<{ usd_micros: string }>())!.usd_micros,
  ).toBe("300000000");
});

it("pauses D1 work until the UTC reset and retains the pause across restart", async () => {
  const id = env.COORDINATOR.idFromName(crypto.randomUUID());
  let stub = env.COORDINATOR.get(id);
  const now = new Date();
  const resetAt =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) +
    5000;
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const work = instance as unknown as {
      apply(): Promise<void>;
      discover(): Promise<void>;
    };
    const apply = vi
      .spyOn(work, "apply")
      .mockRejectedValue(
        new Error(
          "D1_ERROR: Your account has exceeded D1's free tier daily row read limit.",
        ),
      );
    const discover = vi.spyOn(work, "discover").mockResolvedValue();
    try {
      await instance.alarm();
      expect(discover).not.toHaveBeenCalled();
      expect(await state.storage.get("d1-resume-at")).toBe(resetAt);
      expect(await state.storage.getAlarm()).toBe(resetAt);
    } finally {
      apply.mockRestore();
      discover.mockRestore();
    }
  });
  await expect(
    runInDurableObject<Coordinator, void>(stub, (_instance, state) => {
      state.abort("quota test restart");
    }),
  ).rejects.toThrow("quota test restart");
  stub = env.COORDINATOR.get(id);
  await runInDurableObject<Coordinator, void>(stub, async (instance, state) => {
    const work = instance as unknown as {
      apply(): Promise<void>;
      discover(): Promise<void>;
    };
    const apply = vi.spyOn(work, "apply").mockResolvedValue();
    const discover = vi.spyOn(work, "discover").mockResolvedValue();
    try {
      await instance.alarm();
      expect(apply).not.toHaveBeenCalled();
      expect(discover).not.toHaveBeenCalled();
      expect(await state.storage.getAlarm()).toBe(resetAt);
      await state.storage.put("d1-resume-at", Date.now() - 1);
      await state.storage.put("maintenance-at", Date.now());
      await instance.alarm();
      expect(apply).toHaveBeenCalledOnce();
      expect(discover).toHaveBeenCalledOnce();
    } finally {
      apply.mockRestore();
      discover.mockRestore();
      await state.storage.deleteAlarm();
    }
  });
});
