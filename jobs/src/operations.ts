import { rpcConnection } from "./rpc";
import { BN } from "@waffles/shared/client";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  program,
  key,
  zeroKey,
  fundAddress,
  distributionAddress,
  marketAddress,
  marketCustody,
  inventoryAddress,
  configAddress,
  makeInstruction,
  initFunds,
  eventAccounts,
} from "@waffles/shared/client";
import { epochAt, epochBounds, quoteBuy, json } from "@waffles/shared/solana";
import {
  allocateHolders,
  claimLeaf,
  merkle,
  sha,
  hex,
  unhex,
} from "@waffles/shared/rewards";
import { signer, submit } from "./settlement";
import type { Env } from "./env";
async function distribute(
  env: Env,
  epoch: number,
  kind: 1 | 2,
  mint: PublicKey,
  rewards: { wallet: string; amount: bigint }[],
  holderSnapshot?: {
    poolSol: string;
    cutoff: number;
    weights: { wallet: string; weight: string }[];
  },
) {
  const authority = signer(env.FINALIZER_SECRET),
    connection = rpcConnection(env),
    distribution = distributionAddress(kind, mint, epoch);
  const existing = await env.DB.prepare(
    "SELECT status,data FROM distributions WHERE id=?",
  )
    .bind(distribution.toBase58())
    .first<{ status: string; data: string }>();
  if (existing?.status === "finalized") return;
  let artifact: {
    epoch: number;
    kind: number;
    mint: string;
    rewards: { wallet: string; amount: string; proof: string[] }[];
    amount: string;
    root: string;
    hash: string;
    holderSnapshot?: {
      poolSol: string;
      cutoff: number;
      weights: { wallet: string; weight: string }[];
    };
  };
  if (existing) artifact = JSON.parse(existing.data);
  else {
    const seen = new Set<string>();
    for (const r of rewards) {
      new PublicKey(r.wallet);
      if (seen.has(r.wallet) || r.amount <= 0n)
        throw new Error("Invalid distribution recipients");
      seen.add(r.wallet);
    }
    rewards.sort((a, b) =>
      a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0,
    );
    if (!rewards.length) return;
    const genesis = await sha(new TextEncoder().encode(env.GENESIS_HASH));
    const leaves = await Promise.all(
        rewards.map((r) =>
          claimLeaf(
            key(env.PROGRAM_ID).toBytes(),
            genesis,
            BigInt(epoch),
            kind,
            mint.toBytes(),
            key(r.wallet).toBytes(),
            r.amount,
          ),
        ),
      ),
      tree = await merkle(leaves);
    const data = {
      epoch,
      kind,
      mint: mint.toBase58(),
      rewards: rewards.map((r, i) => ({
        wallet: r.wallet,
        amount: r.amount.toString(),
        proof: tree.proofs[i],
      })),
      amount: rewards.reduce((s, r) => s + r.amount, 0n).toString(),
      root: tree.root,
      ...(holderSnapshot ? { holderSnapshot } : {}),
    };
    const hash = hex(await sha(new TextEncoder().encode(json(data))));
    artifact = { ...data, hash };
    const objectKey = `distributions/${kind}/${mint}/${epoch}.json`;
    await env.ARTIFACTS.put(objectKey, json(artifact), {
      httpMetadata: { contentType: "application/json" },
    });
    await env.DB.prepare(
      "INSERT OR IGNORE INTO distributions(id,epoch,kind,mint,amount,status,root,snapshot_hash,snapshot_key,data) VALUES(?,?,?,?,?,'prepared',?,?,?,?)",
    )
      .bind(
        distribution.toBase58(),
        epoch,
        kind === 1 ? "holders" : "incentives",
        mint.toBase58(),
        data.amount,
        data.root,
        hash,
        objectKey,
        json(artifact),
      )
      .run();
  }
  const source = fundAddress(kind, mint, kind === 2 ? 0 : epoch);
  const chain = (await program(connection).account[
    "distribution"
  ].fetchNullable(distribution)) as {
    root: number[];
    snapshot: number[];
  } | null;
  if (!chain) {
    const ix = await makeInstruction(
      connection,
      "prepareDistribution",
      [
        new BN(epoch),
        kind,
        mint,
        new BN(artifact.amount),
        Array.from(unhex(artifact.hash)),
      ],
      {
        finalizer: authority.publicKey,
        config: configAddress(),
        source,
        distribution,
        systemProgram: SystemProgram.programId,
        ...eventAccounts(),
      },
    );
    await submit(env, `distribution:${distribution}:prepare`, authority, [ix]);
  }
  if (chain && hex(Uint8Array.from(chain.snapshot)) !== artifact.hash)
    throw new Error("Distribution commitment conflicts with retained snapshot");
  if (!chain || hex(Uint8Array.from(chain.root)) !== artifact.root) {
    const ix = await makeInstruction(
      connection,
      "finalizeDistribution",
      [Array.from(unhex(artifact.root)), new BN(0), Buffer.alloc(0), new BN(0)],
      {
        finalizer: authority.publicKey,
        config: configAddress(),
        distribution,
        ...eventAccounts(),
      },
    );
    await submit(env, `distribution:${distribution}:finalize`, authority, [ix]);
  }
  const statements = artifact.rewards.map((r) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO claims(id,distribution,epoch,mint,kind,wallet,amount,proof) VALUES(?,?,?,?,?,?,?,?)",
    ).bind(
      `${distribution}:${r.wallet}`,
      distribution.toBase58(),
      epoch,
      mint.toBase58(),
      kind === 1 ? "holders" : "incentives",
      r.wallet,
      r.amount,
      json(r.proof),
    ),
  );
  statements.push(
    env.DB.prepare(
      "UPDATE distributions SET status='finalized' WHERE id=?",
    ).bind(distribution.toBase58()),
  );
  statements.push(
    env.DB.prepare(
      "INSERT INTO outbox(type,data) VALUES('distribution',?)",
    ).bind(json({ distribution: distribution.toBase58(), epoch, kind })),
  );
  await env.DB.batch(statements);
}
export async function settleHolders(env: Env, epoch: number) {
  if (
    !Number.isSafeInteger(epoch) ||
    epoch >= epochAt(Math.floor(Date.now() / 1000))
  )
    throw new Error("Completed epoch required");
  const cutoff = epochBounds(epoch).end;
  const complete = await env.DB.prepare(
    "SELECT value FROM checkpoints WHERE id='complete-time'",
  ).first<{ value: string }>();
  if (!complete || Number(complete.value) < cutoff)
    throw new Error(
      "Finalized ingestion has not reached the holder epoch boundary",
    );
  const closed = await env.COORDINATOR.get(
    env.COORDINATOR.idFromName("devnet"),
  ).fetch("https://coordinator/snapshot", {
    method: "POST",
    body: JSON.stringify({ at: cutoff }),
  });
  if (!closed.ok) throw new Error("Holder ownership measurement is incomplete");
  const connection = rpcConnection(env),
    authority = signer(env.FINALIZER_SECRET);
  const markets = await env.DB.prepare(
    "SELECT mint FROM markets ORDER BY mint",
  ).all<{ mint: string }>();
  for (const row of markets.results) {
    const mint = key(row.mint),
      source = fundAddress(1, mint, epoch);
    let fund = (await program(connection).account["fund"].fetchNullable(
      source,
    )) as { amount: BN } | null;
    const previous = await env.DB.prepare(
      "SELECT id FROM distributions WHERE id=?",
    )
      .bind(distributionAddress(1, mint, epoch).toBase58())
      .first();
    if ((!fund || fund.amount.isZero()) && !previous) continue;
    const weights = await env.DB.prepare(
      "SELECT wallet,weight FROM holder_weights WHERE epoch=? AND mint=? ORDER BY wallet",
    )
      .bind(epoch, row.mint)
      .all<{ wallet: string; weight: string }>();
    const allocation = allocateHolders(
      weights.results.map((w) => ({
        wallet: w.wallet,
        weight: BigInt(w.weight),
      })),
      BigInt(fund?.amount.toString() ?? "0"),
    );
    const existing = await env.DB.prepare(
      "SELECT id FROM distributions WHERE id=?",
    )
      .bind(distributionAddress(1, mint, epoch).toBase58())
      .first();
    if (existing || allocation.rewards.length)
      await distribute(env, epoch, 1, mint, allocation.rewards, {
        poolSol: fund?.amount.toString() ?? "0",
        cutoff,
        weights: weights.results,
      });
    fund = (await program(connection).account["fund"].fetch(source)) as {
      amount: BN;
    };
    if (!fund.amount.isZero()) {
      const destination = fundAddress(1, mint, epoch + 1);
      const init = await makeInstruction(
        connection,
        "initFund",
        [1, mint, new BN(epoch + 1)],
        {
          payer: authority.publicKey,
          fund: destination,
          systemProgram: SystemProgram.programId,
        },
      );
      const ix = await makeInstruction(connection, "moveFund", [fund.amount], {
        finalizer: authority.publicKey,
        config: configAddress(),
        source,
        destination,
        ...eventAccounts(),
      });
      await submit(env, `holders:${mint}:${epoch}:carry`, authority, [
        init,
        ix,
      ]);
    }
  }
}
export async function protocolDistribution(
  env: Env,
  epoch: number,
  rewards: { wallet: string; amount: string }[],
) {
  await distribute(
    env,
    epoch,
    2,
    zeroKey,
    rewards.map((r) => ({ wallet: r.wallet, amount: BigInt(r.amount) })),
  );
}
export async function keepMarkets(
  env: Env,
  incentives?: { mint: string; amount: bigint },
) {
  if (incentives && incentives.amount <= 0n)
    throw new Error("Positive incentives allocation required");
  if (incentives) key(incentives.mint);
  const authority = signer(env.KEEPER_SECRET),
    connection = rpcConnection(env),
    epoch = epochAt(Math.floor(Date.now() / 1000));
  const query = incentives
    ? env.DB.prepare(
        "SELECT mint FROM markets WHERE mint=? AND state='pool'",
      ).bind(incentives.mint)
    : env.DB.prepare(
        "SELECT mint FROM markets WHERE state IN ('complete','pool') LIMIT 20",
      );
  const rows = await query.all<{ mint: string }>();
  if (incentives && !rows.results.length)
    throw new Error("Graduated target market required");
  for (const row of rows.results) {
    const mint = key(row.mint),
      market = marketAddress(mint),
      inventory = inventoryAddress(mint);
    try {
      const state = (await program(connection).account["market"].fetch(
        market,
      )) as {
        state: number;
        virtualSol: BN;
        virtualTokens: BN;
        realSol: BN;
        buyback: BN;
        lastBuyback: BN;
      };
      if (state.state === 1) {
        await submit(env, `graduate:${mint}`, authority, [
          await makeInstruction(connection, "graduate", [], {
            market,
            inventory,
            ...eventAccounts(),
          }),
        ]);
        continue;
      }
      if (
        state.state !== 2 ||
        Math.floor(Date.now() / 1000) < state.lastBuyback.toNumber() + 3600
      )
        continue;
      const incentiveFund = incentives
        ? await program(connection).account.fund.fetch(
            fundAddress(2, zeroKey, 0),
          )
        : null;
      const available = BigInt(
        incentiveFund?.amount.toString() ?? state.buyback.toString(),
      );
      const balance =
          incentives && incentives.amount < available
            ? incentives.amount
            : available,
        maximum = BigInt(state.realSol.toString()) / 1000n,
        amount = balance < maximum ? balance : maximum;
      if (!amount) continue;
      const history = await env.DB.prepare(
        "SELECT time,data FROM trades WHERE mint=? AND time>=? ORDER BY time",
      )
        .bind(row.mint, Math.floor(Date.now() / 1000) - 600)
        .all<{ time: number; data: string }>();
      if (
        history.results.length < 2 ||
        history.results.at(-1)!.time - history.results[0].time < 60
      )
        continue;
      const current =
        (BigInt(state.virtualSol.toString()) * 1_000_000_000_000_000n) /
        BigInt(state.virtualTokens.toString());
      let weighted = 0n,
        duration = 0;
      for (let i = 0; i < history.results.length - 1; i++) {
        const seconds = history.results[i + 1].time - history.results[i].time;
        if (seconds > 0) {
          weighted +=
            BigInt(JSON.parse(history.results[i].data).price) * BigInt(seconds);
          duration += seconds;
        }
      }
      if (!duration) continue;
      const average = weighted / BigInt(duration);
      if (
        !average ||
        (current > average ? current - average : average - current) * 100n >
          average
      )
        continue;
      const quote = quoteBuy(
        BigInt(state.virtualSol.toString()),
        BigInt(state.virtualTokens.toString()),
        amount,
        100n,
        false,
      );
      const ix = await makeInstruction(
        connection,
        "buyback",
        [
          new BN(amount.toString()),
          new BN(((quote.output * 9900n) / 10000n).toString()),
          new BN(quote.output.toString()),
          Boolean(incentives),
        ],
        {
          keeper: authority.publicKey,
          mint,
          market,
          inventory,
          config: configAddress(),
          raffle: fundAddress(0, zeroKey, epoch),
          holders: fundAddress(1, mint, epoch),
          incentives: fundAddress(2, zeroKey, 0),
          tokenProgram: TOKEN_PROGRAM_ID,
          ...eventAccounts(),
        },
      );
      await submit(
        env,
        `buyback:${incentives ? "incentives:" : ""}${mint}:${state.lastBuyback}`,
        authority,
        [
          ...(await initFunds(connection, authority.publicKey, mint, epoch)),
          ix,
        ],
      );
    } catch (error) {
      console.warn(`keeper:${mint}`, String(error));
    }
  }
}

