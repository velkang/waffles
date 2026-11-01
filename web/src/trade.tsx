import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buyFeeBps,
  formatUnits,
  parseUnits,
  type Market,
  type Commitment,
} from "@waffles/shared/solana";
import { connection, useWallet } from "./wallet";
import { useTransaction } from "./transaction";
import { request } from "./api";
import { dateTime, TransactionNotice } from "./components";
import { activeLocks, supplyPercentage } from "./ux";

function CreatorSnapshot({
  market,
  commitments,
  failed,
  now,
}: {
  market: Market;
  commitments?: Commitment[];
  failed: boolean;
  now: number;
}) {
  const locks = commitments ? activeLocks(commitments, now) : null;
  const future = market.routing.locked > 0 && market.feeCliff > now;
  return (
    <section
      className="creator-snapshot"
      aria-labelledby="creator-snapshot-title"
    >
      <div className="ux-panel-heading">
        <h3 id="creator-snapshot-title">Creator commitment</h3>
        <a href="#creator-commitments">Full details</a>
      </div>
      {failed ? (
        <p role="status">
          Funded locks are unavailable. Check the full details before trading.
        </p>
      ) : !locks ? (
        <p role="status">Loading funded locks…</p>
      ) : (
        <dl>
          <div>
            <dt>SOL in active locks</dt>
            <dd>{formatUnits(locks.sol)} SOL</dd>
          </div>
          <div>
            <dt>Tokens in active locks</dt>
            <dd>
              {formatUnits(locks.tokens, 6, 2)} {market.symbol}{" "}
              <small>
                {supplyPercentage(locks.tokens, market.supply)} of supply
              </small>
            </dd>
          </div>
          {locks.nextUnlock && (
            <div>
              <dt>Next unlock</dt>
              <dd>{dateTime(locks.nextUnlock)}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="creator-allocation">
        <strong>
          {future
            ? `${market.routing.locked / 100}% of future creator fees committed`
            : "No active future-fee allocation"}
        </strong>
        <p>
          {future
            ? `Until ${dateTime(market.feeCliff)}. This allocation is separate from funded locks.`
            : "Funded asset locks are shown separately above."}
        </p>
      </div>
      <p className="ux-muted-note">
        A commitment is a transparency signal, not a safety guarantee.
      </p>
    </section>
  );
}

export function TradePanel({
  market: m,
  commitments,
  commitmentsError,
}: {
  market: Market;
  commitments?: Commitment[];
  commitmentsError: boolean;
}) {
  const wallet = useWallet(),
    tx = useTransaction();
  const [buy, setBuy] = useState(true),
    [amount, setAmount] = useState(""),
    [slippage, setSlippage] = useState("1"),
    [now, setNow] = useState(Date.now() / 1000),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  const balances = useQuery({
    queryKey: ["wallet-balances", wallet.account?.address, m.mint],
    enabled: Boolean(wallet.account),
    refetchInterval: 15000,
    queryFn: async () => {
      const owner = new PublicKey(wallet.account!.address),
        ata = getAssociatedTokenAddressSync(new PublicKey(m.mint), owner);
      const [sol, tokens] = await Promise.all([
        connection.getBalance(owner, "confirmed"),
        (async () => {
          const info = await connection.getAccountInfo(ata, "confirmed");
          return info
            ? (await connection.getTokenAccountBalance(ata, "confirmed")).value
                .amount
            : "0";
        })(),
      ]);
      return { sol: BigInt(sol), tokens: BigInt(tokens) };
    },
  });
  let raw = 0n,
    amountProblem = "";
  try {
    if (amount) raw = parseUnits(amount, buy ? 9 : 6);
  } catch {
    amountProblem = `Enter an amount with up to ${buy ? 9 : 6} decimal places.`;
  }
  let slippageBps: bigint | null = null;
  try {
    const parsed = parseUnits(slippage, 2);
    if (parsed <= 500n) slippageBps = parsed;
  } catch {}
  const quote = useQuery({
    queryKey: ["quote", m.mint, buy, raw.toString()],
    queryFn: () =>
      request<{
        output: string;
        consumed?: string;
        feeBps: string;
        fee?: { total: string };
        fees?: { total: string };
      }>(
        `/v1/quote?token=${m.mint}&side=${buy ? "buy" : "sell"}&amount=${raw}`,
      ),
    enabled: raw > 0n && m.state !== "complete",
    refetchInterval: 3000,
  });
  const minimum =
    quote.data && slippageBps !== null
      ? (BigInt(quote.data.output) * (10000n - slippageBps)) / 10000n
      : null;
  const quotedFee = quote.data?.fee?.total ?? quote.data?.fees?.total;
  const fee = buy ? buyFeeBps(m.launchedAt, now) : 100n;
  const available = balances.data?.[buy ? "sol" : "tokens"];
  const overBalance = available !== undefined && raw > available;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!wallet.account) {
      window.dispatchEvent(new Event("waffles:connect-wallet"));
      return;
    }
    if (slippageBps === null) {
      setError("Choose slippage between 0% and 5%.");
      return;
    }
    if (!quote.data || raw <= 0n) {
      setError("Enter an amount and wait for a quote.");
      return;
    }
    if (overBalance) {
      setError("This amount is above your spendable wallet balance.");
      return;
    }
    await tx.send({
      action: "trade",
      mint: m.mint,
      buy,
      amount: raw.toString(),
      minOut: minimum!.toString(),
    });
  }
  return (
    <aside className="trade-stack">
      <section className="trade-form analytics-panel">
        <div className="ux-panel-heading">
          <h2>{m.state === "complete" ? "Graduation pending" : "Trade"}</h2>
          <span className="ux-network-chip">SOL · Devnet</span>
        </div>
        {m.state === "complete" ? (
          <>
            <p>
              The curve is complete. Anyone can retry migration to its permanent
              pool.
            </p>
            <button
              className="market-primary"
              disabled={tx.pending}
              onClick={() =>
                wallet.account
                  ? void tx.send({ action: "graduate", mint: m.mint })
                  : window.dispatchEvent(new Event("waffles:connect-wallet"))
              }
            >
              {tx.pending
                ? tx.label
                : wallet.account
                  ? "Complete graduation"
                  : "Connect wallet"}
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div
              className="market-segment trade-side"
              role="group"
              aria-label="Trade direction"
            >
              {[true, false].map((side) => (
                <button
                  key={String(side)}
                  type="button"
                  disabled={tx.pending}
                  aria-pressed={buy === side}
                  onClick={() => {
                    setBuy(side);
                    setAmount("");
                    setError("");
                  }}
                >
                  {side ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
            <label className="field trade-amount">
              Amount in {buy ? "SOL" : m.symbol}
              <input
                aria-describedby="trade-balance trade-input-error"
                inputMode="decimal"
                required
                placeholder="0.00"
                disabled={tx.pending}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError("");
                }}
              />
            </label>
            <p className="trade-balance" id="trade-balance">
              {!wallet.account
                ? "Connect to see spendable balances"
                : balances.isPending
                  ? "Loading wallet balance…"
                  : balances.isError
                    ? "Wallet balance unavailable"
                    : `${buy ? "SOL balance" : "Spendable holding"}: ${formatUnits(available!, buy ? 9 : 6, buy ? 4 : 2)} ${buy ? "SOL" : m.symbol}`}
            </p>
            <div
              className="quick-amounts"
              role="group"
              aria-label={buy ? "Quick SOL amounts" : "Sell percentage"}
            >
              {(buy ? ["0.1", "0.5", "1", "5"] : ["25", "50", "100"]).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    disabled={tx.pending || (!buy && !balances.data)}
                    onClick={() => {
                      setAmount(
                        buy
                          ? value
                          : formatUnits(
                              (balances.data!.tokens * BigInt(value)) / 100n,
                              6,
                              6,
                            ).replaceAll(",", ""),
                      );
                      setError("");
                    }}
                  >
                    {value}
                    {buy ? " SOL" : "%"}
                  </button>
                ),
              )}
            </div>
            <p
              id="trade-input-error"
              className="form-error"
              role={amountProblem || overBalance ? "alert" : undefined}
            >
              {amountProblem ||
                (overBalance
                  ? "Amount exceeds your spendable balance. Network fees are additional."
                  : "")}
            </p>
            <div className="trade-slippage">
              <label htmlFor="trade-slippage">Slippage tolerance</label>
              <div
                className="slippage-presets"
                role="group"
                aria-label="Slippage presets"
              >
                {["0.5", "1", "3"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={slippage === value}
                    disabled={tx.pending}
                    onClick={() => setSlippage(value)}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              <div className="slippage-custom">
                <input
                  id="trade-slippage"
                  aria-label="Custom slippage percent"
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  disabled={tx.pending}
                  value={slippage}
                  onChange={(event) => setSlippage(event.target.value)}
                />
                <span>%</span>
              </div>
            </div>
            {slippageBps === null && (
              <p className="form-error" role="alert">
                Choose slippage between 0% and 5%.
              </p>
            )}
            <div className="trade-receipt" aria-live="polite">
              <div className="trade-receipt-heading">
                <strong>Your quote</strong>
                <span>
                  {raw <= 0n
                    ? "Enter an amount"
                    : quote.isPending
                      ? "Calculating…"
                      : quote.isError
                        ? "Unavailable"
                        : "Refreshes every 3s"}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Estimated received</dt>
                  <dd>
                    {quote.data
                      ? formatUnits(quote.data.output, buy ? 6 : 9, buy ? 2 : 4)
                      : "—"}{" "}
                    {buy ? m.symbol : "SOL"}
                  </dd>
                </div>
                <div>
                  <dt>Minimum received</dt>
                  <dd>
                    {minimum !== null
                      ? formatUnits(minimum, buy ? 6 : 9, buy ? 2 : 4)
                      : "—"}{" "}
                    {buy ? m.symbol : "SOL"}
                  </dd>
                </div>
                <div>
                  <dt>{quote.data ? "Quoted fee" : "Current fee"}</dt>
                  <dd>
                    {Number(quote.data?.feeBps ?? fee) / 100}%
                    {quotedFee !== undefined
                      ? ` · ${formatUnits(quotedFee)} SOL`
                      : ""}
                  </dd>
                </div>
                {buy && quote.data?.consumed && (
                  <div>
                    <dt>Estimated spend</dt>
                    <dd>{formatUnits(quote.data.consumed)} SOL</dd>
                  </div>
                )}
                <div>
                  <dt>Network costs</dt>
                  <dd>Shown in wallet</dd>
                </div>
              </dl>
            </div>
            {buy && fee > 100n && (
              <p className="launch-warning">
                Sniper protection is active. The buy fee falls to 1% in{" "}
                {Math.max(0, Math.ceil(m.launchedAt + 60 - now))} seconds.
              </p>
            )}
            {quote.isError && raw > 0n && (
              <p role="alert" className="form-error">
                {quote.error.message}
              </p>
            )}
            <button
              className="market-primary trade-submit"
              type={wallet.account ? "submit" : "button"}
              onClick={
                !wallet.account
                  ? () =>
                      window.dispatchEvent(new Event("waffles:connect-wallet"))
                  : undefined
              }
              disabled={
                tx.pending ||
                Boolean(
                  wallet.account &&
                    (!quote.data ||
                      raw <= 0n ||
                      slippageBps === null ||
                      overBalance),
                )
              }
            >
              {tx.pending
                ? tx.label
                : !wallet.account
                  ? "Connect wallet to trade"
                  : `${buy ? "Buy" : "Sell"} ${m.symbol}`}
            </button>
          </form>
        )}
        <TransactionNotice
          error={error || tx.error}
          signature={tx.signature}
          phase={tx.phase}
        />
        <p className="ux-muted-note">
          Trading fees: 40% creator · 20% raffle · 40% platform. Quotes can
          change before execution.
        </p>
      </section>
      <CreatorSnapshot
        market={m}
        commitments={commitments}
        failed={commitmentsError}
        now={now}
      />
    </aside>
  );
}
