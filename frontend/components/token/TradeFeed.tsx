"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, shortAddress } from "@/lib/format";

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
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
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
        aria-label="Trades"
        className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-600"
      >
        Trade feed is offline — the indexer isn&apos;t reachable right now.
      </section>
    );
  }

  return (
    <section
      aria-label="Trades"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:col-start-1 lg:row-start-4 order-5 self-start w-full"
    >
      <h2 className="mb-3 px-1 text-sm font-semibold text-zinc-200">Trades</h2>
      {trades === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-800/50" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-600">
          No trades yet — be the first.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/70">
          {trades.map((t) => (
            <li
              key={`${t.txHash}-${t.logIndex}`}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`font-mono font-bold ${
                    t.isBuy ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {t.isBuy ? "B" : "S"}
                </span>
                <a
                  href={`https://testnet.arcscan.app/tx/${t.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-xs text-zinc-400 hover:text-emerald-300"
                >
                  {shortAddress(t.trader)}
                </a>
                <span className="text-xs text-zinc-500">
                  {t.isBuy ? "bought" : "sold"}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span
                  className={`font-mono text-sm tabular-nums ${
                    t.isBuy ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {formatUsd(BigInt(t.usdcAmount))}
                </span>
                <span className="w-8 text-right text-xs tabular-nums text-zinc-600">
                  {timeAgo(t.timestamp)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
