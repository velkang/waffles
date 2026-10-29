import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Connection } from "@solana/web3.js";
import { fetchBeacon, quicknetClient, roundAt, roundTime } from "drand-client";
import {
  program,
  programKey,
  key,
  zeroKey,
  distributionAddress,
  configAddress,
} from "@waffles/shared/client";
import { json } from "@waffles/shared/solana";
import {
  sha,
  hex,
  unhex,
  bytes,
  u64,
  drawCount,
  drawTickets,
  allocatePrizes,
  allocateHolders,
  claimLeaf,
  merkle,
} from "@waffles/shared/rewards";
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: pnpm verify:distribution /path/to/published-raffle.json",
  );
const artifact = JSON.parse(await readFile(path, "utf8"));
if (artifact.kind === 1 || artifact.kind === 2) {
  const { hash, ...data } = artifact;
  assert.equal(
    hex(await sha(new TextEncoder().encode(json(data)))),
    hash,
    "Snapshot hash mismatch",
  );
  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    "finalized",
  );
  const genesis = await sha(
    new TextEncoder().encode(await connection.getGenesisHash()),
  );
  const config =
    await program(connection).account.config.fetch(configAddress());
  assert.equal(
    hex(Uint8Array.from(config.genesis)),
    hex(genesis),
    "Wrong cluster configuration",
  );
  const mint = key(artifact.mint),
    allocation = await program(connection).account.distribution.fetch(
      distributionAddress(artifact.kind, mint, artifact.epoch),
    );
  assert.equal(
    hex(Uint8Array.from(allocation.snapshot)),
    hash,
    "On-chain commitment mismatch",
  );
  assert.equal(
    allocation.amount.toString(),
    artifact.amount,
    "Funding mismatch",
  );
  if (artifact.kind === 1) {
    assert(artifact.holderSnapshot, "Holder calculation snapshot missing");
    const expected = allocateHolders(
      artifact.holderSnapshot.weights.map(
        (w: { wallet: string; weight: string }) => ({
          wallet: w.wallet,
          weight: BigInt(w.weight),
        }),
      ),
      BigInt(artifact.holderSnapshot.poolSol),
    );
    assert.deepEqual(
      JSON.parse(json(expected.rewards)),
      artifact.rewards.map(
        ({ wallet, amount }: { wallet: string; amount: string }) => ({
          wallet,
          amount,
        }),
      ),
      "Holder weight allocation mismatch",
    );
  }
  const leaves = await Promise.all(
    artifact.rewards.map((r: { wallet: string; amount: string }) =>
      claimLeaf(
        programKey.toBytes(),
        genesis,
        BigInt(artifact.epoch),
        artifact.kind,
        mint.toBytes(),
        key(r.wallet).toBytes(),
        BigInt(r.amount),
      ),
    ),
  );
  const tree = await merkle(leaves);
  assert.equal(tree.root, artifact.root);
  assert.equal(
    hex(Uint8Array.from(allocation.root)),
    tree.root,
    "On-chain root mismatch",
  );
  assert.deepEqual(
    artifact.rewards.map((r: { proof: string[] }) => r.proof),
    tree.proofs,
  );
  assert.equal(
    artifact.rewards
      .reduce(
        (sum: bigint, r: { amount: string }) => sum + BigInt(r.amount),
        0n,
      )
      .toString(),
    artifact.amount,
  );
  console.log(
    `Verified ${artifact.rewards.length} funded ${artifact.kind === 1 ? "holder" : "incentives"} claims, all proofs and the on-chain allocation.`,
  );
  process.exit(0);
}
const {
  hash,
  objectKey,
  beacon,
  seed,
  winningTickets,
  winners,
  rewards,
  root,
  ...snapshot
} = artifact;
assert.equal(
  hex(await sha(new TextEncoder().encode(json(snapshot)))),
  hash,
  "Snapshot hash mismatch",
);
assert.equal(snapshot.program, programKey.toBase58(), "Unexpected program");
const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  "finalized",
);
assert.equal(
  await connection.getGenesisHash(),
  snapshot.genesis,
  "Wrong cluster",
);
const allocation = await program(connection).account.distribution.fetch(
  distributionAddress(0, zeroKey, snapshot.epoch),
);
assert.equal(
  hex(Uint8Array.from(allocation.snapshot)),
  hash,
  "On-chain commitment mismatch",
);
assert.equal(
  allocation.amount.toString(),
  snapshot.poolSol,
  "Funding mismatch",
);
const client = quicknetClient(),
  info = await client.chain().info();
