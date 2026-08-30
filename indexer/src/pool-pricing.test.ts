import assert from "node:assert/strict";
import test from "node:test";
import { executionPrice, spotPriceFromReserves } from "./pool-pricing.js";

test("derives token0 spot price and market cap from post-swap reserves", () => {
  const result = spotPriceFromReserves(true, 200_000_000n * 10n ** 18n, 20_000n * 10n ** 6n);
  assert.equal(result.price, 100_000_000_000_000n);
  assert.equal(result.marketCap, 100_000n * 10n ** 6n);
});

test("derives token1 spot price from post-swap reserves", () => {
  const result = spotPriceFromReserves(false, 25_000n * 10n ** 6n, 250_000_000n * 10n ** 18n);
  assert.equal(result.price, 100_000_000_000_000n);
});

test("keeps average execution price separate from post-swap spot price", () => {
  assert.equal(
    executionPrice(100n * 10n ** 6n, 900_000n * 10n ** 18n),
    111_111_111_111_111n,
  );
});
