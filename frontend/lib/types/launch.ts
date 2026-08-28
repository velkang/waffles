export type LaunchSummary = {
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
  createdAt: string | null;
  graduated: boolean;
  pool: string | null;
  price: string;
  mcap: string;
  volume24h: string;
  progressBps: number;
};