assert.equal(
  info.hash,
  "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  "Wrong randomness chain",
);
assert.equal(beacon.chainHash, info.hash);
let expected = roundAt(allocation.beaconAfter.toNumber() * 1000, info);
if (roundTime(info, expected) <= allocation.beaconAfter.toNumber() * 1000)
  expected++;
assert.equal(
  beacon.round,
  expected,
  "Randomness was not the first future round",
);
const verified = await fetchBeacon(client, expected);
assert.equal(
  verified.signature,
  beacon.signature,
  "Invalid randomness signature",
);
const genesis = await sha(new TextEncoder().encode(snapshot.genesis));
const config = await program(connection).account.config.fetch(configAddress());
assert.equal(
  hex(Uint8Array.from(config.genesis)),
  hex(genesis),
  "Wrong cluster configuration",
);
assert.equal(
  allocation.drandRound.toString(),
  String(beacon.round),
  "On-chain randomness round mismatch",
);
assert.equal(
  hex(Uint8Array.from(allocation.signatureHash)),
  hex(await sha(unhex(beacon.signature))),
  "On-chain randomness signature mismatch",
);
const derived = await sha(
  bytes(
    programKey.toBytes(),
    genesis,
    u64(BigInt(snapshot.epoch)),
    unhex(hash),
    unhex(beacon.signature),
  ),
);
assert.equal(hex(derived), seed);
const entries = snapshot.entries
  .map(
    (r: {
      wallet: string;
      trading: string;
      holding: string;
      creator: string;
    }) => {
      for (const n of [r.trading, r.holding, r.creator])
        assert(BigInt(n) >= 0n && BigInt(n) <= 1000n, "Category cap violated");
      return {
        wallet: r.wallet,
        tickets: BigInt(r.trading) + BigInt(r.holding) + BigInt(r.creator),
      };
    },
  )
  .filter((r: { tickets: bigint }) => r.tickets > 0n);
const pool = BigInt(snapshot.poolSol),
  count = drawCount(
    pool,
    BigInt(snapshot.solUsdMicros),
    entries.reduce((s: bigint, r: { tickets: bigint }) => s + r.tickets, 0n),
  );
assert.equal(count.toString(), winningTickets);
const drawn = await drawTickets(entries, count, derived);
assert.deepEqual(drawn, winners, "Winning ticket mismatch");
const paid = allocatePrizes(drawn, pool);
const leaves = await Promise.all(
  paid.map((r) =>
    claimLeaf(
      programKey.toBytes(),
      genesis,
      BigInt(snapshot.epoch),
      0,
      zeroKey.toBytes(),
      key(r.wallet).toBytes(),
      r.amount,
    ),
  ),
);
const tree = await merkle(leaves);
assert.equal(tree.root, root);
assert.equal(
  hex(Uint8Array.from(allocation.root)),
  root,
  "On-chain root mismatch",
);
assert.deepEqual(
  JSON.parse(json(paid.map((r, i) => ({ ...r, proof: tree.proofs[i] })))),
  rewards,
);
console.log(
  `Verified ${winningTickets} distinct winning tickets, ${paid.length} wallet claims and complete allocation of ${pool} lamports.`,
);
console.log(
  "This verifies the published draw and funding. Eligibility remains the operator's responsibility; inspect the archived accounting inputs separately.",
);
