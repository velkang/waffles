"use client";

import { useReadContracts } from "wagmi";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { wafflesBondingCurveAbi } from "@/generated/contracts-generated";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useReadWafflesBondingCurveGraduationProgressBps,
  useReadWafflesLaunchFactoryLaunchOfToken,
  useReadWafflesMemeTokenName,
  useReadWafflesMemeTokenSymbol,
} from "@/generated/contracts-generated";
import { PriceChart } from "@/components/token/PriceChart";
import { TradePanel } from "@/components/token/TradePanel";
import { TradeFeed } from "@/components/token/TradeFeed";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatUsd, shortAddress } from "@/lib/format";
import { getOptimizedImageUrl } from "@/lib/image";
import { FACTORY_ADDRESS } from "@/lib/wagmi";
import { useVenuePrice } from "@/lib/use-venue-price";
import { useLaunch } from "@/lib/hooks/queries";

type Address = `0x${string}`;

export default function TokenPage() {
  const params = useParams<{ address?: string }>();
  const resolvedAddress =
    params?.address && params.address !== "default"
      ? params.address
      : typeof window !== "undefined" &&
          window.location.pathname.startsWith("/token/")
        ? window.location.pathname.split("/token/")[1]?.split("/")[0] || ""
        : "";
  const token = resolvedAddress as Address;

  const { data: launchSnapshot } = useLaunch(token);
  const realtimeLaunch = launchSnapshot?.launch;

  const launchQuery = useReadWafflesLaunchFactoryLaunchOfToken({
    address: FACTORY_ADDRESS,
    args: [token],
    query: { enabled: Boolean(FACTORY_ADDRESS) },
  });
  const launch = launchQuery.data as
    | readonly [Address, Address, Address, string, string, string, string, string, bigint]
    | undefined;
  const curve = (realtimeLaunch?.curve as Address | undefined) ?? launch?.[1];

  const venue = useVenuePrice(token, curve);
  const { data: progressBps } = useReadWafflesBondingCurveGraduationProgressBps({
    address: curve,
    query: { enabled: Boolean(curve) },
  });
  const { data: tokenName } = useReadWafflesMemeTokenName({
    address: token,
    query: { enabled: Boolean(token) },
  });
  const { data: tokenSymbol } = useReadWafflesMemeTokenSymbol({
    address: token,
    query: { enabled: Boolean(token) },
  });

  const graduated = realtimeLaunch?.graduated ?? venue.graduated;
  const mcap = realtimeLaunch?.mcap
    ? BigInt(realtimeLaunch.mcap)
    : venue.mcap;
  const progress =
    graduated
      ? 100
      : realtimeLaunch?.progressBps !== undefined
        ? realtimeLaunch.progressBps / 100
        : progressBps !== undefined
          ? Number(progressBps) / 100
          : undefined;

  const [copied, setCopied] = useState(false);
  const copyAddress = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!launchQuery.isLoading && !launch && !realtimeLaunch) {
    return (
      <div className="mx-auto max-w-lg rounded-[10px] border border-[#24262e] bg-[#141519] p-8 text-center font-mono">
        <h1 className="text-lg font-bold text-white">TOKEN NOT FOUND</h1>
        <p className="mt-2 text-xs text-zinc-400">
          This token contract was not found on the Waffles Launch Factory.
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

  const description = realtimeLaunch?.description || launch?.[3] || "";
  const imageUri = realtimeLaunch?.imageUri || launch?.[4] || "";
  const website = realtimeLaunch?.website || launch?.[5] || "";
  const twitter = realtimeLaunch?.twitter || launch?.[6] || "";
  const telegram = realtimeLaunch?.telegram || launch?.[7] || "";
  const createdAt = realtimeLaunch?.createdAt
    ? Math.floor(new Date(realtimeLaunch.createdAt).getTime() / 1000)
    : launch?.[8]
      ? Number(launch[8])
      : 0;
  const displayName = realtimeLaunch?.name || tokenName || "Arc Token";
  const displaySymbol = realtimeLaunch?.symbol || tokenSymbol;

  return (
    <div className="token-detail-page">
      <section className="token-detail-header" aria-labelledby="token-title">
        <div className="token-detail-identity">
          {imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getOptimizedImageUrl(imageUri, {
                width: 200,
                height: 200,
                quality: 80,
              })}
              alt=""
              className="token-detail-image"
            />
          ) : (
            <div className="token-detail-image token-detail-image-fallback">
              ${(displaySymbol ?? token.slice(2, 4)).slice(0, 3)}
            </div>
          )}

          <div className="token-detail-name">
            <div className="token-detail-title-row">
              <h1 id="token-title">{displayName}</h1>
              <StatusBadge graduated={graduated} progress={progress} size="xs" />
            </div>
            <p>${displaySymbol ?? "…"}<span>·</span>{createdAt ? timeAgo(Number(createdAt)) : "Just launched"}</p>
          </div>
        </div>

        <dl className="token-detail-stats">
          <div><dt>Market cap</dt><dd>{formatUsd(mcap)}</dd></div>
          <div><dt>24h volume</dt><dd>{formatUsd(realtimeLaunch?.volume24h ? BigInt(realtimeLaunch.volume24h) : undefined)}</dd></div>
          <div><dt>Curve progress</dt><dd>{graduated ? "Complete" : progress === undefined ? "—" : `${progress.toFixed(1)}%`}</dd></div>
          <div><dt>Market</dt><dd>{graduated ? "Liquidity pool" : "Bonding curve"}</dd></div>
        </dl>

        <div className="token-detail-actions">
          <button type="button" onClick={copyAddress} title="Copy contract address">
            <span>{shortAddress(token)}</span><strong>{copied ? "Copied" : "Copy contract"}</strong>
          </button>
          {twitter && <a href={`https://x.com/${twitter.replace("@", "")}`} target="_blank" rel="noreferrer">X</a>}
          {website && <a href={website} target="_blank" rel="noreferrer">Website</a>}
          {telegram && <a href={`https://t.me/${telegram.replace("t.me/", "")}`} target="_blank" rel="noreferrer">Telegram</a>}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Left Column: Chart on top, Holders & Callouts below */}
        <div className="min-w-0 space-y-5">
          {/* Price & Curve Chart */}
          {curve ? (
            <PriceChart token={token} curve={curve} />
          ) : (
            <div className="h-80 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
          )}

          {curve && <GraduationDetails curve={curve} />}

          {/* Real Live Transaction History Feed */}
          <TradeFeed token={token} />
        </div>

        {/* Right Column: Order Execution & Stats Rail */}
        <div>
          {curve ? (
            <TradePanel
              tokenAddress={token}
              curveAddress={curve}
              description={description}
              graduated={graduated}
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

function GraduationDetails({ curve }: { curve: Address }) {
  const functions = ['graduated', 'graduationProgressBps', 'marketCap', 'graduationMarketCapTarget', 'targetVirtualUsdcReserve', 'virtualUsdcReserve', 'feeBps'] as const;
  const query = useReadContracts({
    contracts: functions.map((functionName) => ({ address: curve, abi: wafflesBondingCurveAbi, functionName })),
    allowFailure: false,
    query: { refetchInterval: 15_000 },
  });
  const values = query.data;
  const isGraduated = values?.[0] === true;
  const progress = values ? Number(values[1]) / 100 : undefined;
  const marketCap = values?.[2] as bigint | undefined;
  const target = values?.[3] as bigint | undefined;
  const reserveTarget = values?.[4] as bigint | undefined;
  const reserve = values?.[5] as bigint | undefined;
  const fee = values?.[6] as bigint | undefined;
  const netNeeded = reserveTarget !== undefined && reserve !== undefined ? (reserveTarget > reserve ? reserveTarget - reserve : 0n) : undefined;
  const needed = netNeeded !== undefined && fee !== undefined && fee < 10000n ? (netNeeded * 10000n + (10000n - fee) - 1n) / (10000n - fee) : undefined;
  return <section className="analytics-panel">
    <h2 className="text-lg">{isGraduated ? 'Graduated · Trading in pool' : 'Toward graduation'}</h2>
    {query.isError ? <><p>Curve details couldn’t be loaded.</p><button className="market-button mt-3" onClick={() => void query.refetch()}>Retry</button></> : isGraduated ? <p>This token completed its curve. Trading continues in its liquidity pool.</p> : <>
      <p>{progress === undefined ? 'Reading curve state…' : `${progress.toFixed(1)}% of the curve allocation purchased`}</p>
      {progress !== undefined && <div className="mt-4"><ProgressBar progress={progress} showTicks={false} /></div>}
      <dl className="analytics-fees"><div><dt>Curve market cap</dt><dd>{formatUsd(marketCap)}</dd></div><div><dt>Graduation target</dt><dd>{formatUsd(target)}</dd></div><div><dt>Buy to complete · est.</dt><dd>{formatUsd(needed)}</dd></div></dl>
      <p>Estimated USDC buy includes the trading fee and changes with trades. Selling can reduce progress. Graduation is confirmed onchain.</p>
    </>}
  </section>;
}
