'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { LaunchSort, LaunchSummary } from '@waffles/shared';
import { formatUsd, shortAddress } from '@/lib/format';
import { getOptimizedImageUrl } from '@/lib/image';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useExploreLaunches } from '@/lib/hooks/queries';

const VIEWS: { id: LaunchSort; label: string; description: string }[] = [
  { id: 'trending', label: 'Trending · 1h', description: 'Ranked by unique trading wallets in the last hour, then USDC volume. Buys and sells both count.' },
  { id: 'new', label: 'New launches', description: 'The latest launches on Arc, newest first.' },
  { id: 'graduating', label: 'Near graduation', description: 'Open curves ordered by the share of their available tokens purchased. Progress can fall when holders sell.' },
  { id: 'graduated', label: 'Graduated', description: 'Tokens that completed their curve and moved to pool trading, ordered by market cap.' },
  { id: 'volume', label: '24h volume', description: 'The most traded tokens by gross USDC volume over the last 24 hours.' },
];

export default function ExplorePage() {
  const [sort, setSort] = useState<LaunchSort>('trending');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const query = useExploreLaunches(sort);
  const tokens = query.data?.launches ?? [];
  const selected = VIEWS.find((item) => item.id === sort)!;

  return (
    <div className="market-page">
      <div className="market-heading">
        <div><h1>Explore</h1><p>Find your next coin. Every market, in USDC.</p></div>
        <Link href="/create" className="market-primary">Create a coin</Link>
      </div>
      <div className="market-toolbar">
        <div className="market-tabs" aria-label="Discover tokens">
          {VIEWS.map((item) => <button key={item.id} aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}
        </div>
        <div className="market-segment" aria-label="Display tokens">
          <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Cards</button>
          <button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </div>
      </div>
      <div className="market-caption"><p>{selected.description}</p><span>Updates every 30s</span></div>
      {query.isError ? <div className="market-empty" role="alert"><h2>Markets couldn’t be loaded</h2><p>Please try again to retrieve the latest activity.</p><button className="market-button" onClick={() => void query.refetch()}>Try again</button></div>
        : query.isLoading ? <div className="token-grid" aria-label="Loading markets" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div className="token-skeleton" key={i} />)}</div>
        : !tokens.length ? <div className="market-empty"><h2>{sort === 'trending' ? 'A quiet hour on the market' : 'No coins here yet'}</h2><p>{sort === 'trending' ? 'Coins appear here when wallets trade. Explore new launches while activity builds.' : 'This view will fill as tokens launch and move through their curves.'}</p><button className="market-button" onClick={() => setSort('new')}>Browse new launches</button></div>
        : view === 'grid' ? <div className="token-grid">{tokens.map((token) => <TokenCard key={token.token} token={token} asOf={query.dataUpdatedAt} />)}</div>
        : <div className="market-table-wrap"><table className="market-table"><thead><tr><th>Coin</th><th>Market cap</th><th>1h volume</th><th>1h wallets</th><th>24h volume</th><th>Curve progress</th></tr></thead><tbody>{tokens.map((token) => <tr key={token.token}>
          <td><Link className="market-identity" href={`/token/${token.token}`}><TokenImage token={token} /><span>{token.name}<small>${token.symbol}</small></span></Link></td>
          <td>{formatUsd(BigInt(token.mcap))}</td><td>{formatUsd(BigInt(token.volume1h ?? '0'))}</td><td>{token.traders1h ?? 0}</td><td>{formatUsd(BigInt(token.volume24h))}</td>
          <td>{token.graduated ? <span className="market-success">Graduated</span> : <div className="table-progress"><span>{(token.progressBps / 100).toFixed(1)}%</span><ProgressBar progress={token.progressBps / 100} size="sm" showTicks={false} /></div>}</td>
        </tr>)}</tbody></table></div>}
      <p className="market-footnote">Showing up to 60 coins per view. Activity ranks are not quality ratings. Wallet counts represent addresses, not people.</p>
    </div>
  );
}

function TokenImage({ token }: { token: LaunchSummary }) {
  return token.imageUri ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={getOptimizedImageUrl(token.imageUri, { width: 400, height: 400, quality: 75 })} alt="" loading="lazy" />
  ) : <span className="token-image-fallback">{token.symbol.slice(0, 3)}</span>;
}

function TokenCard({ token, asOf }: { token: LaunchSummary; asOf: number }) {
  const volume = BigInt(token.volume1h ?? '0');
  const previous = BigInt(token.previousVolume1h ?? '0');
  const change = previous > 0n ? Number((volume - previous) * 1000n / previous) / 10 : null;
  const age = token.createdAt ? Math.max(0, Math.floor((asOf - Date.parse(token.createdAt)) / 60000)) : null;
  return <Link href={`/token/${token.token}`} className="token-card">
    <div className="token-art"><TokenImage token={token} />{token.graduated && <span className="token-state">Graduated</span>}</div>
    <div className="token-card-body">
      <div className="token-name"><h2>{token.name}</h2><span>${token.symbol}</span></div>
      <div className="token-value">{formatUsd(BigInt(token.mcap))}<span>market cap</span></div>
      <div className="token-activity"><span><strong>{formatUsd(volume)}</strong> 1h volume</span><span><strong>{token.traders1h ?? 0}</strong> wallets</span></div>
      <p className="token-momentum">{change === null ? volume > 0n ? 'New activity this hour' : 'No trades this hour' : `${change > 0 ? '+' : ''}${change.toLocaleString()}% volume vs previous hour`}</p>
      <div className="token-progress">{token.graduated ? <span className="market-success">Trading in pool</span> : <><div><span>Curve progress</span><strong>{(token.progressBps / 100).toFixed(1)}%</strong></div><ProgressBar progress={token.progressBps / 100} size="sm" showTicks={false} /></>}</div>
      <div className="token-meta"><span title={`Creator ${token.creator}`}>{shortAddress(token.creator)}</span><span>{age === null ? 'Age unavailable' : age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`}</span></div>
    </div>
  </Link>;
}
