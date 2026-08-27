"use client";

import { useEffect, useRef, useState } from "react";
import { formatToken, formatUsd, shortAddress } from "@/lib/format";

type Trade = {
  trader: string;
  isBuy: boolean;
  usdcAmount: string;
  tokenAmount: string;
  mcapAfter: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: string;
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function TradeFeed({ token }: { token: `0x${string}` }) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [offline, setOffline] = useState(false);
  const seenTx = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let first = true;

    async function poll() {
      try {
        const res = await fetch(`/api/trades?token=${token}&limit=50`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { trades: Trade[] };
        if (cancelled) return;
        data.trades.forEach((t) => seenTx.current.add(`${t.txHash}-${t.logIndex}`));
        setTrades(data.trades);
        setOffline(false);
        first = false;
      } catch {
        if (!cancelled && first) setOffline(true);
      }
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  if (offline) {
    return (
      <section
        aria-label="Trade History"
        className="rounded-[10px] border border-dashed border-[#24262e] p-6 text-center text-xs font-mono text-zinc-500 bg-[#141519]"
      >
        Live trade stream offline • Indexer multicall fallback active
      </section>
    );
  }

  return (
    <section
      aria-label="Trade History"
      className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4 overflow-hidden"
    >
      <div className="mb-2.5 flex items-center justify-between font-mono">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Live Trade Stream
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-[#4ade80] font-bold">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          ACTIVE
        </span>
      </div>

      {trades === null ? (
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-[4px] bg-[#1a1b21]" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="py-6 text-center text-xs font-mono text-zinc-500">
          No trades recorded yet • Be the first to trade
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#24262e] text-[10px] font-bold uppercase text-zinc-500">
                <th className="pb-1.5 pl-1">TYPE</th>
                <th className="pb-1.5">ACCOUNT</th>
                <th className="pb-1.5 text-right">USDC</th>
                <th className="pb-1.5 text-right">TOKENS</th>
                <th className="pb-1.5 pr-1 text-right">TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1b22]">
              {trades.map((t) => (
                <tr
                  key={`${t.txHash}-${t.logIndex}`}
                  className="transition-colors hover:bg-[#1a1b21]"
                >
                  <td className="py-2 pl-1">
                    <span
                      className={`inline-flex items-center rounded-[3px] px-1.5 py-0.2 text-[9px] font-bold ${
                        t.isBuy
                          ? "bg-[#14291e] text-[#4ade80] border border-[#4ade80]/40"
                          : "bg-[#2b1114] text-[#ef4444] border border-[#ef4444]/40"
                      }`}
                    >
                      {t.isBuy ? "BUY" : "SELL"}
                    </span>
                  </td>
                  <td className="py-2">
                    <a
                      href={`https://testnet.arcscan.app/tx/${t.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      {shortAddress(t.trader)} ↗
                    </a>
                  </td>
                  <td
                    className={`py-2 text-right font-bold ${
                      t.isBuy ? "text-[#4ade80]" : "text-[#ef4444]"
                    }`}
                  >
                    {formatUsd(BigInt(t.usdcAmount))}
                  </td>
                  <td className="py-2 text-right text-zinc-300">
                    {formatToken(BigInt(t.tokenAmount))}
                  </td>
                  <td className="py-2 pr-1 text-right text-zinc-500">
                    {timeAgo(t.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
