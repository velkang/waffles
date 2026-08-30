/**
 * @waffles/shared
 * Framework-independent TypeScript definitions and pure contracts for Waffles Meme.
 */

export interface LaunchSummary {
  token: string;
  curve: string;
  creator: string;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  website: string;
  twitter: string;
  telegram: string;
  graduated: boolean;
  pool: string | null;
  createdAt: string | null;
  price: string;
  mcap: string;
  volume24h: string;
  progressBps: number;
}

export interface Trade {
  eventId?: string;
  trader: string;
  isBuy: boolean;
  usdcAmount: string;
  usdcGrossAmount?: string;
  feeAmount?: string;
  tokenAmount: string;
  priceAfter?: string;
  executionPrice?: string;
  mcapAfter?: string;
  progressBpsAfter?: number;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: string | Date;
  source?: "curve" | "pool";
}

export interface Candle {
  time: number;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  trades: number;
}

export interface PortfolioPosition {
  curve: string;
  usdcSpent: string;
  usdcReceived: string;
  tokensBought: string;
  tokensSold: string;
  tradeCount: number;
}

// REST Responses
export interface LaunchesResponse {
  launches: LaunchSummary[];
}

export interface LaunchResponse {
  launch: LaunchSummary | null;
}

export interface TradesResponse {
  trades: Trade[];
}

export interface CandlesResponse {
  candles: Candle[];
}

export interface PortfolioResponse {
  positions: PortfolioPosition[];
}

// Upload contracts
export interface UploadSignatureRequest {
  folder?: string;
}

export interface UploadSignatureResponse {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadPreset: string;
  uploadUrl: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface UploadFileResponse {
  url: string;
}

// Realtime SSE Contracts
export type RealtimeEventType =
  | "trade.upserted"
  | "launch.created"
  | "launch.updated"
  | "launch.graduated"
  | "system.resync"
  | "system.backfill_complete"
  | "system.admin_correction"
  | "stream.ready"
  | "heartbeat";

export interface SseEnvelope<T = unknown> {
  id: string;
  schemaVersion: number;
  type: RealtimeEventType;
  occurredAt: string;
  chainId?: string;
  blockNumber?: number;
  logIndex?: number;
  txHash?: string;
  token?: string;
  curve?: string;
  data: T;
}

export interface ControlEventDoc {
  _id?: unknown;
  type: "system.resync" | "system.backfill_complete" | "system.admin_correction";
  occurredAt: Date;
  expiresAt?: Date;
  chainId?: string;
  fromBlock?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Query / Filter definitions
export type LaunchSort = "new" | "mcap" | "volume";

export interface LaunchesQuery {
  sort?: LaunchSort;
  limit?: number;
  token?: string;
}

export interface TradesQuery {
  token: string;
  limit?: number;
}

export interface CandlesQuery {
  token: string;
  interval?: number;
  limit?: number;
}

export interface PortfolioQuery {
  address: string;
}

// Validation / Constraints
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export const DEFAULT_CLOUDINARY_FOLDER = "arc_fun_tokens";

// Deterministic Event ID helper
export function buildEventId(
  chainId: string | number,
  blockNumber: number | string | undefined,
  logIndex: number | string | undefined,
  type: RealtimeEventType,
  extra?: string
): string {
  if (blockNumber !== undefined && logIndex !== undefined) {
    return `${chainId}:${blockNumber}:${logIndex}:${type}${extra ? `:${extra}` : ""}`;
  }
  return `${chainId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}:${type}${extra ? `:${extra}` : ""}`;
}
