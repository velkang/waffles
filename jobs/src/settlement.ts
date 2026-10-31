import { rpcConnection } from "./rpc";
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { BN } from "@waffles/shared/client";
import {
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { quicknetClient, fetchBeacon, roundAt, roundTime } from "drand-client";
import {
  program,
  key,
  zeroKey,
  fundAddress,
  distributionAddress,
  configAddress,
  makeInstruction,
  eventAccounts,
} from "@waffles/shared/client";
import {
  LAMPORTS,
  DAY,
  epochAt,
  epochBounds,
  json,
} from "@waffles/shared/solana";
import {
  categoryTickets,
  completedLockWeeks,
  drawCount,
  drawTickets,
  allocatePrizes,
  claimLeaf,
  merkle,
  sha,
  hex,
  unhex,
  bytes,
  u64,
  holdingWeight,
} from "@waffles/shared/rewards";
import { oracle } from "./oracle";
import type { Env } from "./env";
import { settleHolders } from "./operations";
export function signer(secret: string | undefined) {
  if (!secret) throw new Error("Configure the isolated operational signer");
  const raw = secret.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(secret))
    : Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  if (raw.length !== 64)
    throw new Error("Operational signer must contain 64 bytes");
  return Keypair.fromSecretKey(raw);
}
export async function submit(
  env: Env,
  id: string,
  authority: Keypair,
  instructions: Parameters<Transaction["add"]>[0][],
) {
  const connection = rpcConnection(env, "confirmed");
  if (
    !env.GENESIS_HASH ||
    (await connection.getGenesisHash()) !== env.GENESIS_HASH
  )
    throw new Error("Unexpected cluster");
  let saved = await env.DB.prepare(
    "SELECT signature,raw,last_valid_height,status FROM transactions WHERE id=?",
  )
    .bind(id)
    .first<{
      signature: string;
      raw: string;
      last_valid_height: number;
      status: string;
    }>();
  if (!saved) {
    const block = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      feePayer: authority.publicKey,
      blockhash: block.blockhash,
      lastValidBlockHeight: block.lastValidBlockHeight,
    }).add(...instructions);
    tx.sign(authority);
    const raw = tx.serialize();
    const signature = await import("@coral-xyz/anchor").then((m) =>
      m.utils.bytes.bs58.encode(tx.signature!),
    );
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err)
      throw new Error(
        `Operational simulation rejected: ${JSON.stringify(simulation.value.err)}`,
      );
    await env.DB.prepare(
      "INSERT OR IGNORE INTO transactions(id,signature,raw,last_valid_height,status,created_at) VALUES(?,?,?,?,'signed',?)",
    )
      .bind(
        id,
        signature,
        Buffer.from(raw).toString("base64"),
        block.lastValidBlockHeight,
        Math.floor(Date.now() / 1000),
      )
      .run();
    saved = await env.DB.prepare(
      "SELECT signature,raw,last_valid_height,status FROM transactions WHERE id=?",
    )
      .bind(id)
      .first<typeof saved>();
  }
  if (!saved) throw new Error("Transaction attempt was not persisted");
  const status = (
    await connection.getSignatureStatuses([saved.signature], {
      searchTransactionHistory: true,
    })
  ).value[0];
  if (status?.err) throw new Error(`Transaction reverted: ${saved.signature}`);
  if (status?.confirmationStatus === "finalized") {
    await env.DB.prepare(
      "UPDATE transactions SET status='finalized' WHERE id=?",
    )
      .bind(id)
      .run();
    return saved.signature;
  }
  if (
    status?.confirmationStatus === "processed" ||
    status?.confirmationStatus === "confirmed"
  )
    throw new Error(`Awaiting finalized transaction ${saved.signature}`);
  if (
    (await connection.getBlockHeight("confirmed")) > saved.last_valid_height
  ) {
    throw new Error(
      `Transaction expired; reconcile on-chain operation before retry: ${id}`,
    );
  }
  await connection.sendRawTransaction(Buffer.from(saved.raw, "base64"), {
    skipPreflight: false,
    maxRetries: 2,
  });
  throw new Error(`Awaiting finalized transaction ${saved.signature}`);
}
export async function flushOwnership(
  env: Env,
  at: number,
  options: { accrueHolders?: boolean; reserveWrites?: (rows: number) => Promise<void> } = {},
) {
  if (options.accrueHolders !== false) {
    const rows = await env.DB.prepare(
      "SELECT mint,wallet,balance,lots,updated_at FROM ownership WHERE updated_at<? ORDER BY mint,wallet",
    )
      .bind(at)
      .all<{
        mint: string;
        wallet: string;
        balance: string;
        lots: string;
        updated_at: number;
      }>();
    for (const o of rows.results) {
      let start = o.updated_at;
      const statements: D1PreparedStatement[] = [];
      while (start < at) {
        const epoch = epochAt(start),
          end = Math.min(at, epochBounds(epoch).end);
        const old = await env.DB.prepare(
          "SELECT weight FROM holder_weights WHERE epoch=? AND mint=? AND wallet=?",
        )
          .bind(epoch, o.mint, o.wallet)
          .first<{ weight: string }>();
        statements.push(
          env.DB.prepare(
            "INSERT INTO holder_weights(epoch,mint,wallet,weight) VALUES(?,?,?,?) ON CONFLICT(epoch,mint,wallet) DO UPDATE SET weight=excluded.weight",
          ).bind(
            epoch,
            o.mint,
            o.wallet,
            (
              BigInt(old?.weight ?? "0") +
              BigInt(o.balance) * BigInt(end - start)
            ).toString(),
          ),
        );
        start = end;
      }
      statements.push(
        env.DB.prepare(
          "UPDATE ownership SET updated_at=? WHERE mint=? AND wallet=?",
        ).bind(at, o.mint, o.wallet),
      );
      await env.DB.batch(statements);
    }
  }
  const due = await env.DB.prepare(
    "SELECT h.mint,m.creator,m.launched_at FROM holding_checkpoints h JOIN markets m ON m.mint=h.mint WHERE h.completed=0 AND h.at<=?",
  )
    .bind(at)
    .all<{ mint: string; creator: string; launched_at: number }>();
  for (const m of due.results) {
    const positions = await env.DB.prepare(
      "SELECT wallet,lots FROM ownership WHERE mint=? AND wallet<>?",
    )
      .bind(m.mint, m.creator)
      .all<{ wallet: string; lots: string }>();
    const statements = positions.results.map((p) =>
      env.DB.prepare(
        "INSERT OR IGNORE INTO holding_rewards(epoch,mint,wallet,weight) VALUES(?,?,?,?)",
      ).bind(
        epochAt(m.launched_at + DAY),
        m.mint,
        p.wallet,
        holdingWeight(
          JSON.parse(p.lots).map((l: any) => ({
            ...l,
            tokens: BigInt(l.tokens),
            cost: BigInt(l.cost),
          })),
          m.launched_at,
        ).toString(),
      ),
    );
    statements.push(
      env.DB.prepare(
        "UPDATE holding_checkpoints SET completed=1 WHERE mint=?",
      ).bind(m.mint),
    );
    await options.reserveWrites?.(statements.length * 4);
    await env.DB.batch(statements);
  }
}
interface FrozenSnapshot {
  entries: {
    wallet: string;
    trading: string;
    holding: string;
    creator: string;
    volumeUsd: string;
  }[];
  poolSol: string;
  solUsdMicros: string;
  hash: string;
  objectKey: string;
  [key: string]: unknown;
}
export async function snapshot(
  env: Env,
  epoch: number,
): Promise<FrozenSnapshot> {
  const retained = await env.DB.prepare(
    "SELECT snapshot_hash,snapshot_key FROM epochs WHERE epoch=? AND snapshot_hash IS NOT NULL",
  )
    .bind(epoch)
    .first<{ snapshot_hash: string; snapshot_key: string }>();
  if (retained) {
    const object = await env.ARTIFACTS.get(retained.snapshot_key);
    if (!object) throw new Error("Retained snapshot missing");
    const canonical = await object.text();
    if (
      hex(await sha(new TextEncoder().encode(canonical))) !==
      retained.snapshot_hash
    )
      throw new Error("Retained snapshot integrity failure");
    return {
      ...JSON.parse(canonical),
      hash: retained.snapshot_hash,
      objectKey: retained.snapshot_key,
    };
  }
  const bounds = epochBounds(epoch),
    connection = rpcConnection(env);
  const complete = await env.DB.prepare(
    "SELECT value FROM checkpoints WHERE id='complete-time'",
  ).first<{ value: string }>();
  if (!complete || Number(complete.value) < bounds.end)
    throw new Error("Finalized ingestion has not reached the epoch boundary");
  const missing = await env.DB.prepare(
    "SELECT id,time,gross_sol FROM trades WHERE time>=? AND time<? AND usd_micros IS NULL",
  )
    .bind(bounds.start, bounds.end)
    .all<{ id: string; time: number; gross_sol: string }>();
  for (const t of missing.results) {
    const usd = (BigInt(t.gross_sol) * (await oracle(env, t.time))) / LAMPORTS;
    await env.DB.prepare(
      "UPDATE trades SET usd_micros=? WHERE id=? AND usd_micros IS NULL",
    )
      .bind(usd.toString(), t.id)
      .run();
  }
  const totals = new Map<
    string,
    { volume: bigint; holding: bigint; creator: bigint }
  >();
  const get = (wallet: string) => {
    let v = totals.get(wallet);
    if (!v) {
      v = { volume: 0n, holding: 0n, creator: 0n };
      totals.set(wallet, v);
    }
    return v;
  };
  const trades = await env.DB.prepare(
    "SELECT trader,usd_micros FROM trades WHERE excluded=0 AND time>=? AND time<?",
  )
    .bind(bounds.start, bounds.end)
    .all<{ trader: string; usd_micros: string }>();
  for (const t of trades.results) get(t.trader).volume += BigInt(t.usd_micros);
  const holding = await env.DB.prepare(
    "SELECT wallet,weight FROM holding_rewards WHERE epoch=?",
  )
    .bind(epoch)
    .all<{ wallet: string; weight: string }>();
  for (const h of holding.results) get(h.wallet).holding += BigInt(h.weight);
  const deposits = await env.DB.prepare(
    "SELECT owner,amount,start_at,unlock_at FROM fee_deposits WHERE start_at<? AND unlock_at>=?",
  )
    .bind(bounds.end, bounds.start)
    .all<{
      owner: string;
      amount: string;
      start_at: number;
      unlock_at: number;
    }>();
  for (const d of deposits.results)
    get(d.owner).creator += completedLockWeeks(
      BigInt(d.amount),
      d.start_at,
      d.unlock_at,
      bounds.start,
      bounds.end,
    );
  const locks = await env.DB.prepare(
    "SELECT data FROM commitments WHERE start_at<? AND unlock_at>=?",
  )
    .bind(bounds.end, bounds.start)
    .all<{ data: string }>();
  for (const row of locks.results) {
    const l = JSON.parse(row.data);
    if (l.asset === "token" && l.purchaseCost)
      get(l.owner).creator += completedLockWeeks(
        BigInt(l.purchaseCost),
        l.startAt,
        l.unlockAt,
        bounds.start,
        bounds.end,
      );
  }
  const entries = [...totals]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([wallet, v]) => ({
      wallet,
      ...categoryTickets(v.volume, v.holding, v.creator),
      volumeUsd: v.volume.toString(),
    }));
  const account = (await program(connection).account["fund"].fetchNullable(
    fundAddress(0, zeroKey, epoch),
  )) as { amount: BN } | null;
  const pool = BigInt(account?.amount.toString() ?? "0");
  const solUsd = await oracle(env, bounds.end);
  const observation = await env.DB.prepare(
    "SELECT * FROM oracle_prices WHERE at=?",
  )
    .bind(bounds.end)
    .first<{
      at: number;
      publish_time: number;
      usd_micros: string;
      r2_key: string;
    }>();
  const exclusions = await env.DB.prepare(
    "SELECT id,trader,mint FROM trades WHERE excluded=1 AND time>=? AND time<? ORDER BY id",
  )
    .bind(bounds.start, bounds.end)
    .all<{ id: string; trader: string; mint: string }>();
  const data = {
    version: 1,
    epoch,
    ...bounds,
    genesis: env.GENESIS_HASH,
    program: env.PROGRAM_ID,
    rules: {
      categoryCap: 1000,
      tradingUsd: 1000,
      holdingSol: 1,
      creatorSolWeek: 1,
    },
    poolSol: pool.toString(),
    solUsdMicros: solUsd.toString(),
    observation,
    entries,
    exclusions: exclusions.results,
  };
  const canonical = json(data),
    hash = hex(await sha(new TextEncoder().encode(canonical))),
    objectKey = `snapshots/${epoch}/${hash}.json`;
  await env.ARTIFACTS.put(objectKey, canonical, {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare(
    "INSERT INTO epochs(epoch,status,pool_sol,pool_usd,snapshot_hash,snapshot_key,data) VALUES(?,'snapshot',?,?,?,?,?) ON CONFLICT(epoch) DO UPDATE SET status=excluded.status,pool_sol=excluded.pool_sol,pool_usd=excluded.pool_usd,snapshot_hash=excluded.snapshot_hash,snapshot_key=excluded.snapshot_key,data=excluded.data",
  )
    .bind(
      epoch,
      pool.toString(),
      ((pool * solUsd) / LAMPORTS).toString(),
      hash,
      objectKey,
      canonical,
    )
    .run();
  for (const r of entries)
    await env.DB.prepare(
      "INSERT OR REPLACE INTO tickets(epoch,wallet,trading,holding,creator) VALUES(?,?,?,?,?)",
    )
      .bind(
        epoch,
        r.wallet,
        Number(r.trading),
        Number(r.holding),
        Number(r.creator),
      )
      .run();
  return { ...data, hash, objectKey };
}
export class Settlement extends WorkflowEntrypoint<Env, { epoch: number }> {
  async run(event: WorkflowEvent<{ epoch: number }>, step: WorkflowStep) {
    const epoch = event.payload.epoch;
    if (
      !Number.isSafeInteger(epoch) ||
      epoch < 0 ||
      epoch >= epochAt(Math.floor(Date.now() / 1000))
    )
      throw new Error("Only completed epochs may settle");
    const authority = signer(this.env.FINALIZER_SECRET),
      connection = rpcConnection(this.env);
    await step.do("close ownership at cutoff", async () => {
      const response = await this.env.COORDINATOR.get(
        this.env.COORDINATOR.idFromName("devnet"),
      ).fetch("https://coordinator/snapshot", {
        method: "POST",
        body: JSON.stringify({ at: epochBounds(epoch).end }),
      });
      if (!response.ok) throw new Error(await response.text());
      return true;
    });
    const retained = await step.do("freeze snapshot", async () => {
      const frozen = await snapshot(this.env, epoch);
      return { hash: frozen.hash, objectKey: frozen.objectKey };
    });
    const object = await this.env.ARTIFACTS.get(retained.objectKey);
    if (!object) throw new Error("Retained snapshot missing");
    const canonical = await object.text();
    if (hex(await sha(new TextEncoder().encode(canonical))) !== retained.hash)
      throw new Error("Retained snapshot integrity failure");
    const frozen = { ...JSON.parse(canonical), ...retained } as Awaited<
      ReturnType<typeof snapshot>
    >;
    const entries = frozen.entries
        .map((r) => ({
          wallet: r.wallet,
          tickets: BigInt(r.trading) + BigInt(r.holding) + BigInt(r.creator),
        }))
        .filter((r) => r.tickets > 0n),
      totalTickets = entries.reduce((s, r) => s + r.tickets, 0n),
      pool = BigInt(frozen.poolSol),
      usd = BigInt(frozen.solUsdMicros),
      count = drawCount(pool, usd, totalTickets);
    if (!count) {
      await step.do(
        "route undrawn pool",
        { retries: { limit: 30, delay: "10 seconds", backoff: "constant" } },
        async () => {
          if (!pool) return true;
          const small = (pool * usd) / LAMPORTS < 1_000_000_000n;
          const kind = small ? 2 : 0,
            destinationEpoch = small ? 0 : epoch + 1;
          const init = await makeInstruction(
            connection,
            "initFund",
            [kind, zeroKey, new BN(destinationEpoch)],
            {
              payer: authority.publicKey,
              fund: fundAddress(kind, zeroKey, destinationEpoch),
              systemProgram: SystemProgram.programId,
            },
          );
          const move = await makeInstruction(
            connection,
            "moveFund",
            [new BN(pool.toString())],
            {
              finalizer: authority.publicKey,
              config: configAddress(),
              source: fundAddress(0, zeroKey, epoch),
              destination: fundAddress(kind, zeroKey, destinationEpoch),
              ...eventAccounts(),
            },
          );
          return submit(this.env, `raffle:${epoch}:move`, authority, [
            init,
            move,
          ]);
        },
      );
      await step.do("record undrawn epoch", async () => {
        await this.env.DB.prepare("UPDATE epochs SET status=? WHERE epoch=?")
          .bind(
            (pool * usd) / LAMPORTS < 1_000_000_000n ? "incentives" : "carried",
            epoch,
          )
          .run();
        return true;
      });
    } else {
      const distribution = distributionAddress(0, zeroKey, epoch);
      await step.do(
        "commit before randomness",
        { retries: { limit: 30, delay: "10 seconds", backoff: "constant" } },
        async () => {
          const existing = (await program(connection).account[
            "distribution"
          ].fetchNullable(distribution)) as { snapshot: number[] } | null;
          if (existing) {
            if (hex(Uint8Array.from(existing.snapshot)) !== frozen.hash)
              throw new Error("Conflicting on-chain snapshot");
            return distribution.toBase58();
          }
          const ix = await makeInstruction(
            connection,
            "prepareDistribution",
            [
              new BN(epoch),
              0,
              zeroKey,
              new BN(pool.toString()),
              Array.from(unhex(frozen.hash)),
            ],
            {
              finalizer: authority.publicKey,
              config: configAddress(),
              source: fundAddress(0, zeroKey, epoch),
              distribution,
              systemProgram: SystemProgram.programId,
              ...eventAccounts(),
            },
          );
          return submit(this.env, `raffle:${epoch}:prepare`, authority, [ix]);
        },
      );
      const commitment = await step.do(
        "read finalized commitment",
        async () => {
          const d = (await program(connection).account["distribution"].fetch(
            distribution,
          )) as { beaconAfter: BN };
          return { beaconAfter: d.beaconAfter.toNumber() };
        },
      );
      const beaconAvailableAt = (commitment.beaconAfter + 4) * 1000;
      if (Date.now() < beaconAvailableAt)
        await step.sleepUntil(
          "wait for future randomness",
          new Date(beaconAvailableAt),
        );
      const beacon = await step.do("verify pinned drand", async () => {
        const client = quicknetClient(),
          info = await client.chain().info();
        if (info.hash !== this.env.DRAND_CHAIN_HASH)
          throw new Error("Wrong Drand chain");
        let round = roundAt(commitment.beaconAfter * 1000, info);
        if (roundTime(info, round) <= commitment.beaconAfter * 1000) round++;
        const b = await fetchBeacon(client, round);
        if (b.round !== round) throw new Error("Wrong Drand round");
        return {
          round,
          signature: b.signature,
          time: roundTime(info, round) / 1000,
          chainHash: info.hash,
        };
      });
      const results = await step.do("draw and publish proofs", async () => {
        const genesis = await sha(
          new TextEncoder().encode(this.env.GENESIS_HASH),
        );
        const seed = await sha(
          bytes(
            key(this.env.PROGRAM_ID).toBytes(),
            genesis,
            u64(BigInt(epoch)),
            unhex(frozen.hash),
            unhex(beacon.signature),
          ),
        );
        const winners = await drawTickets(entries, count, seed),
          rewards = allocatePrizes(winners, pool);
        const leaves = await Promise.all(
          rewards.map((r) =>
            claimLeaf(
              key(this.env.PROGRAM_ID).toBytes(),
              genesis,
              BigInt(epoch),
              0,
              zeroKey.toBytes(),
              key(r.wallet).toBytes(),
              r.amount,
            ),
          ),
        );
        const tree = await merkle(leaves);
        const artifact = {
          ...frozen,
          beacon,
          seed: hex(seed),
          winningTickets: count.toString(),
          winners,
          rewards: rewards.map((r, i) => ({ ...r, proof: tree.proofs[i] })),
          root: tree.root,
        };
        const objectKey = `distributions/raffle/${epoch}.json`;
        await this.env.ARTIFACTS.put(objectKey, json(artifact), {
          httpMetadata: { contentType: "application/json" },
        });
        await this.env.DB.prepare(
          "INSERT OR IGNORE INTO distributions(id,epoch,kind,mint,amount,status,root,snapshot_hash,snapshot_key,data) VALUES(?,?,'raffle',?,?,'drawn',?,?,?,?)",
        )
          .bind(
            distribution.toBase58(),
            epoch,
            zeroKey.toBase58(),
            pool.toString(),
            tree.root,
            frozen.hash,
            objectKey,
            json({ beacon, seed: hex(seed), winningTickets: count.toString() }),
          )
          .run();
        for (let i = 0; i < rewards.length; i++) {
          const r = rewards[i];
          await this.env.DB.prepare(
            "INSERT OR IGNORE INTO claims(id,distribution,epoch,mint,kind,wallet,amount,proof) VALUES(?,?,?,?,'raffle',?,?,?)",
          )
            .bind(
              `${distribution}:${r.wallet}`,
              distribution.toBase58(),
              epoch,
              zeroKey.toBase58(),
              r.wallet,
              r.amount.toString(),
              json(tree.proofs[i]),
            )
            .run();
        }
        return { root: tree.root };
      });
      await step.do(
        "finalize claim root",
        { retries: { limit: 30, delay: "10 seconds", backoff: "constant" } },
        async () => {
          const existing = (await program(connection).account[
            "distribution"
          ].fetch(distribution)) as { root: number[] };
          if (hex(Uint8Array.from(existing.root)) === results.root) return true;
          const ix = await makeInstruction(
            connection,
            "finalizeDistribution",
            [
              Array.from(unhex(results.root)),
              new BN(beacon.round),
              Buffer.from(unhex(beacon.signature)),
              new BN(beacon.time),
            ],
            {
              finalizer: authority.publicKey,
              config: configAddress(),
              distribution,
              ...eventAccounts(),
            },
          );
          return submit(this.env, `raffle:${epoch}:finalize`, authority, [ix]);
        },
      );
      await step.do("mark finalized", async () => {
        await this.env.DB.batch([
          this.env.DB.prepare(
            "UPDATE distributions SET status='finalized' WHERE id=?",
          ).bind(distribution.toBase58()),
          this.env.DB.prepare(
            "UPDATE epochs SET status='finalized',drand_round=?,beacon_after=? WHERE epoch=?",
          ).bind(beacon.round, commitment.beaconAfter, epoch),
          this.env.DB.prepare(
            "INSERT INTO outbox(type,data) VALUES('distribution',?)",
          ).bind(json({ distribution: distribution.toBase58(), epoch })),
        ]);
        return true;
      });
    }
    await step.do(
      "settle holder allocations",
      { retries: { limit: 60, delay: "10 seconds", backoff: "constant" } },
      async () => {
        await settleHolders(this.env, epoch);
        return true;
      },
    );
    return { epoch };
  }
}