/** Bound each scheduled reconciliation and rotate through all indexed markets. */
export async function reconcileMarkets(env: Env) {
  const connection = rpcConnection(env);
  if (
    !env.GENESIS_HASH ||
    (await connection.getGenesisHash()) !== env.GENESIS_HASH
  )
    throw new Error("Unexpected custody RPC cluster");
  const cursor = await env.DB.prepare(
    "SELECT value FROM checkpoints WHERE id='custody-cursor'",
  ).first<{ value: string }>();
  const rows = await env.DB.prepare(
    "SELECT mint FROM markets WHERE mint>? ORDER BY mint LIMIT 20",
  )
    .bind(cursor?.value ?? "")
    .all<{ mint: string }>();
  let deficits = 0,
    unavailable = 0;
  for (const { mint } of rows.results) {
    try {
      const custody = await marketCustody(connection, key(mint));
      if (!custody || !custody.consistent) {
        deficits++;
        console.error(
          json({
            event: "custody_discrepancy",
            mint,
            ...custody,
            state: undefined,
          }),
        );
      }
    } catch (error) {
      unavailable++;
      console.error(
        json({ event: "custody_unavailable", mint, error: String(error) }),
      );
    }
  }
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO checkpoints(id,value) VALUES('custody-cursor',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).bind(rows.results.length === 20 ? rows.results.at(-1)!.mint : ""),
    env.DB.prepare(
      "INSERT INTO checkpoints(id,value) VALUES('custody-last',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).bind(
      json({
        at: Math.floor(Date.now() / 1000),
        checked: rows.results.length,
        deficits,
        unavailable,
      }),
    ),
  ]);
}
