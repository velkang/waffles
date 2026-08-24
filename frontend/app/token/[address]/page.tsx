"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import {
  useReadBondingCurveCreator,
  useReadBondingCurveCreatorEarnings,
  useReadBondingCurveGraduationMcap,
  useReadBondingCurveGraduationProgressBps,
  useReadLaunchFactoryLaunchOfToken,
  useReadMemeTokenName,
  useReadMemeTokenSymbol,
  useWriteBondingCurveClaimCreatorFees,
} from "@/generated/contracts-generated";
import { PriceChart } from "@/components/token/PriceChart";
import { TradePanel } from "@/components/token/TradePanel";
import { TradeFeed } from "@/components/token/TradeFeed";
import { formatPrice, formatUsd, shortAddress } from "@/lib/format";
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
  const { data: graduationMcap } = useReadBondingCurveGraduationMcap({
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

  const { graduated, pool, price, mcap } = venue;

  if (!launchQuery.isLoading && !launch) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-zinc-300">This token doesn&apos;t exist on arc.fun.</p>
        <Link
          href="/create"
          className="mt-3 inline-block text-sm text-emerald-400 hover:underline"
        >
          Launch your own →
        </Link>
      </div>
    );
  }

  const [, , , description, imageUri, website, twitter, telegram, createdAt] =
    launch ?? [null, null, null, "", "", "", "", "", 0n];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:grid-rows-[auto_auto_auto_1fr]" data-token-grid>
      {/* identity + price */}
        <header className="order-1 flex flex-wrap items-center gap-4 lg:col-start-1 lg:row-start-1">
          {imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUri}
              alt=""
              className="h-14 w-14 rounded-full border border-zinc-800 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-600 text-lg font-black tracking-tight text-zinc-950">
              {(tokenSymbol ?? token.slice(2, 4)).slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">
              {tokenSymbol ?? "…"}
              <span className="ml-1.5 font-normal text-zinc-500">/ USDC</span>
            </h1>
            <p className="truncate font-mono text-xs text-zinc-500">
              {tokenName || shortAddress(token)} · by{" "}
              {creator ? shortAddress(creator) : "…"}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="font-mono text-3xl tabular-nums tracking-tight">
              {formatPrice(price)}
            </div>
            <div className="text-xs text-zinc-500">
              MC {formatUsd(mcap)}{" "}
              {graduated && (
                <span className="ml-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-300">
                  🎓 Graduated
                </span>
              )}
            </div>
          </div>
        </header>

        {/* price chart — candles when indexed, curve before first trade */}
        {curve ? (
          <PriceChart token={token} curve={curve} />
        ) : (
          <div className="h-64 animate-pulse rounded-xl bg-zinc-800/50" />
        )}

        {/* graduation */}
        <section
          aria-label="Bonding curve progress"
          className="order-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 lg:col-start-1 lg:row-start-3"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">
              {graduated
                ? "Graduated to DEX liquidity"
                : `Graduates at ${formatUsd(graduationMcap)} market cap`}
            </h2>
            <span className="font-mono text-sm tabular-nums text-zinc-400">
              {progress !== undefined ? `${progress.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-950">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                graduated ? "bg-violet-400" : "bg-emerald-400"
              }`}
              style={{ width: `${Math.min(progress ?? 0, 100)}%` }}
            />
          </div>
          {!graduated && mcap !== undefined && graduationMcap !== undefined && (
            <p className="mt-2 font-mono text-xs tabular-nums text-zinc-500">
              {formatUsd(mcap)} of {formatUsd(graduationMcap)} — every trade
              moves the curve
            </p>
          )}
          {graduated && (
            <p className="mt-2 font-mono text-xs text-zinc-500">
              DEX pool:{" "}
              {pool ? (
                <a
                  href={`${arcTestnet.blockExplorers.default.url}/address/${pool}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 hover:underline"
                >
                  {shortAddress(pool)} ↗
                </a>
              ) : (
                "—"
              )}
            </p>
          )}
        </section>

        {/* trades — live feed from the indexer */}
        <TradeFeed token={token} />

      {/* trading panel — sits between chart and curve on mobile */}
      <div className="order-3 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start">
        {curve ? (
          <TradePanel tokenAddress={token} curveAddress={curve} />
        ) : (
          <div className="h-96 animate-pulse rounded-2xl bg-zinc-900" />
        )}
      </div>

      {/* about */}
      <section className="order-6 self-start rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm lg:col-start-2 lg:row-start-4">
        <h2 className="mb-2 text-sm font-semibold text-zinc-200">About</h2>
        <p className="text-zinc-400">
          {description || "No description provided."}
        </p>
        <dl className="mt-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Created</dt>
            <dd className="font-mono text-zinc-300">
              {createdAt
                ? new Date(Number(createdAt) * 1000).toLocaleDateString()
                : "—"}
              </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Supply</dt>
            <dd className="font-mono text-zinc-300">1B</dd>
          </div>
        </dl>
        {curve && <CreatorEarnings curveAddress={curve} creator={creator} />}
        {(website || twitter || telegram) && (
          <div className="mt-3 flex gap-3 text-xs">
            {website && <ExternalLink href={website} label="Website" />}
            {twitter && (
              <ExternalLink
                href={`https://x.com/${twitter.replace("@", "")}`}
                label="X"
              />
            )}
            {telegram && (
              <ExternalLink
                href={`https://t.me/${telegram.replace("t.me/", "")}`}
                label="Telegram"
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/// Creator-only card: shows accrued 0.25% trade fees and claims them.
function CreatorEarnings({
  curveAddress,
  creator,
}: {
  curveAddress: Address;
  creator?: Address;
}) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const [claiming, setClaiming] = useState(false);
  const [err, setErr] = useState("");

  const isCreator = Boolean(
    account && creator && account.toLowerCase() === creator.toLowerCase(),
  );

  const earningsQuery = useReadBondingCurveCreatorEarnings({
    address: curveAddress,
    args: [account ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: isCreator },
  });
  const { writeContractAsync: claimAsync, isPending } =
    useWriteBondingCurveClaimCreatorFees();

  if (!isCreator) return null;
  const earnings = earningsQuery.data;

  async function claim() {
    if (!publicClient) return;
    setErr("");
    setClaiming(true);
    try {
      const hash = await claimAsync({ address: curveAddress });
      await publicClient.waitForTransactionReceipt({ hash });
      earningsQuery.refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 160) : String(e));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">
          Your creator earnings · 0.25% of curve trades
        </span>
        <span className="font-mono text-emerald-300">
          {formatUsd(earnings)}
        </span>
      </div>
      <button
        type="button"
        onClick={claim}
        disabled={claiming || isPending || !earnings}
        className={`mt-2 w-full rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition-colors ${
          claiming || isPending || !earnings
            ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
            : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
        }`}
      >
        {claiming || isPending
          ? "Claiming…"
          : earnings
            ? `Claim ${formatUsd(earnings)}`
            : "No earnings yet"}
      </button>
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 transition-colors hover:border-emerald-500/60 hover:text-emerald-300"
    >
      {label} ↗
    </a>
  );
}
