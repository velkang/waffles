/** Disposable local fixture setup. Never run against a deployed environment. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import {
  BN,
  program,
  programKey,
  zeroKey,
  fundAddress,
} from "../src/client.js";
import {
  epochAt,
  epochBounds,
  INITIAL_SOL,
  INITIAL_TOKENS,
  SUPPLY,
  json,
} from "../src/solana.js";
const path = process.env.SOLANA_TEST_WALLET;
if (!path)
  throw new Error(
    "Set SOLANA_TEST_WALLET to the disposable local upgrade wallet",
  );
const owner = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
);
const now = epochAt(Math.floor(Date.now() / 1000));
const cases = [
  { name: "draw", epoch: now - 1, pool: 200_000_000_000n, volume: true },
  { name: "small", epoch: now - 3, pool: 1_000_000_000n, volume: true },
  { name: "carry", epoch: now - 5, pool: 200_000_000_000n, volume: false },
];
const dir = new URL(
  "../../solana/target/settlement-fixtures/",
  import.meta.url,
);
await mkdir(dir, { recursive: true });
const p = program(new Connection("http://127.0.0.1:8909"));
const sql = (s: string) => `'${s.replaceAll("'", "''")}'`;
const mint = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey.toBase58();
const creator = Keypair.fromSeed(
  new Uint8Array(32).fill(8),
).publicKey.toBase58();
const market = {
  mint,
  market: mint,
  creator,
  name: "LOCAL SETTLEMENT FIXTURE",
  symbol: "FIXTURE",
  description: "Synthetic local accounting inputs; never deploy",
  imageUri: "",
  launchedAt: epochBounds(now - 6).start,
  state: "curve",
  solReserve: INITIAL_SOL.toString(),
  tokenReserve: INITIAL_TOKENS.toString(),
  supply: SUPPLY.toString(),
  volumeSol: "0",
  routing: { direct: 10000, locked: 0, holders: 0, buyback: 0 },
  feeCliff: 0,
  upgradeAuthority: null,
};
const statements = [
  `INSERT INTO markets(mint,creator,state,launched_at,data) VALUES(${sql(mint)},${sql(creator)},'curve',${market.launchedAt},${sql(json(market))});`,
  `INSERT INTO checkpoints(id,value) VALUES('complete-time',${sql(String(epochBounds(now).start))});`,
];
for (const c of cases) {
  const address = fundAddress(0, zeroKey, c.epoch);
  const [, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("fund"),
      Buffer.from([0]),
      zeroKey.toBuffer(),
      new BN(c.epoch).toArrayLike(Buffer, "le", 8),
    ],
    programKey,
  );
  const data = await p.coder.accounts.encode("fund", {
    kind: 0,
    mint: zeroKey,
    epoch: new BN(c.epoch),
    amount: new BN(c.pool.toString()),
    bump,
  });
  await writeFile(
    new URL(`${address}.json`, dir),
    JSON.stringify({
      pubkey: address.toBase58(),
      account: {
        lamports: Number(c.pool) + 2_000_000,
        owner: programKey.toBase58(),
        data: [data.toString("base64"), "base64"],
        executable: false,
        rentEpoch: 0,
        space: data.length,
      },
    }),
  );
  const at = epochBounds(c.epoch).end;
  statements.push(
    `INSERT INTO oracle_prices(at,publish_time,usd_micros,r2_key) VALUES(${at},${at},'200000000','LOCAL-SYNTHETIC-TEST-OBSERVATION');`,
  );
  if (c.volume)
    statements.push(
      `INSERT INTO trades(id,mint,trader,slot,time,signature,gross_sol,usd_micros,excluded,data) VALUES(${sql(c.name)},${sql(mint)},${sql(owner.publicKey.toBase58())},1,${at - 1},'LOCAL-TEST','1000000000','100000000000',0,'{}');`,
    );
}
await writeFile(
  new URL("../../solana/target/settlement-fixtures.sql", import.meta.url),
  statements.join("\n"),
);
await writeFile(
  new URL("../../solana/target/settlement-cases.json", import.meta.url),
  json(cases),
);
console.log(
  JSON.stringify({
    cases: cases.map((c) => ({ name: c.name, epoch: c.epoch })),
    authority: owner.publicKey.toBase58(),
  }),
);
