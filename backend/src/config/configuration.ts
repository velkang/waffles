export interface AppConfig {
  port: number;
  environment: string;
  mongoUri: string;
  mongoDb: string;
  factoryAddress: string;
  chainId: string;
  corsOrigins: string[];
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    uploadPreset?: string;
  };
  rateLimit: {
    ttlMs: number;
    limit: number;
    uploadLimit: number;
  };
  rewards: {
    distributorAddress: string;
    epochDurationSec: number;
    epochZeroUnixSec: number;
    finalityDelaySec: number;
    ticketThresholdUsdc: number;
    winnerCount: number;
    drandChainHash: string;
    rpcUrl: string;
    finalizerPrivateKey: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '3002', 10),
  environment: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongoDb: process.env.MONGODB_DB || 'waffles',
  factoryAddress: (process.env.FACTORY_ADDRESS || process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '').toLowerCase(),
  chainId: process.env.CHAIN_ID || 'arc-testnet',
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || '',
  },
  rateLimit: {
    ttlMs: parseInt(process.env.RATE_LIMIT_TTL_MS || '60000', 10),
    limit: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
    uploadLimit: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '20', 10),
  },
  rewards: {
    distributorAddress: (process.env.REWARDS_DISTRIBUTOR_ADDRESS || '').toLowerCase(),
    epochDurationSec: parseInt(process.env.REWARDS_EPOCH_DURATION_SEC || '604800', 10),
    epochZeroUnixSec: parseInt(process.env.REWARDS_EPOCH_ZERO_UNIX_SEC || '1756684800', 10),
    finalityDelaySec: parseInt(process.env.REWARDS_FINALITY_DELAY_SEC || '60', 10),
    ticketThresholdUsdc: parseInt(process.env.REWARDS_TICKET_THRESHOLD_USDC || '1000', 10),
    winnerCount: parseInt(process.env.REWARDS_WINNER_COUNT || '20', 10),
    drandChainHash:
      process.env.REWARDS_DRAND_CHAIN_HASH ||
      '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
    rpcUrl: process.env.REWARDS_RPC_URL || '',
    finalizerPrivateKey: process.env.REWARDS_FINALIZER_PRIVATE_KEY || '',
  },
});
