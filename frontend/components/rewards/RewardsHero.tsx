import { memo } from 'react';
import type { RewardsCurrentResponse } from '@waffles/shared';
import { useCountdown } from '@/lib/hooks/use-countdown';
import { formatUsdc, progressBetween } from '@/lib/rewards';
import { PersonalPosition } from './PersonalPosition';

interface RewardsHeroProps {
  address?: string;
  data?: RewardsCurrentResponse;
  loading: boolean;
  error: string | null;
}

export const RewardsHero = memo(function RewardsHero({
  address,
  data,
  loading,
  error,
}: RewardsHeroProps) {
  const countdown = useCountdown(data?.endAt);
  const weekProgress = data ? progressBetween(data.startAt, data.endAt) : 0;

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#2f302f] bg-[#141519]">
      <div className="grid lg:grid-cols-[1.45fr_0.55fr]">
        <div className="relative min-h-[310px] p-6 sm:p-9">
          <div className="mt-10 max-w-3xl">
            <h1 className="text-balance text-3xl font-black tracking-[-0.03em] text-white sm:text-5xl">
              Trade this week. Every $1,000 earns a ticket.
            </h1>
            <p className="mt-4 max-w-[68ch] text-sm leading-6 text-zinc-400 sm:text-base">
              Twenty unique wallets share the USDC pool. The draw is replayable from the frozen
              trade snapshot and the first verified Drand round after close.
            </p>
          </div>

          <div className="mt-9 flex flex-wrap items-end gap-x-10 gap-y-6">
            <div>
              <div className="text-xs font-semibold text-zinc-500">Current pool</div>
              <div className="mt-1 font-mono text-4xl font-black tabular-nums text-[#db9d6a] sm:text-6xl">
                {loading ? '—' : formatUsdc(data?.totalPoolUsdc)}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500">Closes in</div>
              <div className="mt-2 flex gap-2" aria-label={countdown.label}>
                {countdown.parts.map((part) => (
                  <div
                    key={part.label}
                    className="min-w-12 rounded-[6px] border border-[#2f302f] bg-[#0e0f12] px-2 py-2 text-center"
                  >
                    <div className="font-mono text-lg font-black tabular-nums text-white sm:text-2xl">
                      {part.value}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                      {part.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#24262e] bg-[#101114] p-6 sm:p-8 lg:border-l lg:border-t-0">
          <PersonalPosition
            address={address}
            loading={loading}
            error={error}
            user={data?.user ?? null}
            threshold={data?.ticketThresholdUsdc ?? 1_000}
            totalTickets={data?.totalTickets ?? '0'}
          />
        </div>
      </div>
      <div className="h-1 bg-[#1a1b21]" aria-hidden="true">
        <div
          className="h-full bg-[#db9d6a] transition-[width] duration-700 ease-out"
          style={{ width: `${weekProgress}%` }}
        />
      </div>
    </section>
  );
});
