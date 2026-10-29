import type {
  Market,
  Commitment,
  SolTrade,
  SolClaim,
  CategoryTickets,
} from "@waffles/shared/solana";
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not load the latest data");
  return data as T;
}
export interface Config {
  network: "devnet" | "localnet";
  programId: string;
  upgradeAuthority: string | null;
  incentivesVault: string;
  genesisHash: string;
  configured: boolean;
}
export interface CurrentRewards {
  epoch: number;
  start: number;
  end: number;
  poolSol: string;
  totalTickets: string;
  winningTickets: string | null;
  missingPrices: number;
  user: ({ wallet: string } & CategoryTickets) | null;
  leaderboard: ({ wallet: string; volumeUsd: string } & CategoryTickets)[];
}
export const api = {
  config: () => request<Config>("/v1/config"),
  markets: (sort: string, committed: boolean) =>
    request<{ launches: Market[] }>(
      `/v1/launches?sort=${sort}&committed=${committed}`,
    ),
  market: (mint: string) =>
    request<{
      launch: Market | null;
      holdingCheckpoint: { at: number; completed: boolean } | null;
    }>(`/v1/launches/${mint}`),
  trades: (mint: string) =>
    request<{ trades: SolTrade[] }>(`/v1/trades?token=${mint}`),
  commitments: (mint: string) =>
    request<{ commitments: Commitment[] }>(`/v1/commitments/${mint}`),
  rewards: (wallet?: string) =>
    request<CurrentRewards>(
      `/v1/rewards/current${wallet ? `?address=${wallet}` : ""}`,
    ),
  claims: (wallet: string) =>
    request<{ claims: SolClaim[] }>(`/v1/rewards/claims/${wallet}`),
};
