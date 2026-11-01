import type { Commitment } from "@waffles/shared/solana";

export function supplyPercentage(
  amount: string | bigint,
  supply: string | bigint,
) {
  const value = BigInt(amount),
    total = BigInt(supply);
  if (total <= 0n) return "Unavailable";
  const basisPoints = (value * 10000n) / total;
  if (value > 0n && basisPoints === 0n) return "<0.01%";
  return `${Number(basisPoints) / 100}%`;
}

export function activeLocks(commitments: readonly Commitment[], now: number) {
  const active = commitments.filter(
    (lock) =>
      !lock.withdrawn && lock.unlockAt > now && BigInt(lock.amount) > 0n,
  );
  return {
    sol: active
      .filter((lock) => lock.asset === "sol")
      .reduce((sum, lock) => sum + BigInt(lock.amount), 0n),
    tokens: active
      .filter((lock) => lock.asset === "token")
      .reduce((sum, lock) => sum + BigInt(lock.amount), 0n),
    nextUnlock: active.length
      ? Math.min(...active.map((lock) => lock.unlockAt))
      : null,
  };
}

export function weekRemaining(end: number, now: number) {
  const minutes = Math.max(0, Math.ceil((end * 1000 - now) / 60000));
  if (!minutes) return "Week closed";
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60);
  return `${days ? `${days}d ` : ""}${hours}h ${minutes % 60}m`;
}
