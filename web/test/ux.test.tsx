import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeLocks, supplyPercentage, weekRemaining } from "../src/ux";
import { TransactionNotice } from "../src/components";
import { protocolDetails } from "../src/analytics-data";
import type { Commitment } from "@waffles/shared/solana";

const lock = (changes: Partial<Commitment>): Commitment => ({
  id: "example",
  mint: "example",
  owner: "example",
  asset: "token",
  amount: "100",
  purchaseCost: null,
  startAt: 50,
  unlockAt: 200,
  withdrawn: false,
  kind: "purchased-tokens",
  ...changes,
});

test("only still-funded and still-locked assets enter the active summary", () => {
  const summary = activeLocks(
    [
      lock({ amount: "120" }),
      lock({ asset: "sol", amount: "50", unlockAt: 250 }),
      lock({ amount: "900", withdrawn: true }),
      lock({ amount: "900", unlockAt: 100 }),
      lock({ amount: "0" }),
    ],
    100,
  );
  assert.deepEqual(summary, { tokens: 120n, sol: 50n, nextUnlock: 200 });
});
test("unlocked but unwithdrawn deposits do not imply an active commitment", () => {
  assert.deepEqual(activeLocks([lock({ unlockAt: 99 })], 100), {
    tokens: 0n,
    sol: 0n,
    nextUnlock: null,
  });
});
test("a small real lock is never labelled zero percent", () => {
  assert.equal(supplyPercentage("88376678400", "1000000000000000"), "<0.01%");
  assert.equal(supplyPercentage(0n, 100n), "0%");
  assert.equal(supplyPercentage(25n, 100n), "25%");
  assert.equal(supplyPercentage(1n, 0n), "Unavailable");
});
test("weekly cutoff never counts backwards after closing", () => {
  assert.equal(weekRemaining(100, 100000), "Week closed");
  assert.equal(weekRemaining(3660, 0), "1h 1m");
});
test("submitted transactions expose evidence without claiming confirmation", () => {
  const markup = renderToStaticMarkup(
    <TransactionNotice
      error=""
      signature="example-signature"
      phase="confirming"
    />,
  );
  assert.match(markup, /Waiting for confirmation/);
  assert.doesNotMatch(markup, /Transaction confirmed|Confirmed on Solana/);
  assert.match(markup, /cluster=devnet/);
});
test("interrupted confirmation keeps the transaction link for inspection", () => {
  const markup = renderToStaticMarkup(
    <TransactionNotice
      error="Confirmation expired"
      signature="example-signature"
      phase="error"
    />,
  );
  assert.match(markup, /before retrying/);
  assert.match(markup, /View transaction/);
  assert.doesNotMatch(markup, /Confirmed on Solana/);
});
test("confirmed transactions disclose finalized indexing delay", () => {
  const markup = renderToStaticMarkup(
    <TransactionNotice
      error=""
      signature="example-signature"
      phase="confirmed"
    />,
  );
  assert.match(markup, /Confirmed on Solana/);
  assert.match(markup, /may take a moment/);
});

test("protocol action details tolerate missing or malformed indexing payloads", () => {
  assert.equal(protocolDetails("not-json"), null);
  assert.equal(protocolDetails("null"), null);
  assert.equal(protocolDetails('"unexpected"'), null);
  assert.deepEqual(protocolDetails('{"tokens":"1250000","incentives":false}'), {
    tokens: "1250000",
    destination: null,
    incentives: false,
  });
});

test("invalid protocol fields cannot become amounts or explorer links", () => {
  assert.deepEqual(
    protocolDetails(
      '{"tokens":"1.2","destination":"javascript:alert(1)","incentives":"false"}',
    ),
    {
      tokens: null,
      destination: null,
      incentives: null,
    },
  );
});
