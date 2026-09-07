import {
  AnalyticsRange,
  AnalyticsResponse,
  CandlesQuery,
  CandlesResponse,
  LaunchesQuery,
  LaunchesResponse,
  LaunchResponse,
  PortfolioResponse,
  TradesQuery,
  TradesResponse,
  UploadSignatureResponse,
  ALLOWED_IMAGE_MIMES,
  MAX_UPLOAD_BYTES,
  RewardsClaimsResponse,
  RewardsCurrentResponse,
  RewardsEpochsResponse,
  RewardsLeaderboardResponse,
} from '@waffles/shared';
import { getOptimizedImageUrl } from './image';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');

if (process.env.NODE_ENV === 'production' && !configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL must be configured for production builds');
}

export const API_BASE_URL =
  configuredApiUrl ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3002'
    : '');

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const base = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  if (!params) return base;

  const url = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const errJson = await res.json();
      errorMsg = errJson.message || errJson.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  async getAnalytics(range: AnalyticsRange): Promise<AnalyticsResponse> {
    return fetchJson<AnalyticsResponse>(buildUrl('/v1/analytics', { range }));
  },
  async getLaunches(query?: LaunchesQuery): Promise<LaunchesResponse> {
    const url = buildUrl('/v1/launches', {
      sort: query?.sort,
      limit: query?.limit,
      token: query?.token,
    });
    return fetchJson<LaunchesResponse>(url);
  },

  async getLaunch(token: string): Promise<LaunchResponse> {
    const url = buildUrl(`/v1/launches/${token.toLowerCase()}`);
    return fetchJson<LaunchResponse>(url);
  },

  async getTrades(query: TradesQuery): Promise<TradesResponse> {
    const url = buildUrl('/v1/trades', {
      token: query.token.toLowerCase(),
      limit: query.limit,
    });
    return fetchJson<TradesResponse>(url);
  },

  async getCandles(query: CandlesQuery): Promise<CandlesResponse> {
    const url = buildUrl('/v1/candles', {
      token: query.token.toLowerCase(),
      interval: query.interval,
      limit: query.limit,
    });
    return fetchJson<CandlesResponse>(url);
  },

  async getPortfolio(address: string): Promise<PortfolioResponse> {
    const url = buildUrl(`/v1/portfolios/${address.toLowerCase()}`);
    return fetchJson<PortfolioResponse>(url);
  },

  async getCurrentRewards(address?: string): Promise<RewardsCurrentResponse> {
    return fetchJson<RewardsCurrentResponse>(buildUrl('/v1/rewards/current', { address }));
  },

  async getRewardsLeaderboard(limit = 100): Promise<RewardsLeaderboardResponse> {
    return fetchJson<RewardsLeaderboardResponse>(buildUrl('/v1/rewards/leaderboard', { limit }));
  },

  async getRewardsEpochs(limit = 20): Promise<RewardsEpochsResponse> {
    return fetchJson<RewardsEpochsResponse>(buildUrl('/v1/rewards/epochs', { limit }));
  },

  async getRewardClaims(address: string): Promise<RewardsClaimsResponse> {
    return fetchJson<RewardsClaimsResponse>(buildUrl(`/v1/rewards/claims/${address.toLowerCase()}`));
  },

  async getUploadSignature(): Promise<UploadSignatureResponse> {
    const url = buildUrl('/v1/uploads/signature');
    return fetchJson<UploadSignatureResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  },

  async uploadImage(file: File): Promise<{ url: string }> {
    if (!ALLOWED_IMAGE_MIMES.some((allowed) => allowed === file.type)) {
      throw new Error('Unsupported image format. Please select a PNG, JPG, WEBP, or GIF image.');
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error('Image size exceeds 5MB limit.');
    }

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildUrl('/v1/uploads'), {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || 'Failed to upload image to Cloudinary');
    }

    const data = (await res.json()) as { url: string };
    const optimizedUrl = getOptimizedImageUrl(data.url, {
      width: 400,
      height: 400,
      quality: 75,
    });

    return { url: optimizedUrl };
  },
};
