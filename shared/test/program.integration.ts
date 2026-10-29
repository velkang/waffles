import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { BN } from "../src/client.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  buildTransaction,
  program,
  programKey,
  configAddress,
  marketAddress,
  marketCustody,
  inventoryAddress,
  fundAddress,
  zeroKey,
  makeInstruction,
  eventAccounts,
  distributionAddress,
} from "../src/client.js";
import {
  epochAt,
  epochBounds,
  SUPPLY,
  POOL_TOKENS,
  quoteBuy,
} from "../src/solana.js";
import { sha, claimLeaf, merkle, unhex, hex } from "../src/rewards.js";
const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(rpcUrl).hostname))
  throw new Error("Integration tests require a local validator");
const connection = new Connection(rpcUrl, "confirmed");
const path = process.env.SOLANA_TEST_WALLET;
if (!path)
  throw new Error(
    "Set SOLANA_TEST_WALLET to the local validator upgrade-authority keypair path",
  );
const owner = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
);
const outsider = Keypair.generate();
for (const wallet of [owner, outsider]) {
  const signature = await connection.requestAirdrop(
    wallet.publicKey,
    1000_000_000_000,
  );
  await connection.confirmTransaction(signature, "confirmed");
}
async function send(ixs: Parameters<Transaction["add"]>, signer = owner) {
  try {
    return await sendAndConfirmTransaction(
      connection,
      new Transaction().add(...ixs),
      [signer],
      { commitment: "confirmed" },
    );
  } catch (error) {
    throw error;
  }
}
async function action(
  input: Parameters<typeof buildTransaction>[2],
  signer = owner,
) {
  const built = await buildTransaction(connection, signer.publicKey, input);
  built.transaction.partialSign(signer);
  const signature = await connection.sendRawTransaction(
    built.transaction.serialize(),
  );
  await connection.confirmTransaction(
    {
      signature,
      blockhash: built.transaction.recentBlockhash!,
      lastValidBlockHeight: built.lastValidBlockHeight,
    },
    "confirmed",
  );
  return built;
}
const p = program(connection);
const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
if (!(await p.account.config.fetchNullable(configAddress()))) {
  const genesis = await sha(
    new TextEncoder().encode(await connection.getGenesisHash()),
  );
  await send([
    await makeInstruction(
      connection,
      "initialize",
      [Array.from(genesis), owner.publicKey, owner.publicKey],
      {
        authority: owner.publicKey,
        config: configAddress(),
        program: programKey,
        programData: PublicKey.findProgramAddressSync(
          [programKey.toBytes()],
          loader,
        )[0],
        systemProgram: SystemProgram.programId,
      },
    ),
  ]);
}
async function journey() {
  const created = await action({
    action: "create",
    name: "Validator token",
    symbol: "LOCAL",
    description: "",
    imageUri: "",
    routing: { direct: 2500, locked: 2500, holders: 2500, buyback: 2500 },
    feeCliff: Math.floor(Date.now() / 1000) + 3600,
    initialBuy: "1000000000",
    minOut: "1",
    lockedTokens: "1000000",
    tokenCliff: Math.floor(Date.now() / 1000) + 3600,
  });
  const mint = new PublicKey(created.mint!),
    market = marketAddress(mint);
  const mintState = await getMint(connection, mint);
  assert.equal(mintState.supply, SUPPLY);
  assert.equal(mintState.mintAuthority, null);
  assert.equal(mintState.freezeAuthority, null);
  let state = await p.account.market.fetch(market);
  assert.equal(state.realSol.toString(), "990000000");
  assert.equal(state.direct.toString(), "1000000");
  console.log(
    "PASS atomic creation, initial purchase, token commitment, fixed supply and revoked authorities",
  );
  const epoch = epochAt(Math.floor(Date.now() / 1000));
  // The initial-buy instruction is the one immediately following create; removing
  // create must reject the discount even when all original accounts are retained.
  const methodDiscriminator = p.idl.instructions.find(
    (i) => i.name === "initialBuy",
  )!.discriminator;
  const repeat = created.transaction.instructions.find(
    (ix) =>
      ix.programId.equals(programKey) &&
      ix.data.subarray(0, 8).equals(Buffer.from(methodDiscriminator)),
  )!;
  await assert.rejects(send([repeat]));
  await action(
    {
      action: "trade",
      mint: mint.toBase58(),
      buy: true,
      amount: "1000000000",
      minOut: "1",
    },
    outsider,
  );
  const held = await getAccount(
    connection,
    getAssociatedTokenAddressSync(mint, outsider.publicKey),
  );
  await action(
    {
      action: "trade",
      mint: mint.toBase58(),
      buy: false,
      amount: (held.amount / 2n).toString(),
      minOut: "1",
    },
    outsider,
  );
  await assert.rejects(
    action(
      {
        action: "trade",
        mint: mint.toBase58(),
        buy: true,
        amount: "1000000",
        minOut: SUPPLY.toString(),
      },
      outsider,
    ),
  );
  await assert.rejects(
    action(
      {
        action: "lock",
        mint: mint.toBase58(),
        amount: "1",
        unlock: Math.floor(Date.now() / 1000) + 1000,
        tokenAsset: true,
        nonce: "1",
      },
      outsider,
    ),
  );
  await action({
    action: "lock",
    mint: mint.toBase58(),
    amount: "1000000",
    unlock: Math.floor(Date.now() / 1000) + 4,
    tokenAsset: false,
    nonce: "2",
  });
  await assert.rejects(
    action({ action: "unlock", mint: mint.toBase58(), nonce: "2" }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await action({ action: "unlock", mint: mint.toBase58(), nonce: "2" });
  await assert.rejects(
    action({ action: "unlock", mint: mint.toBase58(), nonce: "2" }),
  );
  console.log(
    "PASS subsequent trading, slippage, creator-only locks, cliffs and repeat-withdrawal rejection",
  );
  await action(
    {
      action: "trade",
      mint: mint.toBase58(),
      buy: true,
      amount: "500000000000",
      minOut: "1",
    },
    outsider,
  );
  state = await p.account.market.fetch(market);
  assert.equal(state.state, 1);
  assert.equal(
    (await getAccount(connection, inventoryAddress(mint))).amount,
    POOL_TOKENS,
  );
  await assert.rejects(
    action(
      {
        action: "trade",
        mint: mint.toBase58(),
        buy: true,
        amount: "1000000",
        minOut: "1",
      },
      outsider,
    ),
  );
  await action({ action: "graduate", mint: mint.toBase58() }, outsider);
  await action({ action: "graduate", mint: mint.toBase58() }, outsider);
  state = await p.account.market.fetch(market);
  assert.equal(state.state, 2);
  assert.equal(state.virtualTokens.toString(), POOL_TOKENS.toString());
  await action(
    {
      action: "trade",
      mint: mint.toBase58(),
      buy: true,
      amount: "10000000",
      minOut: "1",
    },
    outsider,
  );
  state = await p.account.market.fetch(market);
  const info = await connection.getAccountInfo(market);
  const rent = await connection.getMinimumBalanceForRentExemption(
    info!.data.length,
  );
  assert.equal(
    BigInt(info!.lamports - rent),
    BigInt(state.realSol.toString()) +
      BigInt(state.direct.toString()) +
      BigInt(state.locked.toString()) +
      BigInt(state.buyback.toString()),
  );
  console.log(
    "PASS capped final purchase, retryable permissionless graduation, pool trading and market custody reconciliation",
  );
  console.log(
    JSON.stringify({
      mint: mint.toBase58(),
      program: programKey.toBase58(),
      genesis: await connection.getGenesisHash(),
    }),
  );

  const max = BigInt(state.realSol.toString()) / 1000n;
  const quote = quoteBuy(
    BigInt(state.virtualSol.toString()),
    BigInt(state.virtualTokens.toString()),
    max,
    100n,
    false,
  );
  const accounts = {
    keeper: owner.publicKey,
    mint,
    market,
    inventory: inventoryAddress(mint),
    config: configAddress(),
    raffle: fundAddress(0, zeroKey, epoch),
    holders: fundAddress(1, mint, epoch),
    incentives: fundAddress(2, zeroKey, 0),
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    ...eventAccounts(),
  };
  await assert.rejects(
    send([
      await makeInstruction(
        connection,
        "buyback",
        [new BN((max + 1n).toString()), new BN(1), new BN(1), false],
        accounts,
      ),
    ]),
  );
  const supplyBefore = (await getMint(connection, mint)).supply;
  const ix = await makeInstruction(
    connection,
    "buyback",
    [
      new BN(max.toString()),
      new BN(((quote.output * 99n) / 100n).toString()),
      new BN(quote.output.toString()),
      false,
    ],
    accounts,
  );
  const burnSignature = await send([ix]);
  await connection.confirmTransaction(burnSignature, "finalized");
  assert.equal(
    supplyBefore - (await getMint(connection, mint)).supply,
    quote.output,
  );
  await assert.rejects(send([ix]));
  const custody = await marketCustody(connection, mint);
  assert.equal(custody?.consistent, true);
  assert.equal(custody.actualSol, custody.accountedSol);
  assert.equal(custody.actualTokens, custody.accountedTokens);
  console.log(
    "PASS bounded buyback, atomic burn, hourly execution limit and reserve reconciliation",
  );
  await writeFile(
    new URL("../../solana/target/local-test.json", import.meta.url),
    JSON.stringify({ mint: mint.toBase58(), epoch }),
  );
}
async function claims() {
  const { mint: address, epoch } = JSON.parse(
    await readFile(
      new URL("../../solana/target/claim-test.json", import.meta.url),
      "utf8",
    ),
  );
  const mint = new PublicKey(address),
    source = fundAddress(1, mint, epoch),
    distribution = distributionAddress(1, mint, epoch);
  const amount = (await p.account.fund.fetch(source)).amount;
  const genesis = await sha(
    new TextEncoder().encode(await connection.getGenesisHash()),
  );
  const leaf = await claimLeaf(
    programKey.toBytes(),
    genesis,
    BigInt(epoch),
    1,
    mint.toBytes(),
    owner.publicKey.toBytes(),
    BigInt(amount.toString()),
  );
  const tree = await merkle([leaf]),
    snapshot = Array.from(
      await sha(new TextEncoder().encode("local-claims-fixture")),
    );
  const prepare = await makeInstruction(
    connection,
    "prepareDistribution",
    [new BN(epoch), 1, mint, amount, snapshot],
    {
      finalizer: owner.publicKey,
      config: configAddress(),
      source,
      distribution,
      systemProgram: SystemProgram.programId,
      ...eventAccounts(),
    },
  );
  await send([prepare]);
  assert.equal((await p.account.fund.fetch(source)).amount.toString(), "0");
  assert.equal(
    (await p.account.distribution.fetch(distribution)).amount.toString(),
    amount.toString(),
  );
  const finalize = await makeInstruction(
    connection,
    "finalizeDistribution",
    [Array.from(unhex(tree.root)), new BN(0), Buffer.alloc(0), new BN(0)],
    {
      finalizer: owner.publicKey,
      config: configAddress(),
      distribution,
      ...eventAccounts(),
    },
  );
  await send([finalize]);
  await assert.rejects(send([finalize]));
  await assert.rejects(
    action({
      action: "claim",
      distribution: distribution.toBase58(),
      amount: (BigInt(amount.toString()) + 1n).toString(),
      proof: [],
    }),
  );
  await action({
    action: "claim",
    distribution: distribution.toBase58(),
    amount: amount.toString(),
    proof: [],
  });
  await assert.rejects(
    action({
      action: "claim",
      distribution: distribution.toBase58(),
      amount: amount.toString(),
      proof: [],
    }),
  );
  assert.equal(
    (await p.account.distribution.fetch(distribution)).claimed.toString(),
    amount.toString(),
  );
  console.log(
    "PASS funded immutable distribution, valid proof payout, invalid proof and duplicate claim rejection",
  );
}
async function exportFund() {
  const { mint: address, epoch } = JSON.parse(
    await readFile(
      new URL("../../solana/target/local-test.json", import.meta.url),
      "utf8",
    ),
  );
  const mint = new PublicKey(address),
    original = await p.account.fund.fetch(fundAddress(1, mint, epoch));
  const closed = epoch - 1,
    target = fundAddress(1, mint, closed);
  const [, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("fund"),
      Buffer.from([1]),
      mint.toBuffer(),
      new BN(closed).toArrayLike(Buffer, "le", 8),
    ],
    programKey,
  );
  const data = await p.coder.accounts.encode("fund", {
    ...original,
    epoch: new BN(closed),
    bump,
  });
  const prior = await connection.getAccountInfo(fundAddress(1, mint, epoch));
  const dir = new URL("../../solana/target/claim-fixtures/", import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(
    new URL(`${target}.json`, dir),
    JSON.stringify({
      pubkey: target.toBase58(),
      account: {
        lamports: prior!.lamports,
        owner: programKey.toBase58(),
        data: [data.toString("base64"), "base64"],
        executable: false,
        rentEpoch: 0,
        space: data.length,
      },
    }),
  );
  await writeFile(
    new URL("../../solana/target/claim-test.json", import.meta.url),
    JSON.stringify({ mint: address, epoch: closed }),
  );
  console.log(
    "Exported earned holder funding as a closed-epoch genesis fixture for claim tests.",
  );
}
async function incentiveClaimFixture() {
  const epoch = epochAt(Math.floor(Date.now() / 1000)) - 2;
  const amount = 500_000_000n,
    distribution = distributionAddress(2, zeroKey, epoch);
  const genesis = await sha(
    new TextEncoder().encode(await connection.getGenesisHash()),
  );
  const leaf = await claimLeaf(
    programKey.toBytes(),
    genesis,
    BigInt(epoch),
    2,
    zeroKey.toBytes(),
    owner.publicKey.toBytes(),
    amount,
  );
  const tree = await merkle([leaf]);
  const data = {
    epoch,
    kind: 2,
    mint: zeroKey.toBase58(),
    rewards: [
      {
        wallet: owner.publicKey.toBase58(),
        amount: amount.toString(),
        proof: tree.proofs[0],
      },
    ],
    amount: amount.toString(),
    root: tree.root,
  };
  const canonical = JSON.stringify(data),
    hash = hex(await sha(new TextEncoder().encode(canonical)));
  await send([
    await makeInstruction(
      connection,
      "prepareDistribution",
      [
        new BN(epoch),
        2,
        zeroKey,
        new BN(amount.toString()),
        Array.from(unhex(hash)),
      ],
      {
        finalizer: owner.publicKey,
        config: configAddress(),
        source: fundAddress(2, zeroKey, 0),
        distribution,
        systemProgram: SystemProgram.programId,
        ...eventAccounts(),
      },
    ),
  ]);
  await send([
    await makeInstruction(
      connection,
      "finalizeDistribution",
      [Array.from(unhex(tree.root)), new BN(0), Buffer.alloc(0), new BN(0)],
      {
        finalizer: owner.publicKey,
        config: configAddress(),
        distribution,
        ...eventAccounts(),
      },
    ),
  ]);
  const objectKey = `distributions/2/${zeroKey}/${epoch}.json`;
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const statements = [
    `INSERT INTO distributions(id,epoch,kind,mint,amount,status,root,snapshot_hash,snapshot_key,data) VALUES(${quote(distribution.toBase58())},${epoch},'incentives',${quote(zeroKey.toBase58())},${quote(amount.toString())},'finalized',${quote(tree.root)},${quote(hash)},${quote(objectKey)},${quote(canonical)});`,
    `INSERT INTO claims(id,distribution,epoch,mint,kind,wallet,amount,proof) VALUES(${quote(`${distribution}:${owner.publicKey}`)},${quote(distribution.toBase58())},${epoch},${quote(zeroKey.toBase58())},'incentives',${quote(owner.publicKey.toBase58())},${quote(amount.toString())},'[]');`,
  ];
  await writeFile(
    new URL("../../solana/target/incentives-claim.sql", import.meta.url),
    statements.join("\n"),
  );
  await writeFile(
    new URL("../../solana/target/incentives-claim.json", import.meta.url),
    JSON.stringify({ ...data, hash }),
  );
  console.log(
    JSON.stringify({ epoch, objectKey, distribution: distribution.toBase58() }),
  );
}
async function holderFixture() {
  const { mint, epoch } = JSON.parse(
    await readFile(
      new URL("../../solana/target/claim-test.json", import.meta.url),
      "utf8",
    ),
  );
  const source = fundAddress(1, new PublicKey(mint), epoch);
  const raw = JSON.parse(
    await readFile(
      new URL(
        `../../solana/target/claim-fixtures/${source}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const fixtures = new URL(
    "../../solana/target/holder-fixtures/",
    import.meta.url,
  );
  await mkdir(fixtures, { recursive: true });
  await writeFile(new URL(`${source}.json`, fixtures), JSON.stringify(raw));
  const fund = p.coder.accounts.decode<{ amount: BN }>(
    "fund",
    Buffer.from(raw.account.data[0], "base64"),
  );
  const amount = BigInt(fund.amount.toString());
  let denominator = 3n;
  while (amount % denominator === 0n) denominator++;
  const other = Keypair.fromSeed(
    new Uint8Array(32).fill(6),
  ).publicKey.toBase58();
  const data = {
    mint,
    market: marketAddress(new PublicKey(mint)).toBase58(),
    creator: owner.publicKey.toBase58(),
    name: "LOCAL HOLDER FIXTURE",
    symbol: "HOLDER",
    description: "Synthetic local balance-time inputs",
    imageUri: "",
    launchedAt: epochBounds(epoch).start,
    state: "curve",
    solReserve: "30000000000",
    tokenReserve: "1073000000000000",
    supply: "1000000000000000",
    volumeSol: "0",
    routing: { direct: 10000, locked: 0, holders: 0, buyback: 0 },
    feeCliff: 0,
    upgradeAuthority: null,
  };
  const quote = (v: string) => `'${v.replaceAll("'", "''")}'`;
  const at = epochBounds(epoch).end,
    weight = 100000000000000000000n;
  const statements = [
    `INSERT INTO markets(mint,creator,state,launched_at,data) VALUES(${quote(mint)},${quote(data.creator)},'curve',${data.launchedAt},${quote(JSON.stringify(data))});`,
    `INSERT INTO checkpoints(id,value) VALUES('complete-time',${quote(String(at))});`,
    `INSERT INTO oracle_prices(at,publish_time,usd_micros,r2_key) VALUES(${at},${at},'200000000','LOCAL-SYNTHETIC-TEST-OBSERVATION');`,
    `INSERT INTO holder_weights(epoch,mint,wallet,weight) VALUES(${epoch},${quote(mint)},${quote(data.creator)},${quote(weight.toString())}),(${epoch},${quote(mint)},${quote(other)},${quote((weight * (denominator - 1n)).toString())});`,
  ];
  await writeFile(
    new URL("../../solana/target/holder-fixtures.sql", import.meta.url),
    statements.join("\n"),
  );
  console.log(
    JSON.stringify({
      epoch,
      mint,
      amount: amount.toString(),
      dust: "1",
      owner: owner.publicKey.toBase58(),
    }),
  );
}
if (process.env.SOLANA_TEST_HOLDER_FIXTURE) await holderFixture();
else if (process.env.SOLANA_TEST_INCENTIVE_FIXTURE)
  await incentiveClaimFixture();
else if (process.env.SOLANA_TEST_CLAIMS) await claims();
else if (process.env.SOLANA_TEST_EXPORT_FUND) await exportFund();
else {
  await journey();
  await exportFund();
}
