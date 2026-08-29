"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice, formatUsd, shortAddress } from "@/lib/format";
import { getOptimizedImageUrl } from "@/lib/image";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrendingCarousel } from "@/components/explore/TrendingCarousel";
import { useLaunches } from "@/lib/hooks/queries";
import { useRealtimeTopics } from "@/lib/realtime/RealtimeProvider";

const CATEGORIES = [
  { id: "trending", label: "🔥 Trending" },
  { id: "new", label: "🌱 New" },
] as const;

export default function ExplorePage() {
  useRealtimeTopics(["launches"]);
  const { data, isLoading } = useLaunches({ limit: 100 });
  const tokens = useMemo(() => data?.launches ?? [], [data]);
  const loading = isLoading;

  const [selectedCategory, setSelectedCategory] = useState<string>("trending");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filter & Sort based on active category
  const filteredTokens = useMemo(() => {
    const list = [...tokens];
    switch (selectedCategory) {
      case "new":
        return list.sort(
          (a, b) =>
            (b.createdAt ? Date.parse(b.createdAt) : 0) -
            (a.createdAt ? Date.parse(a.createdAt) : 0),
        );
      case "trending":
      default:
        return list.sort((a, b) => {
          // Sort by progressBps first, then by mcap
          const diffProgress = (b.progressBps ?? 0) - (a.progressBps ?? 0);
          if (diffProgress !== 0) return diffProgress;
          return Number(BigInt(b.mcap || 0) - BigInt(a.mcap || 0));
        });
    }
  }, [tokens, selectedCategory]);

  // Trending tokens for top carousel (top 8 by mcap or progress)
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

          {/* Horizontal Category Filter Pills (Trending & New) */}
          <div className="flex items-center gap-2 pb-1">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-[#db9d6a] text-[#0e0f12]"
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
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-12 text-center text-xs text-zinc-400 font-mono">
            No coins found in this category •{" "}
            <Link href="/create" className="font-bold text-[#db9d6a] hover:underline">
              Launch the first coin →
            </Link>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View: Media-Forward Square Cards (Pump.fun style) */
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 font-mono">
            {filteredTokens.map((t) => {
              const mcapVal = BigInt(t.mcap || 0);
              const progress = (t.progressBps ?? 0) / 100;
              const isHot = (t.progressBps ?? 0) >= 7500;

              return (
                <Link
                  key={t.token}
                  href={`/token/${t.token}`}
                  className={`group flex flex-col rounded-[10px] bg-[#141519] border overflow-hidden transition hover:border-[#db9d6a] ${
                    isHot ? "border-[#db9d6a]/40" : "border-[#24262e]"
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

                    {/* Live Stream / Hot Badge */}
                    {isHot && (
                      <span className="absolute top-2 right-2 rounded-[4px] bg-[#14291e]/90 border border-[#4ade80] px-1.5 py-0.5 text-[9px] font-bold text-[#4ade80] flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                        HOT
                      </span>
                    )}
                  </div>

                  {/* Card Content & Stats */}
                  <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div>
                      {/* Market Cap & Ticker */}
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-xs font-black text-white truncate">
                          {formatUsd(mcapVal)} <span className="text-[10px] text-zinc-500 font-normal">MC</span>
                        </span>
                        <span className="text-[11px] font-bold text-[#db9d6a] truncate">
                          ${t.symbol}
                        </span>
                      </div>

                      {/* Token Name */}
                      <div className="text-xs font-semibold text-zinc-300 truncate mt-0.5">
                        {t.name}
                      </div>

                      {/* Creator Time Tag */}
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
                        <span>🌿</span>
                        <span>{shortAddress(t.creator)}</span>
                      </div>
                    </div>

                    {/* Progress Bar or Graduated Badge */}
                    <div className="pt-1.5 border-t border-[#24262e]">
                      {t.graduated ? (
                        <div className="flex items-center justify-between text-[9px] font-bold text-[#4ade80]">
                          <span>GRADUATED</span>
                          <span>100%</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] text-zinc-400">
                            <span>BONDING</span>
                            <span className="text-zinc-200">{progress.toFixed(0)}%</span>
                          </div>
                          <ProgressBar progress={progress} graduated={false} size="sm" showTicks={false} />
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Table View: Dense High-Speed Scanner */
          <div className="overflow-x-auto rounded-[10px] border border-[#24262e] bg-[#141519]">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#24262e] bg-[#101114] text-[10px] font-bold uppercase text-zinc-400">
                  <th className="px-4 py-3">COIN</th>
                  <th className="px-4 py-3 text-right">MARKET CAP</th>
                  <th className="px-4 py-3 text-right">PRICE</th>
                  <th className="px-4 py-3 text-right">24H VOL</th>
                  <th className="px-4 py-3 text-right">CURVE PROGRESS</th>
                  <th className="px-4 py-3 text-right">STATUS</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1b22]">
                {filteredTokens.map((t) => {
                  const mcapVal = BigInt(t.mcap || 0);
                  const priceVal = BigInt(t.price || 0);
                  const volVal = BigInt(t.volume24h || 0);
                  const progress = (t.progressBps ?? 0) / 100;

                  return (
                    <tr
                      key={t.token}
                      className="transition hover:bg-[#1a1b21]"
                    >
                      {/* Coin Symbol & Avatar */}
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
                              ${t.symbol.slice(0, 3)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white group-hover:text-[#db9d6a] transition">
                              ${t.symbol}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[120px]">
                              {t.name}
                            </div>
                          </div>
                        </Link>
                      </td>

                      {/* Market Cap */}
                      <td className="px-4 py-3 text-right font-bold text-white">
                        {formatUsd(mcapVal)}
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {formatPrice(priceVal)}
                      </td>

                      {/* 24H Volume */}
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {formatUsd(volVal)}
                      </td>

                      {/* Curve Progress */}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-col items-end gap-1 w-24">
                          <span className="text-[10px] font-bold text-zinc-300">
                            {t.graduated ? "100%" : `${progress.toFixed(1)}%`}
                          </span>
                          <ProgressBar
                            progress={progress}
                            graduated={t.graduated}
                            size="sm"
                            showTicks={false}
                          />
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3 text-right">
                        <StatusBadge
                          graduated={t.graduated}
                          progress={progress}
                          size="xs"
                        />
                      </td>

                      {/* Quick Trade Action */}
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
