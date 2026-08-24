import { config } from "./config.js";
import { closeDb, getDb } from "./db.js";
import { createClient, syncRange } from "./ingest.js";

function argument(name: string): number | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
}

async function main() {
  const db = await getDb();
  const client = createClient();
  const head = Number(await client.getBlockNumber());
  const fromBlock = argument("from") ?? config.startBlock;
  const toBlock = argument("to") ?? Math.max(0, head - config.confirmations);
  if (fromBlock > toBlock) throw new Error("--from cannot exceed --to");

  console.log(`backfill starting: ${fromBlock}-${toBlock}`);
  await syncRange(client, db, fromBlock, toBlock);
  await closeDb();
  console.log(`backfill complete: ${fromBlock}-${toBlock}`);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exitCode = 1;
});
