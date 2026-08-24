import { config } from "./config.js";
import { getDb } from "./db.js";
import { createClient, syncRange } from "./ingest.js";

type SyncDoc = {
  _id: string;
  lastBlock: number;
  lastBlockHash?: string;
};

async function main() {
  const db = await getDb();
  const client = createClient();
  const sync = db.collection<SyncDoc>("sync");
  const syncId = config.factoryAddress.toLowerCase();

  const chainHead = Number(await client.getBlockNumber());
  const initialFromBlock = Math.max(config.startBlock, chainHead - 10_000);
  const saved = await sync.findOne({ _id: syncId });
  let lastBlock = saved?.lastBlock ?? initialFromBlock - 1;
  let lastBlockHash = saved?.lastBlockHash;

  if (lastBlock >= config.startBlock && !lastBlockHash) {
    lastBlockHash = (await client.getBlock({ blockNumber: BigInt(lastBlock) })).hash;
  }

  console.log(
    `indexer starting: factory=${config.factoryAddress} next=${lastBlock + 1} head=${chainHead} confirmations=${config.confirmations}`,
  );

  for (;;) {
    try {
      if (lastBlock >= config.startBlock && lastBlockHash) {
        const canonical = await client.getBlock({ blockNumber: BigInt(lastBlock) });
        if (canonical.hash !== lastBlockHash) {
          const rewindFrom = Math.max(
            config.startBlock,
            lastBlock - config.reorgLookback + 1,
          );
          console.warn(`reorg detected: rewinding from block ${rewindFrom}`);
          await Promise.all([
            db.collection("trades").deleteMany({ blockNumber: { $gte: rewindFrom } }),
            db.collection("launches").deleteMany({ createdBlock: { $gte: rewindFrom } }),
            db.collection("launches").updateMany(
              { graduationBlock: { $gte: rewindFrom } },
              {
                $set: { graduated: false },
                $unset: {
                  graduatedAt: "",
                  graduationBlock: "",
                  graduationTxHash: "",
                  pool: "",
                },
              },
            ),
          ]);
          lastBlock = rewindFrom - 1;
          lastBlockHash =
            lastBlock >= config.startBlock
              ? (await client.getBlock({ blockNumber: BigInt(lastBlock) })).hash
              : undefined;
        }
      }

      const head = Number(await client.getBlockNumber());
      const safeHead = Math.max(0, head - config.confirmations);
      if (lastBlock < safeHead) {
        lastBlock = await syncRange(client, db, lastBlock + 1, safeHead);
        lastBlockHash = (
          await client.getBlock({ blockNumber: BigInt(lastBlock) })
        ).hash;
        await sync.updateOne(
          { _id: syncId },
          { $set: { lastBlock, lastBlockHash } },
          { upsert: true },
        );
      }
    } catch (err) {
      console.error("sync error:", err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
