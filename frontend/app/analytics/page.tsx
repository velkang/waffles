'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AnalyticsRange, AnalyticsResponse } from '@waffles/shared';
import { useAnalytics } from '@/lib/hooks/queries';
import { formatUsd } from '@/lib/format';

const RANGES: { id: AnalyticsRange; label: string }[] = [{ id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: '30d', label: '30d' }, { id: 'all', label: 'All time' }];
const money = (value: string | null | undefined) => value == null ? '—' : formatUsd(BigInt(value));
function comparison(current: string | number | null, previous: string | number | null | undefined) {
  if (current === null || previous == null) return 'No comparison available';
  const a = BigInt(current); const b = BigInt(previous);
  if (b === 0n) return a > 0n ? 'New activity this period' : 'No activity in either period';
  const percent = Number((a - b) * 1000n / b) / 10;
  return `${percent > 0 ? '+' : ''}${percent.toLocaleString()}% vs previous period`;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('24h');
  const query = useAnalytics(range);
  const data = query.data;
  return <div className="market-page">
    <div className="market-heading"><div><h1>Analytics</h1><p>A closer look at the Waffles market.</p></div><Link href="/" className="market-button">Explore coins</Link></div>
    <div className="market-toolbar"><div className="market-segment" aria-label="Analytics period">{RANGES.map((item) => <button key={item.id} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div><span className="market-footnote" style={{ margin: 0 }}>All values in USDC · Times in UTC</span></div>
    {query.isError ? <div className="market-empty" role="alert"><h2>Analytics couldn’t be loaded</h2><p>Try again to retrieve indexed market activity.</p><button className="market-button" onClick={() => void query.refetch()}>Try again</button></div>
      : !data ? <div className="market-empty" aria-busy="true"><h2>Loading market activity…</h2><p>Gathering trades, launches, and fees.</p></div>
      : <>
        <dl className="analytics-metrics">{[
          { label: 'Trading volume', value: money(data.current.volume), current: data.current.volume, previous: data.previous?.volume },
          { label: 'Active wallets', value: data.current.wallets.toLocaleString(), current: data.current.wallets, previous: data.previous?.wallets },
          { label: 'New launches', value: data.current.launches.toLocaleString(), current: data.current.launches, previous: data.previous?.launches },
          { label: 'Trading fees', value: money(data.current.fees), current: data.current.fees, previous: data.previous?.fees },
        ].map((metric) => <div className="analytics-metric" key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd><p>{range === 'all' ? 'Across indexed history' : comparison(metric.current, metric.previous)}</p></div>)}</dl>
        <div className="analytics-charts">
          <section className="analytics-panel"><h2>Trading volume</h2><p>Activity on the curve and after graduation.</p><div className="analytics-legend"><span>Curve</span><span>Pool</span></div><ActivityChart data={data} mode="volume" /></section>
          <section className="analytics-panel"><h2>Launches & graduations</h2><p>{data.current.graduations.toLocaleString()} graduations during this period.</p><div className="analytics-legend"><span>Launches</span><span>Graduations</span></div><ActivityChart data={data} mode="launches" /></section>
        </div>
        <section className="analytics-section"><h2>Most traded</h2>{!data.markets.length ? <div className="market-empty"><h2>No trades in this period</h2><p>Markets will appear here after their first indexed trade.</p></div> : <div className="market-table-wrap"><table className="market-table"><thead><tr><th>Coin</th><th>Volume</th><th>Trading wallets</th><th>Market</th></tr></thead><tbody>{data.markets.map((market) => <tr key={market.token}><td><Link href={`/token/${market.token}`} className="market-identity"><span>{market.name}<small>${market.symbol}</small></span></Link></td><td>{money(market.volume)}</td><td>{market.wallets.toLocaleString()}</td><td>{market.graduated ? <span className="market-success">Pool</span> : 'Curve'}</td></tr>)}</tbody></table></div>}</section>
        <section className="analytics-section analytics-panel"><h2>Where trading fees go</h2><p>70% to creators, 25% to the platform, and the remainder to rewards. Allocations are calculated per trade using the contracts’ rounding.</p><dl className="analytics-fees"><div><dt>Creator fees</dt><dd>{money(data.current.creatorFees)}</dd></div><div><dt>Platform fees</dt><dd>{money(data.current.platformFees)}</dd></div><div><dt>Rewards allocation</dt><dd>{money(data.current.rewardsFees)}</dd></div></dl>{data.current.fees === null && <p>Some trades in this period have no indexed fee record. Fee totals are unavailable until those records are recovered.</p>}</section>
        <details className="analytics-details"><summary>How these numbers are calculated</summary><p>Volume counts gross USDC once per trade, including buys and sells. Active wallets are distinct trading addresses, not individual people. Graduations count events within the selected period; they are not a graduation rate. Fees represent trading allocations, not withdrawals or total platform revenue. Only launches belonging to the configured Waffles factory are included.</p><p>Periods are rolling windows ending at the snapshot time. Comparisons use the preceding equal-length window. Chart buckets begin at the period’s start; the final bucket may be partial. All-time charts group longer histories into larger intervals. Indexed activity can lag the chain, and missing history can understate totals.</p></details>
        <p className="market-footnote">Snapshot: {utc(data.asOf)} · Latest trade in period: {data.latestTradeAt ? utc(data.latestTradeAt) : 'None indexed'}<br />Refreshes every minute. Source: indexed Waffles contract events on Arc.</p>
      </>}
  </div>;
}

function utc(date: string) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(date)) + ' UTC'; }

