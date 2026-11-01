import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { WaffleMark } from "../brand";
import { useWallet } from "../wallet";
import { dateTime } from "../components";
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
  const wallet = useWallet();
  const [step, setStep] = useState(0),
    [furthest, setFurthest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const steps = [
    "Coin details",
    "Creator earnings",
    "Initial buy & locks",
    "Review",
  ];
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLHeadingElement>(`[data-step="${step}"] h2`)
      ?.focus();
  }, [step]);
  function cliffLabel(value: string) {
    const time = Date.parse(value);
    return Number.isFinite(time)
      ? dateTime(Math.floor(time / 1000))
      : "Choose an unlock date";
  }
  function nextStep() {
    setError("");
    const fields = formRef.current
      ?.querySelector(`[data-step="${step}"]`)
      ?.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input, textarea, select");
    if (fields)
      for (const field of fields) {
        if (!field.checkValidity()) {
          field.reportValidity();
          return;
        }
      }
    try {
      if (step === 1)
        validateRouting(
          {
            direct: Number(routing.direct) * 100,
            locked: Number(routing.locked) * 100,
            holders: Number(routing.holders) * 100,
            buyback: Number(routing.buyback) * 100,
          },
          feeCliff ? Math.floor(Date.parse(feeCliff) / 1000) : 0,
          Date.now() / 1000,
        );
      if (step === 2) {
        const initial = buy ? parseUnits(buy, 9) : 0n;
        if (
          Number(lockedPercent) > 0 &&
          (initial <= 0n || !(Date.parse(tokenCliff) > Date.now()))
        )
          throw new Error(
            "Choose a positive initial purchase and a future token unlock date.",
          );
      }
      setStep(step + 1);
      setFurthest((value) => Math.max(value, step + 1));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    }
  }
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
    if (step < 3) {
      nextStep();
      return;
    }
    if (!name.trim() || !symbol.trim()) {
      setStep(0);
      setError("Add a name and ticker for your coin.");
      return;
    }
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
          <h1>Cook up a coin.</h1>
          <p>
            A little personality. Clear launch terms. Your next Waffles launch.
          </p>
        </div>
      </div>
      <nav className="creation-steps" aria-label="Token creation steps">
        {steps.map((label, index) => (
          <button
            type="button"
            key={label}
            aria-current={step === index ? "step" : undefined}
            disabled={index > furthest || tx.pending}
            onClick={() => {
              setStep(index);
              setError("");
            }}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <form
        ref={formRef}
        onSubmit={submit}
        noValidate
        className="create-form creation-wizard"
      >
        <fieldset className="form-main" disabled={tx.pending}>
          <section className="form-section" data-step="0" hidden={step !== 0}>
            <h2 tabIndex={-1}>Coin details</h2>
            <div className="field-pair">
              <label className="field">
                Name
                <input
                  required
                  maxLength={32}
                  placeholder="e.g. Waffle Cat"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Ticker
                <input
                  required
                  maxLength={10}
                  placeholder="e.g. WFC"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                />
              </label>
            </div>
            <label className="field">
              Description
              <textarea
                maxLength={280}
                placeholder="Tell people what your coin is about…"
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
          <section className="form-section" data-step="1" hidden={step !== 1}>
            <h2 tabIndex={-1}>Creator earnings</h2>
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
          <section className="form-section" data-step="2" hidden={step !== 2}>
            <h2 tabIndex={-1}>Initial purchase and commitment</h2>
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
          {step === 3 && (
            <section className="form-section launch-review" data-step="3">
              <h2 tabIndex={-1}>Ready for the first flip?</h2>
              <p>
                Review the public terms before opening your wallet. Creator
                earnings allocations and lock terms are fixed once launched.
              </p>
              <dl className="review-list">
                <div>
                  <dt>Coin</dt>
                  <dd>
                    {name || "Add a name"} · ${symbol || "TICKER"}
                  </dd>
                </div>
                <div>
                  <dt>Initial purchase</dt>
                  <dd>{buy || "0"} SOL</dd>
                </div>
                <div>
                  <dt>Estimated purchased tokens</dt>
                  <dd>{formatUnits(estimate, 6, 2)}</dd>
                </div>
                {Object.entries(routing).map(([key, value]) => (
                  <div key={key}>
                    <dt>
                      {
                        {
                          direct: "Direct payout",
                          locked: "Locked earnings",
                          holders: "Holder rewards",
                          buyback: "Buyback & burn",
                        }[key]
                      }
                    </dt>
                    <dd>{Number(value) || 0}% of creator share</dd>
                  </div>
                ))}
                {Number(routing.locked) > 0 && (
                  <div>
                    <dt>Fee allocation unlock</dt>
                    <dd>{cliffLabel(feeCliff)}</dd>
                  </div>
                )}
                <div>
                  <dt>Purchased tokens to lock</dt>
                  <dd>
                    {lockedPercent}%
                    {Number(lockedPercent) > 0
                      ? ` · ${cliffLabel(tokenCliff)}`
                      : " · No initial token lock"}
                  </dd>
                </div>
                <div>
                  <dt>Network & account costs</dt>
                  <dd>Review in wallet</dd>
                </div>
              </dl>
              <p className="launch-warning">
                Your atomic initial buy pays 1%. Subsequent buys start at 40%
                and decline to 1% over 60 seconds. Sells pay 1%.
              </p>
              <p className="ux-muted-note">
                Locks cannot be withdrawn early. You can reject the request in
                your wallet before signing.
              </p>
            </section>
          )}
          <TransactionNotice
            error={error || tx.error}
            signature={tx.signature}
            phase={tx.phase}
          />
          <div className="wizard-actions">
            <button
              type="button"
              className="market-button"
              disabled={step === 0 || tx.pending}
              onClick={() => {
                setStep((value) => value - 1);
                setError("");
              }}
            >
              Back
            </button>
            <span>
              Step {step + 1} of {steps.length}
            </span>
            <button
              className="market-primary"
              disabled={tx.pending}
              type={step === 3 && !wallet.account ? "button" : "submit"}
              onClick={
                step === 3 && !wallet.account
                  ? () =>
                      window.dispatchEvent(new Event("waffles:connect-wallet"))
                  : undefined
              }
            >
              {tx.pending
                ? tx.label
                : step < 3
                  ? "Continue"
                  : wallet.account
                    ? "Create coin"
                    : "Connect wallet to launch"}
            </button>
          </div>
        </fieldset>
        <aside className="launch-terms coin-preview">
          <h2 tabIndex={-1}>Your coin, coming together</h2>
          <div className="coin-preview-art">
            {imageUri ? (
              <img src={imageUri} alt="Your uploaded token artwork" />
            ) : (
              <div>
                <WaffleMark />
                <span>Image preview</span>
              </div>
            )}
          </div>
          <h3>{name || "Your coin name"}</h3>
          <p className="coin-preview-ticker">${symbol || "TICKER"}</p>
          <p>{description || "Your coin’s description will appear here."}</p>
          <span className="preview-label">Live preview · Not launched</span>
          <dl>
            <div>
              <dt>Total supply</dt>
              <dd>1 billion</dd>
            </div>
            <div>
              <dt>Bonding curve</dt>
              <dd>79.31%</dd>
            </div>
            <div>
              <dt>Permanent pool</dt>
              <dd>20.69%</dd>
            </div>
            <div>
              <dt>Platform creation fee</dt>
              <dd>None</dd>
            </div>
          </dl>
          <p className="ux-muted-note">
            Network and account-creation costs are additional. SOL on Solana
            devnet.
          </p>
        </aside>
      </form>
    </div>
  );
}
