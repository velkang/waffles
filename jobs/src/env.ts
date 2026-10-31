export interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  BLOCKS: Queue<{ start: number; end: number }>;
  COORDINATOR: DurableObjectNamespace;
  API: Fetcher;
  SETTLEMENT: Workflow<{ epoch: number }>;
  RPC_URL: string;
  RPC: DurableObjectNamespace;
  RPC_CU_PER_SECOND?: string;
  PROGRAM_ID: string;
  GENESIS_HASH: string;
  START_SLOT: string;
  PYTH_URL: string;
  PYTH_API_KEY?: string;
  DRAND_CHAIN_HASH: string;
  OPERATIONS_TOKEN: string;
  FINALIZER_SECRET?: string;
  KEEPER_SECRET?: string;
}
