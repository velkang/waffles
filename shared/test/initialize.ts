import { readFile } from "node:fs/promises";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  program,
  programKey,
  configAddress,
  makeInstruction,
} from "../src/client.js";
import { sha, hex } from "../src/rewards.js";
const path = process.env.SOLANA_OPERATOR_WALLET;
if (!path)
  throw new Error(
    "Set SOLANA_OPERATOR_WALLET to the deployed program's upgrade-authority keypair path. Never put its contents in chat.",
  );
const startSlot = Number(process.env.SOLANA_START_SLOT);
if (!Number.isSafeInteger(startSlot) || startSlot <= 0)
  throw new Error(
    "Set SOLANA_START_SLOT to the verified program deployment slot, before any markets existed",
  );
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(path, "utf8"))),
);
if (!process.env.SOLANA_FINALIZER || !process.env.SOLANA_KEEPER)
  throw new Error(
    "Set SOLANA_FINALIZER and SOLANA_KEEPER to the operational public keys",
  );
const finalizer = new PublicKey(process.env.SOLANA_FINALIZER!),
  keeper = new PublicKey(process.env.SOLANA_KEEPER!);
const connection = new Connection(
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  "finalized",
);
const genesis = await connection.getGenesisHash();
const digest = await sha(new TextEncoder().encode(genesis));
let config =
  await program(connection).account.config.fetchNullable(configAddress());
if (!config) {
  const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const ix = await makeInstruction(
    connection,
    "initialize",
    [Array.from(digest), finalizer, keeper],
    {
      authority: authority.publicKey,
      config: configAddress(),
      program: programKey,
      programData: PublicKey.findProgramAddressSync(
        [programKey.toBytes()],
        loader,
      )[0],
      systemProgram: SystemProgram.programId,
    },
  );
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [authority],
    { commitment: "finalized" },
  );
  config = await program(connection).account.config.fetch(configAddress());
}
if (
  hex(Uint8Array.from(config.genesis)) !== hex(digest) ||
  !config.finalizer.equals(finalizer) ||
  !config.keeper.equals(keeper)
)
  throw new Error("Existing configuration differs; no changes made");
console.log(
  JSON.stringify(
    {
      PROGRAM_ID: programKey.toBase58(),
      GENESIS_HASH: genesis,
      UPGRADE_AUTHORITY: authority.publicKey.toBase58(),
      START_SLOT: startSlot,
    },
    null,
    2,
  ),
);
