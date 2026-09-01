export const GRADUATION_TARGET_USD = Number(
  process.env.NEXT_PUBLIC_GRADUATION_TARGET_USD || 50000
);

export const GRADUATION_TARGET_FORMATTED =
  GRADUATION_TARGET_USD >= 1000
    ? `$${(GRADUATION_TARGET_USD / 1000).toLocaleString()}K`
    : `$${GRADUATION_TARGET_USD.toLocaleString()}`;

export const INITIAL_MCAP_USD = (GRADUATION_TARGET_USD * 2986) / 53028;

export const INITIAL_MCAP_FORMATTED =
  INITIAL_MCAP_USD >= 1000
    ? `~$${(INITIAL_MCAP_USD / 1000).toFixed(1)}K`
    : `~$${Math.round(INITIAL_MCAP_USD)}`;

export const MAX_DEV_BUY_USDC = process.env.NEXT_PUBLIC_MAX_DEV_BUY_USDC
  ? Number(process.env.NEXT_PUBLIC_MAX_DEV_BUY_USDC)
  : 50;

export const REWARDS_DISTRIBUTOR_ADDRESS =
  (process.env.NEXT_PUBLIC_REWARDS_DISTRIBUTOR_ADDRESS || '') as `0x${string}`;

