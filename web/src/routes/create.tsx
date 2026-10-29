import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  INITIAL_SOL,
  INITIAL_TOKENS,
  parseUnits,
  quoteBuy,
  formatUnits,
  validateRouting,
  type Routing,
} from "@waffles/shared/solana";
import { useTransaction } from "../transaction";
import { TransactionNotice, Upload } from "../components";
export const Route = createFileRoute("/create")({ component: Create });
function Create() {
  const navigate = useNavigate(),
    tx = useTransaction();
  const [name, setName] = useState(""),
    [symbol, setSymbol] = useState(""),
    [description, setDescription] = useState(""),
    [imageUri, setImageUri] = useState(""),
    [buy, setBuy] = useState(""),
    [lockedPercent, setLockedPercent] = useState("0"),
    [tokenCliff, setTokenCliff] = useState(""),
    [feeCliff, setFeeCliff] = useState(""),
    [routing, setRouting] = useState({
      direct: "100",
      locked: "",
      holders: "",
      buyback: "",
    }),
    [error, setError] = useState("");
  const allocated = Object.values(routing).reduce(
    (sum, value) => sum + Number(value),
    0,
  );
  let estimate = 0n;
  try {
    if (buy)
      estimate = quoteBuy(
        INITIAL_SOL,
        INITIAL_TOKENS,
        parseUnits(buy, 9),
        100n,
      ).output;
  } catch {}
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const initialBuy = buy ? parseUnits(buy, 9) : 0n;
      const allocation: Routing = {
        direct: Number(routing.direct) * 100,
        locked: Number(routing.locked) * 100,
        holders: Number(routing.holders) * 100,
        buyback: Number(routing.buyback) * 100,
      };
      const cliff = feeCliff
        ? Math.floor(new Date(feeCliff).getTime() / 1000)
        : 0;
      validateRouting(allocation, cliff, Date.now() / 1000);
      const percentage = Number(lockedPercent);
      if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100)
        throw new Error("Initial token lock must be between 0% and 100%");
      const unlock = tokenCliff
        ? Math.floor(new Date(tokenCliff).getTime() / 1000)
        : 0;
      if (percentage > 0 && (!initialBuy || unlock <= Date.now() / 1000))
        throw new Error("Choose an initial buy and future token unlock date");
      const result = await tx.send({
        action: "create",
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description,
        imageUri,
        routing: allocation,
        feeCliff: cliff,
        initialBuy: initialBuy.toString(),
        minOut: estimate.toString(),
        lockedTokens: ((estimate * BigInt(percentage)) / 100n).toString(),
        tokenCliff: unlock,
      });
      if (result?.mint)
        await navigate({ to: "/token/$mint", params: { mint: result.mint } });
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <div className="market-page create-page">
      <div className="market-heading">
        <div>
          <h1>Create a coin</h1>
          <p>Commit publicly before the first trade.</p>
        </div>
      </div>
      <form onSubmit={submit} className="create-form">
        <div className="form-main">
          <section className="form-section">
            <h2>Coin details</h2>
            <div className="field-pair">
              <label className="field">
                Name
                <input
                  required
                  maxLength={32}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Ticker
                <input
                  required
                  maxLength={10}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </label>
            </div>
            <label className="field">
              Description
              <textarea
                maxLength={280}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Upload onUploaded={setImageUri} />
            {imageUri && (
              <img
                className="upload-preview"
                src={imageUri}
                alt="Selected token image"
              />
            )}
          </section>
          <section className="form-section">
            <h2>Creator earnings</h2>
            <p>
              Allocate your 40% share of trading fees. These percentages are
              public and fixed at launch.
            </p>
            <div className="field-pair">
              {Object.entries(routing).map(([id, value]) => (
                <label className="field" key={id}>
                  {
                    (
                      {
                        direct: "Direct payout",
                        locked: "Locked earnings",
                        holders: "Holder rewards",
                        buyback: "Buyback and burn",
                      } as Record<string, string>
                    )[id]
                  }{" "}
                  %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="0"
                    value={value}
                    onChange={(e) =>
                      setRouting({ ...routing, [id]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <p className={allocated === 100 ? "form-success" : "form-error"}>
              Allocated: {allocated}% / 100%
            </p>
            {Number(routing.locked) > 0 && (
              <label className="field">
                Fee earnings unlock date
                <input
                  type="datetime-local"
                  required
                  value={feeCliff}
                  onChange={(e) => setFeeCliff(e.target.value)}
                />
              </label>
            )}
            <small>
              After the fee cliff, that allocation becomes direct payout. Holder
              rewards are weekly and time-weighted. Buybacks start after
              graduation.
            </small>
          </section>
          <section className="form-section">
            <h2>Initial purchase and commitment</h2>
            <label className="field">
              Initial purchase in SOL · optional
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={buy}
                onChange={(e) => setBuy(e.target.value)}
              />
            </label>
            <p>Estimated tokens: {formatUnits(estimate, 6, 2)}</p>
            <label className="field">
              Lock this percentage of the initial purchase
              <input
                type="number"
                min="0"
                max="100"
                value={lockedPercent}
                onChange={(e) => setLockedPercent(e.target.value)}
              />
            </label>
            {Number(lockedPercent) > 0 && (
              <label className="field">
                Token unlock date
                <input
                  type="datetime-local"
                  required
                  value={tokenCliff}
                  onChange={(e) => setTokenCliff(e.target.value)}
                />
              </label>
            )}
          </section>
          {(error || tx.error) && (
            <p role="alert" className="form-error">
              {error || tx.error}
            </p>
          )}
          <TransactionNotice error="" signature={tx.signature} />
          <button
            className="market-primary"
            disabled={tx.pending}
            type="submit"
          >
            {tx.pending ? "Confirm in your wallet…" : "Create coin"}
          </button>
        </div>
        <aside className="launch-terms">
          <h2>Launch terms</h2>
          <dl>
            <div>
              <dt>Supply</dt>
              <dd>1 billion tokens</dd>
            </div>
            <div>
              <dt>Curve allocation</dt>
              <dd>79.31%</dd>
            </div>
            <div>
              <dt>Permanent pool allocation</dt>
              <dd>20.69%</dd>
            </div>
            <div>
              <dt>Platform creation fee</dt>
              <dd>None</dd>
            </div>
          </dl>
          <p>
            You pay Solana transaction and account-creation costs. Review the
            wallet’s simulation before signing.
          </p>
          <h3>First 60 seconds</h3>
          <p>
            Your atomic initial purchase pays 1%. All subsequent buys begin at
            40%, declining to 1% over 60 seconds. Sells pay 1%.
          </p>
          <h3>Public commitments</h3>
          <p>
            Locks have no early withdrawal. Devnet program upgrades remain
            possible and the upgrade authority is disclosed.
          </p>
        </aside>
      </form>
    </div>
  );
}
