const TOKEN_SCALE = 10n ** 18n;
const USD_PRICE_SCALE_FACTOR = 10n ** 30n;
const DEFAULT_TOTAL_SUPPLY = 1_000_000_000n * TOKEN_SCALE;

export function spotPriceFromReserves(
  tokenIsToken0: boolean,
  reserve0: bigint,
  reserve1: bigint,
  totalSupply = DEFAULT_TOTAL_SUPPLY,
): { price: bigint; marketCap: bigint } {
  const tokenReserve = tokenIsToken0 ? reserve0 : reserve1;
  const usdcReserve = tokenIsToken0 ? reserve1 : reserve0;
  if (tokenReserve <= 0n) return { price: 0n, marketCap: 0n };

  const price = (usdcReserve * USD_PRICE_SCALE_FACTOR) / tokenReserve;
  return {
    price,
    marketCap: (usdcReserve * totalSupply) / tokenReserve,
  };
}

export function executionPrice(usdcAmount: bigint, tokenAmount: bigint): bigint {
  return tokenAmount > 0n ? (usdcAmount * USD_PRICE_SCALE_FACTOR) / tokenAmount : 0n;
}
