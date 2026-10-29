export interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  JOBS: Fetcher;
  LIVE: DurableObjectNamespace;
  RPC_URL: string;
  RPC: DurableObjectNamespace;
  PROGRAM_ID: string;
  GENESIS_HASH: string;
  UPGRADE_AUTHORITY: string;
  MEDIA_ORIGIN: string;
  ACCESS_TEAM: string;
  ACCESS_AUD: string;
  OPERATIONS_TOKEN: string;
  UPLOAD_LIMIT: RateLimit;
  RPC_LIMIT: RateLimit;
}
