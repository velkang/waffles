'use client';

import { useState } from 'react';
import type { RewardClaim } from '@waffles/shared';
import { usePublicClient, useWriteContract } from 'wagmi';
import { REWARDS_DISTRIBUTOR_ADDRESS } from '@/lib/config';
import { formatUsdc } from '@/lib/rewards';
import { rewardsDistributorAbi, type Hex } from '@/lib/rewards-contract';

interface ClaimButtonProps {
  claim: RewardClaim;
  onClaimed: () => void;
}

export function ClaimButton({ claim, onClaimed }: ClaimButtonProps) {
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [error, setError] = useState<string | null>(null);
  const configured = /^0x[0-9a-fA-F]{40}$/.test(REWARDS_DISTRIBUTOR_ADDRESS);

  async function submit() {
    if (!configured || !publicClient) return;

    setError(null);
    try {
      const hash = await writeContractAsync({
        address: REWARDS_DISTRIBUTOR_ADDRESS,
        abi: rewardsDistributorAbi,
        functionName: 'claim',
        args: [
          BigInt(claim.epochId),
          BigInt(claim.prizeUsdc),
          claim.merkleProof as Hex[],
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      onClaimed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.split('\n')[0] : 'Claim failed');
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={submit}
        disabled={!configured || isPending}
        title={!configured ? 'Rewards distributor is not configured' : undefined}
        className="rounded-[6px] bg-[#db9d6a] px-4 py-2 text-xs font-black text-[#0e0f12] transition-colors hover:bg-[#e5ab7a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fafafa] disabled:cursor-not-allowed disabled:bg-[#514237] disabled:text-zinc-500"
      >
        {isPending ? 'Confirming…' : `Claim ${formatUsdc(claim.prizeUsdc)}`}
      </button>
      {error ? <p className="mt-1 max-w-56 text-[11px] text-red-300">{error}</p> : null}
    </div>
  );
}