function ActivityChart({ data, mode }: { data: AnalyticsResponse; mode: 'volume' | 'launches' }) {
  const rows = data.series.map((point) => ({ time: point.time,
    a: mode === 'volume' ? Number(point.curveVolume) / 1e6 : point.launches,
    b: mode === 'volume' ? Number(point.poolVolume) / 1e6 : point.graduations }));
  const max = Math.max(0, ...rows.map((row) => row.a + row.b));
  if (!max) return <div className="analytics-chart-empty">{mode === 'volume' ? 'No trading volume in this period.' : 'No launches or graduations in this period.'}</div>;
  const label = (n: number) => mode === 'volume' ? '$' + Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const width = 540; const height = 170; const left = 55; const step = (width - left) / rows.length;
  return <>
    <svg className="analytics-chart" viewBox="0 0 560 220" role="img" aria-label={mode === 'volume' ? 'Stacked trading volume by curve and pool. Exact values in the data table below.' : 'Launch and graduation event counts. Exact values in the data table below.'}>
      {[0, .5, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width} y1={height - fraction * 150} y2={height - fraction * 150} stroke="#303239" /><text x={left - 9} y={height - fraction * 150 + 4} fill="#a1a1aa" textAnchor="end" fontSize="11">{label(max * fraction)}</text></g>)}
      {rows.map((row, i) => <g key={row.time}><title>{utc(row.time)}: {mode === 'volume' ? 'Curve' : 'Launches'} {label(row.a)}, {mode === 'volume' ? 'Pool' : 'Graduations'} {label(row.b)}</title><rect x={left + i * step + 2} y={height - row.a / max * 150} width={Math.max(1, step - 4)} height={row.a / max * 150} fill="#db9d6a" /><rect x={left + i * step + 2} y={height - (row.a + row.b) / max * 150} width={Math.max(1, step - 4)} height={row.b / max * 150} fill="#818cf8" /></g>)}
      <text x={left} y="200" fill="#a1a1aa" fontSize="11">{utc(data.from)}</text><text x={width} y="200" fill="#a1a1aa" textAnchor="end" fontSize="11">{utc(data.asOf)}</text>
    </svg>
    <details className="analytics-details"><summary>View chart data</summary><div className="market-table-wrap"><table className="market-table"><thead><tr><th>Bucket start (UTC)</th><th>{mode === 'volume' ? 'Curve' : 'Launches'}</th><th>{mode === 'volume' ? 'Pool' : 'Graduations'}</th></tr></thead><tbody>{data.series.map((row) => <tr key={row.time}><td>{utc(row.time)}</td><td>{mode === 'volume' ? money(row.curveVolume) : row.launches}</td><td>{mode === 'volume' ? money(row.poolVolume) : row.graduations}</td></tr>)}</tbody></table></div></details>
  </>;
}
