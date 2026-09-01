import { memo } from 'react';
import type { RewardClaim } from '@waffles/shared';
import { ClaimButton } from './ClaimButton';

interface ClaimStripProps {
  claims: RewardClaim[];
  loading: boolean;
  onRefresh: () => void;
}

export const ClaimStrip = memo(function ClaimStrip({
  claims,
  loading,
  onRefresh,
}: ClaimStripProps) {
  const unclaimed = claims.filter((claim) => !claim.claimed);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-[12px] bg-[#141519]" />;
  }
  if (unclaimed.length === 0) return null;

  return (
    <section className="rounded-[12px] border border-[#3b2718] bg-[#211910] p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <h2 className="text-lg font-bold text-white">Rewards ready to claim</h2>
        <p className="mt-1 text-sm text-[#cdb49e]">
          {unclaimed.length} verified {unclaimed.length === 1 ? 'prize' : 'prizes'} from finalized
          draws.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
        {unclaimed.map((claim) => (
          <ClaimButton key={claim.epochId} claim={claim} onClaimed={onRefresh} />
        ))}
      </div>
    </section>
  );
});
