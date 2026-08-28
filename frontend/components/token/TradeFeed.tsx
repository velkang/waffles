"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatToken, formatUsd, shortAddress } from "@/lib/format";

type Trade = {
  trader: string;
  isBuy: boolean;
  usdcAmount: string;
  tokenAmount: string;
  mcapAfter?: string;
  priceAfter?: string;
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
  const { address: account } = useAccount();
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [filter, setFilter] = useState<"all" | "my">("all");
  const [offline, setOffline] = useState(false);
  const seenTx = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let first = true;

    async function poll() {
      try {
        const res = await fetch(`/api/trades?token=${token}&limit=100`);
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

  const displayedTrades = useMemo(() => {
    if (!trades) return [];
    if (filter === "my" && account) {
      return trades.filter(
        (t) => t.trader.toLowerCase() === account.toLowerCase()
      );
    }
    return trades;
  }, [trades, filter, account]);

  if (offline) {
    return (
      <section
        aria-label="Trade History"
        className="rounded-[10px] border border-dashed border-[#24262e] p-6 text-center text-xs font-mono text-zinc-500 bg-[#141519]"
      >
        Live transaction stream offline • Retrying connection…
      </section>
    );
  }

  return (
    <section
      aria-label="Transaction History"
      className="rounded-[10px] border border-[#24262e] bg-[#141519] overflow-hidden font-mono flex flex-col"
    >
      {/* Header & Tabs */}
      <div className="flex items-center justify-between border-b border-[#24262e] bg-[#101114] p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-[4px] px-3 py-1 text-xs font-bold transition ${
              filter === "all"
                ? "bg-[#1a1b21] text-white border border-[#24262e]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Transaction History {trades ? `(${trades.length})` : ""}
          </button>

          {account && (
            <button
              type="button"
              onClick={() => setFilter("my")}
              className={`rounded-[4px] px-3 py-1 text-xs font-bold transition ${
                filter === "my"
                  ? "bg-[#1a1b21] text-[#db9d6a] border border-[#db9d6a]/40"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              My Trades
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#4ade80] font-bold">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-400">Live</span>
        </div>
      </div>

      {/* Content */}
      {trades === null ? (
        <div className="p-4 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-[4px] bg-[#1a1b21]" />
          ))}
        </div>
      ) : displayedTrades.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500 space-y-1">
          <p className="font-bold text-zinc-400">No onchain trades recorded yet</p>
          <p className="text-[11px]">Be the first to buy or sell on this curve</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#24262e] bg-[#141519] text-[10px] font-bold uppercase text-zinc-500">
                <th className="px-3.5 py-2.5">TYPE</th>
                <th className="px-3.5 py-2.5">ACCOUNT</th>
                <th className="px-3.5 py-2.5 text-right">USDC AMOUNT</th>
                <th className="px-3.5 py-2.5 text-right">TOKENS</th>
                <th className="px-3.5 py-2.5 text-right">MCAP AFTER</th>
                <th className="px-3.5 py-2.5 text-right pr-4">TIME / TX</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1b22]">
              {displayedTrades.map((t) => {
                const mcapVal = t.mcapAfter ? BigInt(t.mcapAfter) : undefined;
                return (
                  <tr
                    key={`${t.txHash}-${t.logIndex}`}
                    className="transition-colors hover:bg-[#1a1b21]"
                  >
                    {/* Trade Type */}
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-[3px] px-2 py-0.5 text-[9px] font-bold ${
                          t.isBuy
                            ? "bg-[#14291e] text-[#4ade80] border border-[#4ade80]/40"
                            : "bg-[#2b1114] text-[#ef4444] border border-[#ef4444]/40"
                        }`}
                      >
                        {t.isBuy ? "BUY" : "SELL"}
                      </span>
                    </td>

                    {/* Trader Account */}
                    <td className="px-3.5 py-2.5">
                      <a
                        href={`https://testnet.arcscan.app/address/${t.trader}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-300 hover:text-[#db9d6a] transition-colors"
                      >
                        {shortAddress(t.trader)}
                      </a>
                    </td>

                    {/* USDC Amount */}
                    <td
                      className={`px-3.5 py-2.5 text-right font-bold ${
                        t.isBuy ? "text-[#4ade80]" : "text-[#ef4444]"
                      }`}
                    >
                      {formatUsd(BigInt(t.usdcAmount))}
                    </td>

                    {/* Token Amount */}
                    <td className="px-3.5 py-2.5 text-right text-zinc-300">
                      {formatToken(BigInt(t.tokenAmount))}
                    </td>

                    {/* Market Cap After */}
                    <td className="px-3.5 py-2.5 text-right font-bold text-white">
                      {mcapVal ? formatUsd(mcapVal) : "—"}
                    </td>

                    {/* Time & Tx Explorer Link */}
                    <td className="px-3.5 py-2.5 text-right pr-4 text-zinc-400">
                      <a
                        href={`https://testnet.arcscan.app/tx/${t.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                        title="View on ArcScan"
                      >
                        {timeAgo(t.timestamp)} <span className="text-[10px] text-zinc-600">↗</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
