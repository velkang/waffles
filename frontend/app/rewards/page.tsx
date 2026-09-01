'use client';

import { useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ClaimStrip } from '@/components/rewards/ClaimStrip';
import { LeaderboardTable } from '@/components/rewards/LeaderboardTable';
import { RewardsHero } from '@/components/rewards/RewardsHero';
import { VerifiedDraws } from '@/components/rewards/VerifiedDraws';
import {
  useCurrentRewards,
  useRewardClaims,
  useRewardsLeaderboard,
} from '@/lib/hooks/queries';

export default function RewardsPage() {
  const { address } = useAccount();
  const current = useCurrentRewards(address);
  const leaderboard = useRewardsLeaderboard(100);
  const claims = useRewardClaims(address);
  const refetchClaims = claims.refetch;
  const refreshClaims = useCallback(() => {
    void refetchClaims();
  }, [refetchClaims]);

  return (
    <div className="space-y-8" data-direction-seed="5668cc8a">
      <RewardsHero
        address={address}
        data={current.data}
        loading={current.isLoading}
        error={current.isError ? current.error.message : null}
      />

      {address && (claims.data?.claims.length || claims.isLoading) ? (
        <ClaimStrip
          claims={claims.data?.claims ?? []}
          loading={claims.isLoading}
          onRefresh={refreshClaims}
        />
      ) : null}

      <LeaderboardTable
        rows={leaderboard.data?.leaderboard ?? []}
        loading={leaderboard.isLoading}
        error={leaderboard.isError ? leaderboard.error.message : null}
        connectedAddress={address}
      />

      <VerifiedDraws />

      <section className="border-t border-[#24262e] pt-6 text-sm text-zinc-400">
        <p className="max-w-[72ch] leading-6">
          Buys and sells on the bonding curve and graduated Waffles AMM count. Tickets reset every
          Monday at 00:00 UTC; claims do not expire.
        </p>
      </section>
    </div>
  );
}
