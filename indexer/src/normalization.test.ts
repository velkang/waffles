import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCurveUsdcAmounts } from "./normalization.js";

test("buy cash flow includes the fee-inclusive amount paid", () => {
  assert.deepEqual(normalizeCurveUsdcAmounts(true, 100_000_000n, 100n), {
    walletAmount: 100_000_000n,
    grossAmount: 100_000_000n,
    feeAmount: 1_000_000n,
  });
});

test("sell cash flow subtracts the fee from gross event output", () => {
  assert.deepEqual(normalizeCurveUsdcAmounts(false, 100_000_000n, 100n), {
    walletAmount: 99_000_000n,
    grossAmount: 100_000_000n,
    feeAmount: 1_000_000n,
  });
});

test("invalid fee configuration is rejected", () => {
  assert.throws(
    () => normalizeCurveUsdcAmounts(false, 1n, 10_000n),
    RangeError,
  );
});
