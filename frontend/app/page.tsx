"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice, formatToken, formatUsd, shortAddress } from "@/lib/format";
import { getOptimizedImageUrl } from "@/lib/image";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrendingCarousel } from "@/components/explore/TrendingCarousel";

type TokenItem = {
  token: `0x${string}`;
  curve: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  website: string;
  twitter: string;
  telegram: string;
  createdAt: number;
  graduated?: boolean;
  mcap?: string;
  price?: string;
  volume24h?: string;
  progressBps?: number;
};

const CATEGORIES = [
  { id: "movers", label: "🌟 Movers" },
  { id: "mayhem", label: "🔥 Mayhem" },
  { id: "new", label: "🌱 New" },
  { id: "charities", label: "💖 Charities" },
  { id: "live", label: "🎬 Live" },
  { id: "mcap", label: "💰 Market cap" },
  { id: "agents", label: "🤖 Agents" },
  { id: "oldest", label: "🪐 Oldest" },
  { id: "last_trade", label: "💥 Last trade" },
] as const;

export default function ExplorePage() {
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("movers");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/launches?limit=100`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled && data.launches) {
          setTokens(data.launches);
        }
      } catch (err) {
        console.error("Failed to load launches:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Filter & Sort based on active category
  const filteredTokens = useMemo(() => {
    const list = [...tokens];
    switch (selectedCategory) {
      case "new":
        return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      case "oldest":
        return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      case "mcap":
        return list.sort((a, b) => Number(BigInt(b.mcap || 0) - BigInt(a.mcap || 0)));
      case "mayhem":
      case "last_trade":
        return list.sort(
          (a, b) => Number(BigInt(b.volume24h || 0) - BigInt(a.volume24h || 0))
        );
      case "live":
        return list.filter((t) => (t.progressBps ?? 0) >= 5000);
      case "movers":
      default:
        return list.sort((a, b) => (b.progressBps ?? 0) - (a.progressBps ?? 0));
    }
  }, [tokens, selectedCategory]);

  // Trending tokens for top carousel (top 6 by mcap or volume)
  const trendingTokens = useMemo(() => {
    return [...tokens]
      .sort((a, b) => Number(BigInt(b.mcap || 0) - BigInt(a.mcap || 0)))
      .slice(0, 8);
  }, [tokens]);

  return (
    <div className="space-y-6">
      {/* 1. Trending Now Carousel */}
      {trendingTokens.length > 0 && (
        <TrendingCarousel tokens={trendingTokens} />
      )}

      {/* 2. Explore Coins Section */}
      <section className="space-y-4">
        {/* Section Heading & Category Filter Ribbon */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-white tracking-wide">
              Explore coins
            </h1>
            
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-[6px] border border-[#24262e] bg-[#141519] p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 font-bold transition ${
                  viewMode === "grid"
                    ? "bg-[#db9d6a] text-[#0e0f12]"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Grid view"
              >
                <span>▦</span> Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 font-bold transition ${
                  viewMode === "table"
                    ? "bg-[#db9d6a] text-[#0e0f12]"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Table view"
              >
                <span>☰</span> Table
              </button>
            </div>
          </div>

          {/* Horizontal Scrollable Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[#db9d6a] text-[#0e0f12] font-bold"
                      : "bg-[#141519] text-zinc-400 hover:text-white border border-[#24262e] hover:border-[#383a45]"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Tokens Content (Grid or Table View) */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-[10px] bg-[#141519] border border-[#24262e] animate-pulse"
              />
            ))}
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-12 text-center text-xs text-zinc-400">
            No tokens found in this category. Be the first to deploy!
          </div>
        ) : viewMode === "grid" ? (
          /* Media-Forward Grid Cards (Pump.fun style) */
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredTokens.map((t) => {
              const progress = (t.progressBps ?? 0) / 100;
              const isLive = progress >= 50;

              return (
                <Link
                  key={t.token}
                  href={`/token/${t.token}`}
                  className={`group flex flex-col rounded-[10px] bg-[#141519] border overflow-hidden transition hover:border-[#db9d6a] ${
                    isLive ? "border-[#4ade80]/40" : "border-[#24262e]"
                  }`}
                >
                  {/* Square Token Image */}
                  <div className="relative aspect-square w-full bg-[#1a1b21] overflow-hidden">
                    {t.imageUri ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getOptimizedImageUrl(t.imageUri, {
                          width: 300,
                          height: 300,
                          quality: 75,
                        })}
                        alt={t.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-black text-2xl text-[#db9d6a]">
                        ${t.symbol.slice(0, 3)}
                      </div>
                    )}

                    {/* Live Stream Indicator Badge */}
                    {isLive && (
                      <span className="absolute top-2 right-2 rounded-[4px] bg-[#14291e]/90 border border-[#4ade80] px-1.5 py-0.5 text-[9px] font-bold text-[#4ade80] flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                        LIVE
                      </span>
                    )}
                  </div>

                  {/* Token Info Stack */}
                  <div className="p-2.5 flex flex-col flex-1 justify-between gap-1.5">
                    <div>
                      <div className="font-bold text-white text-sm truncate">
                        {t.name}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        ${t.symbol}
                      </div>
                    </div>

                    <div className="text-xs font-black text-white">
                      {formatUsd(BigInt(t.mcap || 0))} <span className="text-[10px] font-normal text-zinc-400">MC</span>
                    </div>

                    {/* Creator Tag */}
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                      <span className="truncate">{shortAddress(t.creator)}</span>
                      <span>🌿</span>
                      <span>{t.createdAt ? timeAgo(t.createdAt) : "now"}</span>
                    </div>

                    {/* Description Snippet */}
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-tight">
                      {t.description || "Fair launch token on Arc L1."}
                    </p>

                    {/* Bottom Progress Bar */}
                    <div className="pt-1">
                      <ProgressBar progress={progress} graduated={t.graduated} size="sm" showTicks={false} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Dense Table View */
          <div className="overflow-x-auto rounded-[10px] border border-[#24262e] bg-[#141519]">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#24262e] bg-[#101114] text-[10px] font-bold uppercase text-zinc-400">
                  <th className="px-4 py-3">TOKEN</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3 text-right">PRICE (USDC)</th>
                  <th className="px-4 py-3 text-right">MARKET CAP</th>
                  <th className="px-4 py-3 text-right">24H VOLUME</th>
                  <th className="px-4 py-3 text-right">CURVE PROGRESS</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1b22]">
                {filteredTokens.map((t) => {
                  const progress = (t.progressBps ?? 0) / 100;
                  return (
                    <tr
                      key={t.token}
                      className="transition hover:bg-[#1a1b21]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/token/${t.token}`}
                          className="flex items-center gap-2.5 group"
                        >
                          {t.imageUri ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getOptimizedImageUrl(t.imageUri, {
                                width: 64,
                                height: 64,
                                quality: 75,
                              })}
                              alt=""
                              className="h-8 w-8 rounded-[6px] object-cover bg-[#0e0f12]"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#1a1b21] border border-[#24262e] font-bold text-xs text-[#db9d6a]">
                              {t.symbol.slice(0, 3)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white group-hover:text-[#db9d6a] transition-colors">
                              ${t.symbol}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-sans truncate max-w-[120px]">
                              {t.name}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          graduated={t.graduated}
                          progress={progress}
                          size="xs"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white">
                        {t.price ? formatPrice(BigInt(t.price)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#db9d6a]">
                        {formatUsd(BigInt(t.mcap || 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {formatUsd(BigInt(t.volume24h || 0))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-col items-end gap-1 w-24">
                          <span className="text-[10px] text-zinc-400">
                            {progress.toFixed(1)}%
                          </span>
                          <ProgressBar
                            progress={progress}
                            graduated={t.graduated}
                            size="sm"
                            showTicks={false}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/token/${t.token}`}
                          className="rounded-[4px] bg-[#db9d6a] px-3 py-1 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] transition"
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function timeAgo(timestamp: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
