import { memo } from 'react';
import type { RewardsLeaderboardRow } from '@waffles/shared';
import { formatUsdc, relativeTime, shortAddress } from '@/lib/rewards';
import { EmptyState, PanelError, PanelLoading } from './PanelStates';

interface LeaderboardTableProps {
  rows: RewardsLeaderboardRow[];
  loading: boolean;
  error: string | null;
  connectedAddress?: string;
}

export const LeaderboardTable = memo(function LeaderboardTable({
  rows,
  loading,
  error,
  connectedAddress,
}: LeaderboardTableProps) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.02em] text-white">Ticket floor</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Live standings. Final eligibility is frozen at epoch close.
          </p>
        </div>
        <span className="hidden text-xs font-semibold text-zinc-500 sm:block">Top 100</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-[12px] border border-[#24262e] bg-[#141519]">
        {loading ? (
          <div className="p-6">
            <PanelLoading lines={8} />
          </div>
        ) : error ? (
          <div className="p-6">
            <PanelError title="Leaderboard unavailable" message={error} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No tickets yet"
            message="Eligible trading volume will appear here as soon as the indexer records it."
          />
        ) : (
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="border-b border-[#24262e] bg-[#101114] text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Tickets</th>
                <th className="px-4 py-3 text-right">Share</th>
                <th className="px-4 py-3 text-right">Last trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#24262e]">
              {rows.map((row) => {
                const mine = connectedAddress?.toLowerCase() === row.trader.toLowerCase();

                return (
                  <tr
                    key={row.trader}
                    className={
                      mine ? 'bg-[#211910] text-white' : 'text-zinc-300 hover:bg-[#18191e]'
                    }
                  >
                    <td className="px-4 py-3 font-mono font-bold text-[#db9d6a]">{row.rank}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {shortAddress(row.trader)}
                      {mine ? (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#db9d6a]">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatUsdc(row.volumeUsdc)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-white">
                      {BigInt(row.tickets).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {(row.ticketShareBps / 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-500">
                      {row.lastTradeAt ? relativeTime(row.lastTradeAt) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
});
