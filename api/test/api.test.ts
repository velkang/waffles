import { env, SELF } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey, type ParsedBlockResponse } from "@solana/web3.js";
import {
  json,
  INITIAL_SOL,
  INITIAL_TOKENS,
  SUPPLY,
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
      (await SELF.fetch("https://waffles/v1/protocol/balances")).status,
    ).toBe(503);
    expect(
      (await SELF.fetch(`https://waffles/v1/creator-earnings/${mint}`)).status,
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
import { applyBlock, fetchBlock } from "../../jobs/src/ingest";
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

it("requests and archives version-1 finalized transactions", async () => {
  await fetchBlock(
    {
      ...env,
      GENESIS_HASH: "verified-devnet",
      RPC_URL: "https://rpc.test",
      COORDINATOR: {
        idFromName: () => "test",
        get: () => ({ fetch: async () => new Response("applied") }),
      },
    } as unknown as JobsEnv,
    12,
  );
  const row = await env.DB.prepare(
    "SELECT object_key FROM pending_blocks WHERE slot=12",
  ).first<{ object_key: string }>();
  const artifact = await env.ARTIFACTS.get(row!.object_key);
  const saved = JSON.parse(
    await new Response(
      artifact!.body.pipeThrough(new DecompressionStream("gzip")),
    ).text(),
  );
  expect(saved.transactions[0].version).toBe(1);
});

import jobs from "../../jobs/src/index";
import * as ingestion from "../../jobs/src/ingest";
it("acknowledges successful block jobs when another job in the batch must retry", async () => {
  const fetch = vi
    .spyOn(ingestion, "fetchBlock")
    .mockImplementation(async (_env, slot) => {
      if (slot === 13) throw new Error("RPC unavailable");
    });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const good = { body: { slot: 12 }, ack: vi.fn(), retry: vi.fn() };
  const failed = { body: { slot: 13 }, ack: vi.fn(), retry: vi.fn() };
  try {
    await jobs.queue(
      { messages: [good, failed] } as unknown as MessageBatch<{ slot: number }>,
      env as unknown as JobsEnv,
    );
    expect(good.ack).toHaveBeenCalledOnce();
    expect(good.retry).not.toHaveBeenCalled();
    expect(failed.ack).not.toHaveBeenCalled();
    expect(failed.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  } finally {
    fetch.mockRestore();
    log.mockRestore();
  }
});

it("advances finalized history past vote-only transactions without token accounting", async () => {
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
    (await env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>())!.value,
  ).toBe("14");
  expect(
    (await env.DB.prepare("SELECT count(*) n FROM indexed_events").first<{
      n: number;
    }>())!.n,
  ).toBe(0);
});

it("advances history without indexing unrelated tokens before the first Waffles market", async () => {
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
    (await env.DB.prepare(
      "SELECT value FROM checkpoints WHERE id='complete-slot'",
    ).first<{ value: string }>())!.value,
  ).toBe("15");
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
