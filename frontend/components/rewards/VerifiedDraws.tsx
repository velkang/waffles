'use client';

import { useState } from 'react';
import { useRewardsEpochs } from '@/lib/hooks/queries';
import { formatDate, formatUsdc } from '@/lib/rewards';
import { EmptyState, PanelError, PanelLoading } from './PanelStates';

export function VerifiedDraws() {
  const [open, setOpen] = useState(false);
  const epochs = useRewardsEpochs(20, open);

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#24262e] bg-[#141519]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="verified-draw-history"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-6 p-5 text-left transition-colors hover:bg-[#18191e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#db9d6a] sm:p-6"
      >
        <span>
          <span className="block text-lg font-bold text-white">Verified draws</span>
          <span className="mt-1 block text-sm text-zinc-500">
            Inspect finalized pools, public randomness, and on-chain transactions.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-[#db9d6a]">
          {open ? 'Hide history' : 'View history'}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={`size-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              d="m5 7.5 5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div id="verified-draw-history" className="border-t border-[#24262e]">
          {epochs.isLoading ? (
            <div className="p-6">
              <PanelLoading lines={6} />
            </div>
          ) : epochs.isError ? (
            <div className="p-6">
              <PanelError title="History unavailable" message={epochs.error.message} />
            </div>
          ) : !epochs.data?.epochs.length ? (
            <EmptyState
              title="No finalized draws"
              message="The first verified epoch will appear here after its root confirms on Arc."
            />
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3">
              {epochs.data.epochs.map((epoch) => (
                <article
                  key={epoch.epochId}
                  className="border-b border-[#24262e] p-5 md:border-r xl:[&:nth-child(3n)]:border-r-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-white">Epoch {epoch.epochId}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{formatDate(epoch.endAt)}</p>
                    </div>
                    <span className="rounded-full bg-[#14291e] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4ade80]">
                      Verified
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Pool</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#db9d6a]">
                        {formatUsdc(epoch.totalPoolUsdc)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">Drand</div>
                      <div className="mt-1 font-mono text-xs text-zinc-300">
                        #{epoch.drandRound ?? '—'}
                      </div>
                    </div>
                  </div>
                  {epoch.transactionHash ? (
                    <a
                      href={`https://testnet.arcscan.app/tx/${epoch.transactionHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex text-xs font-semibold text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-white"
                    >
                      View finalization transaction
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
