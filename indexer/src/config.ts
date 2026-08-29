import "dotenv/config";

function numberEnv(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function boundedNumberEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = numberEnv(name, fallback, minimum);
  if (value > maximum) throw new Error(`${name} must be an integer <= ${maximum}`);
  return value;
}

export const config = {
  rpcUrl: process.env.RPC_URL ?? "http://localhost:8545",
  factoryAddress: (process.env.FACTORY_ADDRESS ?? "") as `0x${string}`,
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
  dbName: process.env.MONGODB_DB ?? "arcfun",
  // First block where the factory was deployed; backfill starts here.
  startBlock: numberEnv("START_BLOCK", 0, 0),
  pollIntervalMs: numberEnv("POLL_INTERVAL_MS", 60_000, 5_000),
  rpcMaxRequestsPerSecond: boundedNumberEnv("RPC_MAX_REQUESTS_PER_SECOND", 5, 1, 5),
  // Max blocks per getLogs call
  chunkSize: numberEnv("CHUNK_SIZE", 5000, 1),
  confirmations: numberEnv("CONFIRMATIONS", 10, 0),
  reorgLookback: numberEnv("REORG_LOOKBACK", 100, 1),
  usdcAddress: (process.env.USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000").toLowerCase() as `0x${string}`,
  port: boundedNumberEnv("PORT", 3001, 1, 65_535),
  circleApiKey: process.env.CIRCLE_API_KEY ?? "",
  circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
  circleBlockchain: process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET",
  circleMonitorIntervalMs: numberEnv("CIRCLE_MONITOR_INTERVAL_MS", 60_000, 10_000),
  webhookMaxBodyBytes: numberEnv("WEBHOOK_MAX_BODY_BYTES", 1_048_576, 1_024),
  verifyWebhookSignatures: process.env.VERIFY_WEBHOOK_SIGNATURES !== "false",
};

if (!/^0x[0-9a-fA-F]{40}$/.test(config.factoryAddress)) {
  throw new Error("FACTORY_ADDRESS must be a valid EVM address");
}
