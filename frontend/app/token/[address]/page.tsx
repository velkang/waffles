"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useReadBondingCurveCreator,
  useReadBondingCurveGraduationMcap,
  useReadBondingCurveGraduationProgressBps,
  useReadLaunchFactoryLaunchOfToken,
  useReadMemeTokenName,
  useReadMemeTokenSymbol,
} from "@/generated/contracts-generated";
import { PriceChart } from "@/components/token/PriceChart";
import { TradePanel } from "@/components/token/TradePanel";
import { HoldersTable } from "@/components/token/HoldersTable";
import { ThreadComments } from "@/components/token/ThreadComments";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPrice, formatUsd, shortAddress } from "@/lib/format";
import { getOptimizedImageUrl } from "@/lib/image";
import { FACTORY_ADDRESS, arcTestnet } from "@/lib/wagmi";
import { useVenuePrice } from "@/lib/use-venue-price";

type Address = `0x${string}`;

export default function TokenPage() {
  const { address } = useParams<{ address: string }>();
  const token = address as Address;

  const launchQuery = useReadLaunchFactoryLaunchOfToken({
    address: FACTORY_ADDRESS,
    args: [token],
    query: { enabled: Boolean(FACTORY_ADDRESS) },
  });
  const launch = launchQuery.data as
    | readonly [Address, Address, Address, string, string, string, string, string, bigint]
    | undefined;
  const curve = launch?.[1];

  const venue = useVenuePrice(token, curve);
  const { data: progressBps } = useReadBondingCurveGraduationProgressBps({
    address: curve,
    query: { enabled: Boolean(curve) },
  });
  const { data: creator } = useReadBondingCurveCreator({
    address: curve,
    query: { enabled: Boolean(curve) },
  });
  const { data: tokenName } = useReadMemeTokenName({
    address: token,
    query: { enabled: Boolean(token) },
  });
  const { data: tokenSymbol } = useReadMemeTokenSymbol({
    address: token,
    query: { enabled: Boolean(token) },
  });

  const progress =
    progressBps !== undefined ? Number(progressBps) / 100 : undefined;

  const { graduated, price, mcap } = venue;

  const [copied, setCopied] = useState(false);
  const copyAddress = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!launchQuery.isLoading && !launch) {
    return (
      <div className="mx-auto max-w-lg rounded-[10px] border border-[#24262e] bg-[#141519] p-8 text-center font-mono">
        <h1 className="text-lg font-bold text-white">TOKEN NOT FOUND</h1>
        <p className="mt-2 text-xs text-zinc-400">
          This token contract was not found on the Arc Launch Factory.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-block rounded-[6px] bg-[#db9d6a] px-4 py-2 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] transition"
        >
          Launch a Token →
        </Link>
      </div>
    );
  }

  const [, , , description, imageUri, website, twitter, telegram, createdAt] =
    launch ?? [null, null, null, "", "", "", "", "", 0n];

  return (
    <div className="space-y-5">
      {/* 1. Token Top Header (Pump.fun style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-1">
        {/* Left: Avatar, $Symbol, Name, Holders */}
        <div className="flex items-center gap-3 min-w-0">
          {imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getOptimizedImageUrl(imageUri, {
                width: 200,
                height: 200,
                quality: 80,
              })}
              alt=""
              className="h-14 w-14 rounded-[10px] border border-[#24262e] bg-[#1a1b21] object-cover shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-[#1a1b21] border border-[#24262e] text-lg font-black text-[#db9d6a]">
              ${(tokenSymbol ?? token.slice(2, 4)).slice(0, 3)}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-black text-white tracking-tight">
                ${tokenSymbol ?? "…"}
              </h1>
              <StatusBadge graduated={graduated} progress={progress} size="xs" />
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="text-zinc-300 font-medium">{tokenName || "Arc Token"}</span>
              <span>•</span>
              <span className="text-zinc-400">🌿 {createdAt ? timeAgo(Number(createdAt)) : "now"}</span>
              <span>•</span>
              <span className="text-zinc-400">1,007 holders</span>
            </div>
          </div>
        </div>

        {/* Right: Huge Market Cap Readout & Action Icons */}
        <div className="flex sm:flex-col sm:items-end justify-between items-center gap-1 font-mono">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-zinc-400">Market cap. ⇄</span>
            <span className="text-2xl sm:text-3xl font-black text-white">
              {formatUsd(mcap)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {/* Copy CA */}
            <button
              type="button"
              onClick={copyAddress}
              className="flex items-center gap-1 rounded-[4px] bg-[#141519] border border-[#24262e] px-2 py-0.5 text-zinc-300 hover:border-[#db9d6a] transition"
              title="Copy Contract Address"
            >
              <span>{shortAddress(token)}</span>
              <span className="text-[#db9d6a]">{copied ? "✓" : "📋"}</span>
            </button>

            {/* Social Links */}
            {twitter && (
              <a
                href={`https://x.com/${twitter.replace("@", "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
              >
                𝕏
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
              >
                🌐
              </a>
            )}
            {telegram && (
              <a
                href={`https://t.me/${telegram.replace("t.me/", "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
              >
                ✈
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main 2-Column Grid (Left: Chart + Community/Holders, Right: Order Slip) */}
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Chart on top, Holders & Callouts below */}
        <div className="space-y-5">
          {/* Price & Curve Chart */}
          {curve ? (
            <PriceChart token={token} curve={curve} />
          ) : (
            <div className="h-80 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
          )}

          {/* Bottom Community Split Sub-Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Left: Holders Ledger */}
            <HoldersTable tokenAddress={token} />

            {/* Right: Callouts / Trades Comments Thread */}
            <ThreadComments tokenAddress={token} />
          </div>
        </div>

        {/* Right Column: Order Execution & Stats Rail */}
        <div>
          {curve ? (
            <TradePanel
              tokenAddress={token}
              curveAddress={curve}
              description={description}
            />
          ) : (
            <div className="h-96 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(timestamp: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
