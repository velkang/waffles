export const BPS_DENOM = 10_000n;

export function normalizeCurveUsdcAmounts(
  isBuy: boolean,
  eventAmount: bigint,
  feeBps: bigint,
): { walletAmount: bigint; grossAmount: bigint; feeAmount: bigint } {
  if (feeBps < 0n || feeBps >= BPS_DENOM) {
    throw new RangeError("feeBps must be between 0 and 9999");
  }
  const feeAmount = (eventAmount * feeBps) / BPS_DENOM;
  return {
    walletAmount: isBuy ? eventAmount : eventAmount - feeAmount,
    grossAmount: eventAmount,
    feeAmount,
  };
}
