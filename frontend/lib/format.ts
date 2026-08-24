import { formatUnits } from "viem";

export function formatUsd(raw: bigint | undefined, digits?: 2 | 4): string {
  if (raw === undefined) return "—";
  const n = Number(formatUnits(raw, 6));
  if (digits !== undefined) return `$${n.toFixed(digits)}`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatToken(raw: bigint | undefined): string {
  if (raw === undefined) return "—";
  const n = Number(formatUnits(raw, 18));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(4).replace(/\.?0+$/, "");
}

/// currentPrice() returns raw quote units (1e-6 USD) per whole token
export function formatPrice(priceScaled: bigint | undefined): string {
  if (priceScaled === undefined) return "—";
  const usd = Number(priceScaled) / 1e6;
  if (usd === 0) return "$0";
  if (usd < 0.0001) return `$${usd.toPrecision(4)}`;
  return `$${usd.toPrecision(4)}`;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
