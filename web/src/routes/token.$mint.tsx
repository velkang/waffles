import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import { api, request } from "../api";
import {
  formatUnits,
  parseUnits,
  buyFeeBps,
  INITIAL_TOKENS,
  CURVE_TOKENS,
  type Market,
} from "@waffles/shared/solana";
import { useTransaction } from "../transaction";
import {
  AddressLink,
  dateTime,
  TransactionNotice,
  CreatorEarnings,
} from "../components";
export const Route = createFileRoute("/token/$mint")({ component: Token });
function Token() {
  const { mint } = Route.useParams();
  const query = useQuery({
    queryKey: ["market", mint],
    queryFn: () => api.market(mint),
    refetchInterval: 15_000,
  });
  const trades = useQuery({
    queryKey: ["trades", mint],
    queryFn: () => api.trades(mint),
  });
  const commitments = useQuery({
    queryKey: ["commitments", mint],
    queryFn: () => api.commitments(mint),
  });
  if (query.isPending)
    return (
      <div className="market-empty" aria-busy="true">
        Loading market…
      </div>
    );
  if (query.isError)
    return (
      <div className="market-empty" role="alert">
        <h1>Market unavailable</h1>
        <p>{query.error.message}</p>
        <button className="market-button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  const m = query.data.launch;
  if (!m)
    return (
      <div className="market-empty">
        <h1>Token not indexed</h1>
        <p>A newly created token appears after its transaction finalizes.</p>
        <button className="market-button" onClick={() => void query.refetch()}>
          Check again
        </button>
      </div>
    );
  const progress =
    m.state !== "curve"
      ? 100
      : Number(
          ((INITIAL_TOKENS - BigInt(m.tokenReserve)) * 10000n) / CURVE_TOKENS,
        ) / 100;
  return (
    <div className="token-detail-page">
      <section className="token-detail-header">
        <div className="token-detail-identity">
          {m.imageUri ? (
            <img className="token-detail-image" src={m.imageUri} alt="" />
          ) : (
            <div className="token-detail-image token-detail-image-fallback">
              {m.symbol.slice(0, 3)}
            </div>
          )}
          <div className="token-detail-name">
            <h1>{m.name}</h1>
            <p>
              ${m.symbol} ·{" "}
              {m.state === "pool"
                ? "Trading in pool"
                : m.state === "complete"
                  ? "Graduation pending"
                  : "Bonding curve"}
            </p>
          </div>
        </div>
        <dl className="token-detail-stats">
          <div>
            <dt>Market cap</dt>
            <dd>
              {formatUnits(
                (BigInt(m.solReserve) * BigInt(m.supply)) /
                  BigInt(m.tokenReserve),
              )}{" "}
              SOL
            </dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>{formatUnits(m.volumeSol)} SOL</dd>
          </div>
          <div>
            <dt>Curve progress</dt>
            <dd>{progress.toFixed(1)}%</dd>
          </div>
        </dl>
        <AddressLink address={mint} />
      </section>
      <div className="token-layout">
        <div>
          <Chart mint={mint} />
          <section className="analytics-panel">
            <h2>Creator commitments</h2>
            <p>{m.description}</p>
            <p>
              Creator: <AddressLink address={m.creator} />
            </p>
            <dl className="analytics-fees">
              {Object.entries(m.routing).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {
                      (
                        {
                          direct: "Direct payout",
                          locked: "Locked earnings",
                          holders: "Holder rewards",
                          buyback: "Buyback and burn",
                        } as Record<string, string>
                      )[key]
                    }
                  </dt>
                  <dd>{value / 100}% of creator share</dd>
                </div>
              ))}
            </dl>
            <CreatorEarnings mint={m.mint} />
            <p>
              First-day holding checkpoint:{" "}
              {query.data.holdingCheckpoint
                ? `${dateTime(query.data.holdingCheckpoint.at)} · ${query.data.holdingCheckpoint.completed ? "Measured from finalized history" : "Awaiting finalized measurement"}`
                : "Not indexed yet"}
            </p>
            {m.routing.locked > 0 && (
              <p>
                Future fee commitment: {m.routing.locked / 100}% until{" "}
                {dateTime(m.feeCliff)}. After that, this portion becomes direct
                payout.
              </p>
            )}
            {commitments.isError ? (
              <p role="alert">Commitments could not be loaded.</p>
            ) : commitments.data?.commitments.length ? (
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Locked amount</th>
                    <th>Unlock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.data.commitments.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.asset === "sol"
                          ? "SOL earnings"
                          : "Purchased tokens"}
                      </td>
                      <td>
                        {formatUnits(
                          c.withdrawn ? "0" : c.amount,
                          c.asset === "sol" ? 9 : 6,
                        )}
                        {c.asset === "token" && !c.withdrawn && (
                          <small>
                            {Number(
                              (BigInt(c.amount) * 10000n) / BigInt(m.supply),
                            ) / 100}
                            % of current supply · Spot estimate:{" "}
                            {formatUnits(
                              (BigInt(c.amount) * BigInt(m.solReserve)) /
                                BigInt(m.tokenReserve),
                            )}{" "}
                            SOL
                          </small>
                        )}
                        {c.purchaseCost && c.asset === "token" && (
                          <small>
                            Original cost: {formatUnits(c.purchaseCost)} SOL
                          </small>
                        )}
                      </td>
                      <td>{dateTime(c.unlockAt)}</td>
                      <td>
                        {c.withdrawn
                          ? "Withdrawn"
                          : c.unlockAt > Date.now() / 1000
                            ? "Locked"
                            : "Available to withdraw"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>
                No funded token or earned-fee locks indexed. Future fee promises
                are shown separately above.
              </p>
            )}
            <p className="market-footnote">
              Commitments do not guarantee token value. This devnet program
              remains upgradeable.
            </p>
          </section>
          <section className="analytics-panel">
            <h2>Recent trades</h2>
            {trades.isError ? (
              <p role="alert">Trade history unavailable.</p>
            ) : trades.data?.trades.length ? (
              <div className="market-table-wrap">
                <table className="market-table">
                  <thead>
                    <tr>
                      <th>Wallet</th>
                      <th>Side</th>
                      <th>SOL volume</th>
                      <th>Tokens</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.data.trades.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <AddressLink address={t.trader} />
                        </td>
                        <td
                          className={
                            t.side === "buy" ? "form-success" : "form-error"
                          }
                        >
                          {t.side}
                        </td>
                        <td>{formatUnits(t.grossSol)}</td>
                        <td>{formatUnits(t.tokens, 6, 2)}</td>
                        <td>
                          <a
                            href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Finalized trades will appear here.</p>
            )}
          </section>
        </div>
        <Trade market={m} />
      </div>
    </div>
  );
}
function Trade({ market: m }: { market: Market }) {
  const tx = useTransaction();
  const [buy, setBuy] = useState(true),
    [amount, setAmount] = useState(""),
    [slippage, setSlippage] = useState("1"),
    [now, setNow] = useState(Date.now() / 1000),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);
  let raw = 0n;
  try {
    if (amount) raw = parseUnits(amount, buy ? 9 : 6);
  } catch {}
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
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (slippageBps === null)
        throw new Error("Choose slippage between 0% and 5%");
      if (!quote.data) throw new Error("Wait for a valid quote");
      await tx.send({
        action: "trade",
        mint: m.mint,
        buy,
        amount: raw.toString(),
        minOut: (
          (BigInt(quote.data.output) * (10000n - slippageBps)) /
          10000n
        ).toString(),
      });
    } catch (e) {
      setError(String(e));
    }
  }
  const fee = buy ? buyFeeBps(m.launchedAt, now) : 100n;
  return (
    <aside className="trade-form analytics-panel">
      <h2>{m.state === "complete" ? "Graduation pending" : "Trade"}</h2>
      {m.state === "complete" ? (
        <>
          <p>
            The curve is complete. Anyone can retry migration to its permanent
            pool.
          </p>
          <button
            className="market-primary"
            disabled={tx.pending}
            onClick={() => void tx.send({ action: "graduate", mint: m.mint })}
          >
            Complete graduation
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="market-segment">
            <button
              type="button"
              aria-pressed={buy}
              onClick={() => {
                setBuy(true);
                setAmount("");
              }}
            >
              Buy
            </button>
            <button
              type="button"
              aria-pressed={!buy}
              onClick={() => {
                setBuy(false);
                setAmount("");
              }}
            >
              Sell
            </button>
          </div>
          <label className="field">
            Amount in {buy ? "SOL" : m.symbol}
            <input
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="field">
            Slippage tolerance %
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </label>
          <dl className="analytics-fees">
            <div>
              <dt>Current trading fee</dt>
              <dd>{Number(fee) / 100}%</dd>
            </div>
            <div>
              <dt>Estimated received</dt>
              <dd>
                {quote.data
                  ? formatUnits(quote.data.output, buy ? 6 : 9, buy ? 6 : 9)
                  : "—"}{" "}
                {buy ? m.symbol : "SOL"}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>
                {quote.data && slippageBps !== null
                  ? formatUnits(
                      (BigInt(quote.data.output) * (10000n - slippageBps)) /
                        10000n,
                      buy ? 6 : 9,
                      buy ? 6 : 9,
                    )
                  : "—"}{" "}
                {buy ? m.symbol : "SOL"}
              </dd>
            </div>
          </dl>
          {buy && fee > 100n && (
            <p className="launch-warning">
              Launch protection: the buy fee falls to 1% in{" "}
              {Math.max(0, Math.ceil(m.launchedAt + 60 - now))} seconds.
            </p>
          )}
          {quote.isError && (
            <p role="alert" className="form-error">
              {quote.error.message}
            </p>
          )}
          <button
            className="market-primary"
            type="submit"
            disabled={tx.pending || !quote.data || raw <= 0n}
          >
            {tx.pending
              ? "Confirm in your wallet…"
              : buy
                ? "Buy token"
                : "Sell token"}
          </button>
        </form>
      )}
      <TransactionNotice error={error || tx.error} signature={tx.signature} />
      <p className="market-footnote">
        Fees split 40% creator, 20% raffle, 40% platform. Network costs are
        additional. Quotes may change before execution.
      </p>
    </aside>
  );
}
function Chart({ mint }: { mint: string }) {
  const query = useQuery({
    queryKey: ["candles", mint],
    queryFn: () =>
      request<{
        candles: {
          time: number;
          open: string;
          high: string;
          low: string;
          close: string;
        }[];
        truncated: boolean;
      }>(`/v1/candles?token=${mint}`),
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !query.data?.candles.length) return;
    const element = ref.current;
    const chart = createChart(element, {
      height: 340,
      width: element.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: "#141519" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#24262e" },
        horzLines: { color: "#24262e" },
      },
      timeScale: { timeVisible: true },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#4ade80",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#4ade80",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: 10, minMove: 0.0000000001 },
    });
    series.setData(
      query.data.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: Number(c.open) / 1e18,
        high: Number(c.high) / 1e18,
        low: Number(c.low) / 1e18,
        close: Number(c.close) / 1e18,
      })),
    );
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() =>
      chart.applyOptions({ width: element.clientWidth }),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [query.data]);
  return (
    <section className="analytics-panel">
      <h2>Price · SOL</h2>
      {query.isError ? (
        <p role="alert">
          Chart history unavailable.{" "}
          <button
            className="market-button"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : query.data?.candles.length ? (
        <div ref={ref} aria-label="SOL price candlestick chart" role="img" />
      ) : (
        <div className="chart-empty">
          {query.isPending
            ? "Loading price history…"
            : "The first finalized trade will appear here."}
        </div>
      )}
      {query.data?.truncated && (
        <p className="market-footnote">Chart covers the latest 2,000 trades.</p>
      )}
    </section>
  );
}
