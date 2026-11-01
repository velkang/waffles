import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  type UTCTimestamp,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { api, request } from "../api";
import {
  formatUnits,
  INITIAL_TOKENS,
  CURVE_TOKENS,
} from "@waffles/shared/solana";
import { TradePanel } from "../trade";
import { supplyPercentage } from "../ux";
import { chartPalette, useTheme } from "../theme";
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
          <section id="creator-commitments" className="analytics-panel">
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
                {m.feeCliff > Date.now() / 1000
                  ? "Future fee commitment"
                  : "Completed fee allocation"}
                : {m.routing.locked / 100}% until {dateTime(m.feeCliff)}. After
                that, this portion becomes direct payout.
              </p>
            )}
            {commitments.isPending ? (
              <p role="status">Loading creator commitments…</p>
            ) : commitments.isError ? (
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
                            {supplyPercentage(c.amount, m.supply)} of current
                            supply · Spot estimate:{" "}
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
            {trades.isPending ? (
              <p role="status">Loading recent trades…</p>
            ) : trades.isError ? (
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
        <TradePanel
          market={m}
          commitments={commitments.data?.commitments}
          commitmentsError={commitments.isError}
        />
      </div>
    </div>
  );
}
function Chart({ mint }: { mint: string }) {
  const { theme } = useTheme();
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
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
    const colors = chartPalette();
    const chart = createChart(element, {
      height: 340,
      width: element.clientWidth,
      layout: {
        background: { type: ColorType.Solid, color: colors.surface },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.line },
        horzLines: { color: colors.line },
      },
      timeScale: { timeVisible: true },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceFormat: { type: "price", precision: 10, minMove: 0.0000000001 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
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
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [query.data]);
  useEffect(() => {
    const colors = chartPalette();
    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.surface },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.line },
        horzLines: { color: colors.line },
      },
    });
    seriesRef.current?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  }, [theme]);
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
