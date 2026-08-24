import "dotenv/config";

function numberEnv(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "http://localhost:8545",
  factoryAddress: (process.env.FACTORY_ADDRESS ?? "") as `0x${string}`,
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
  dbName: process.env.MONGODB_DB ?? "arcfun",
  // First block where the factory was deployed; backfill starts here.
  startBlock: numberEnv("START_BLOCK", 0, 0),
  pollIntervalMs: numberEnv("POLL_INTERVAL_MS", 2000, 250),
  // Max blocks per getLogs call
  chunkSize: numberEnv("CHUNK_SIZE", 5000, 1),
  confirmations: numberEnv("CONFIRMATIONS", 10, 0),
  reorgLookback: numberEnv("REORG_LOOKBACK", 100, 1),
};

if (!/^0x[0-9a-fA-F]{40}$/.test(config.factoryAddress)) {
  throw new Error("FACTORY_ADDRESS must be a valid EVM address");
}
