import { memo } from 'react';
import type { RewardsUserPosition } from '@waffles/shared';
import { formatUsdc, shortAddress } from '@/lib/rewards';
import { PanelError, PanelLoading } from './PanelStates';

interface PersonalPositionProps {
  address?: string;
  loading: boolean;
  error: string | null;
  user: RewardsUserPosition | null;
  threshold: number;
  totalTickets: string;
}

export const PersonalPosition = memo(function PersonalPosition({
  address,
  loading,
  error,
  user,
  threshold,
  totalTickets,
}: PersonalPositionProps) {
  if (!address) {
    return (
      <div className="flex h-full min-h-56 flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Your place on the floor</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Connect a wallet to see ticket progress, live rank, and claimable rewards.
          </p>
        </div>
        <div className="mt-8 border-t border-[#24262e] pt-5 text-xs text-zinc-500">
          Wallet controls are available in the top navigation.
        </div>
      </div>
    );
  }

  if (loading) return <PanelLoading lines={5} />;
  if (error) return <PanelError title="Position unavailable" message={error} />;

  const volume = BigInt(user?.volumeUsdc ?? '0');
  const thresholdUnits = BigInt(Math.max(1, threshold)) * 1_000_000n;
  const progress = Number(((volume % thresholdUnits) * 10_000n) / thresholdUnits) / 100;
  const tickets = BigInt(user?.tickets ?? '0');
  const total = BigInt(totalTickets);
  const share = total > 0n ? Number((tickets * 10_000n) / total) / 100 : 0;
  const metrics = [
    { label: 'Tickets', value: tickets.toLocaleString() },
    { label: 'Ticket share', value: `${share.toFixed(2)}%` },
    { label: 'Weekly volume', value: formatUsdc(user?.volumeUsdc) },
    { label: 'Next ticket', value: formatUsdc(user?.volumeToNextTicketUsdc) },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Your place on the floor</h2>
          <p className="mt-1 font-mono text-xs text-zinc-500">{shortAddress(address)}</p>
        </div>
        <span className="font-mono text-sm font-bold text-[#db9d6a]">
          {user?.rank ? `#${user.rank}` : 'Unranked'}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 border-y border-[#24262e] py-5">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              {metric.label}
            </div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Progress to next ticket</span>
          <span className="font-mono tabular-nums">{progress.toFixed(1)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#24262e]">
          <div
            className="h-full rounded-full bg-[#db9d6a]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
});
