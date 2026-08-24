"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import {
  ammFactoryAbi,
  ammPairAbi,
  useReadAmmMigratorFactory,
  useReadLaunchFactoryMigrator,
  useWriteBondingCurveClaimCreatorFees,
} from "@/generated/contracts-generated";
import { formatToken, formatUsd } from "@/lib/format";
import { poolPriceFromReserves } from "@/lib/use-venue-price";
import { FACTORY_ADDRESS, USDC_ADDRESS } from "@/lib/wagmi";

type Address = `0x${string}`;

type ApiLaunch = {
  token: string;
  curve: string;
  creator: string;
  name: string;
  symbol: string;
  graduated?: boolean;
};

type Position = {
  curve: string;
  usdcSpent: string;
  usdcReceived: string;
  tokensBought: string;
  tokensSold: string;
  tradeCount: number;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const balanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const priceAbi = [
  {
    type: "function",
    name: "currentPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const earningsAbi = [
  {
    type: "function",
    name: "creatorEarnings",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioView />
    </Suspense>
  );
}

function PortfolioView() {
  const { address: connected } = useAccount();
  // Optional view-only override: /portfolio?account=0x…
  const forced = useSearchParams().get("account");
  const validated =
    forced && /^0x[0-9a-fA-F]{40}$/.test(forced)
      ? (forced as Address)
      : undefined;
  const address = validated ?? connected;

  const [launches, setLaunches] = useState<ApiLaunch[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    Promise.all([
      fetch("/api/launches?sort=new&limit=200").then((r) => r.json()),
      fetch(`/api/portfolio?address=${address}`).then((r) => r.json()),
    ])
      .then(([launchData, posData]) => {
        if (cancelled) return;
        setLaunches((launchData.launches ?? []) as ApiLaunch[]);
        setPositions((posData.positions ?? []) as Position[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Connect your wallet to see positions and P&L.
        </p>
      </div>
    );
  }

  return (
    <PortfolioBody
      key={nonce}
      address={address}
      launches={launches}
      positions={positions}
      onClaimed={() => setNonce((n) => n + 1)}
    />
  );
}

function PortfolioBody({
  address,
  launches,
  positions,
  onClaimed,
}: {
  address: Address;
  launches: ApiLaunch[] | null;
  positions: Position[] | null;
  onClaimed: () => void;
}) {
  const publicClient = usePublicClient();
  const claimAsync = useWriteBondingCurveClaimCreatorFees().writeContractAsync;
  const [claimingCurve, setClaimingCurve] = useState<string | null>(null);

  const activePositions = useMemo(
    () =>
      (positions ?? [])
        .filter((p) => BigInt(p.tokensBought) - BigInt(p.tokensSold) > 0n)
        .map((p) => ({
          ...p,
          launch: launches?.find((l) => l.curve === p.curve),
        }))
        .filter((p): p is typeof p & { launch: ApiLaunch } =>
          Boolean(p.launch),
        ),
    [positions, launches],
  );

  const createdLaunches = useMemo(
    () =>
      address === undefined
        ? []
        : (launches ?? []).filter(
            (l) => l.creator.toLowerCase() === address.toLowerCase(),
          ),
    [launches, address],
  );

  // ---- chain reads (one multicall per group; arrays keyed on nonce) ----
  const balanceQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: p.launch.token as Address,
      abi: balanceAbi,
      functionName: "balanceOf" as const,
      args: [address ?? ZERO] as const,
    })),
    query: { enabled: Boolean(address) && activePositions.length > 0 },
  });

  const priceQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: p.curve as Address,
      abi: priceAbi,
      functionName: "currentPrice" as const,
    })),
    query: { enabled: activePositions.length > 0 },
  });

  const { data: migrator } = useReadLaunchFactoryMigrator({
    address: FACTORY_ADDRESS,
    query: { enabled: activePositions.some((p) => p.launch.graduated) },
  });
  const { data: ammFactory } = useReadAmmMigratorFactory({
    address: migrator,
    query: { enabled: Boolean(migrator) },
  });
  const pairQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: ammFactory ?? ZERO,
      abi: ammFactoryAbi,
      functionName: "getPair" as const,
      args: [p.launch.token as Address, USDC_ADDRESS] as const,
    })),
    query: {
      enabled:
        Boolean(ammFactory) && activePositions.some((p) => p.launch.graduated),
      refetchInterval: 10_000,
    },
  });
  const pairAddresses = activePositions.map((p, i) =>
    p.launch.graduated
      ? ((pairQueries.data?.[i]?.result as Address | undefined) ?? ZERO)
      : ZERO,
  );
  const token0Queries = useReadContracts({
    contracts: pairAddresses.map((pair) => ({
      address: pair,
      abi: ammPairAbi,
      functionName: "token0" as const,
    })),
    query: {
      enabled: pairAddresses.some((pair) => pair !== ZERO),
      refetchInterval: 10_000,
    },
  });
  const reserveQueries = useReadContracts({
    contracts: pairAddresses.map((pair) => ({
      address: pair,
      abi: ammPairAbi,
      functionName: "getReserves" as const,
    })),
    query: {
      enabled: pairAddresses.some((pair) => pair !== ZERO),
      refetchInterval: 10_000,
    },
  });

  const earningsQueries = useReadContracts({
    contracts: createdLaunches.map((l) => ({
      address: l.curve as Address,
      abi: earningsAbi,
      functionName: "creatorEarnings" as const,
      args: [(address ?? ZERO) as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(address) && createdLaunches.length > 0 },
  });

  const rows = activePositions.map((p, i) => {
    const balance = balanceQueries.data?.[i]?.result as bigint | undefined;
    const curvePrice = priceQueries.data?.[i]?.result as bigint | undefined;
    const poolPrice = poolPriceFromReserves(
      p.launch.token as Address,
      token0Queries.data?.[i]?.result as Address | undefined,
      reserveQueries.data?.[i]?.result as readonly [bigint, bigint] | undefined,
    );
    const priceRaw = p.launch.graduated ? poolPrice : curvePrice;
    const value =
      balance !== undefined && priceRaw !== undefined
        ? (balance * priceRaw) / 10n ** 18n
        : undefined;

    const invested = BigInt(p.usdcSpent) - BigInt(p.usdcReceived);
    const pnl = value !== undefined ? value - invested : undefined;

    return { ...p, balance, value, invested, pnl };
  });

  const totalValue = rows.reduce((acc, r) => acc + (r.value ?? 0n), 0n);
  const totalPnl = rows.reduce((acc, r) => acc + (r.pnl ?? 0n), 0n);

  const totalUnclaimed = earningsQueries.data?.reduce(
    (acc, q) => acc + ((q.result as bigint | undefined) ?? 0n),
    0n,
  );

  async function claim(curve: Address) {
    if (!publicClient) return;
    try {
      setClaimingCurve(curve);
      const hash = await claimAsync({ address: curve });
      await publicClient.waitForTransactionReceipt({ hash });
      onClaimed();
    } catch (err) {
      console.error(err);
    } finally {
      setClaimingCurve(null);
    }
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <h1 className="text-lg font-bold">Portfolio</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Connect your wallet to see positions and P&amp;L.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* summary */}
      <div>
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Stat label="Open positions" value={String(rows.length)} />
          <Stat label="Current value" value={formatUsd(totalValue)} />
          <Stat
            label="Net P&L"
            value={formatUsd(totalPnl)}
            tone={
              totalPnl > 0n
                ? "text-emerald-400"
                : totalPnl < 0n
                  ? "text-red-400"
                  : ""
            }
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Net P&amp;L = current value − (USDC spent − USDC received). Realized
          profits are already netted into cost.
        </p>
      </div>

      {/* positions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Positions</h2>
        {positions === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-zinc-900" />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
            No open positions.{" "}
            <Link href="/" className="text-emerald-400 hover:underline">
              Explore tokens →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Token</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium">Net cost</th>
                  <th className="px-4 py-2 text-right font-medium">Net P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.curve}
                    className="border-b border-zinc-800/50 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-semibold">
                      <Link
                        href={`/token/${r.launch.token}`}
                        className="hover:text-emerald-300"
                      >
                        {r.launch.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-300">
                      {formatToken(r.balance)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-300">
                      {formatUsd(r.value)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-300">
                      {formatUsd(r.invested)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        r.pnl === undefined
                          ? "text-zinc-500"
                          : r.pnl >= 0n
                            ? "text-emerald-400"
                            : "text-red-400"
                      }`}
                    >
                      {r.pnl === undefined ? "—" : formatUsd(r.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* creator earnings */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-200">
            Creator earnings ·{" "}
            <span className="font-normal text-zinc-500">
              {createdLaunches.length} launch
              {createdLaunches.length === 1 ? "" : "es"}
            </span>
          </h2>
          <span className="font-mono text-sm tabular-nums text-emerald-400">
            {totalUnclaimed !== undefined
              ? `${formatUsd(totalUnclaimed)} unclaimed`
              : ""}
          </span>
        </div>
        {earningsQueries.isLoading ? (
          <div className="h-20 animate-pulse rounded-xl bg-zinc-900" />
        ) : createdLaunches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
            You haven&apos;t launched any tokens.{" "}
            <Link href="/create" className="text-emerald-400 hover:underline">
              Launch one →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {createdLaunches.map((l, i) => {
              const earned = earningsQueries.data?.[i]?.result as
                | bigint
                | undefined;
              return (
                <li
                  key={l.curve}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
                >
                  <span className="font-semibold">{l.symbol}</span>
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-sm tabular-nums text-emerald-400">
                      {earned !== undefined ? formatUsd(earned) : "—"}
                    </span>
                    <button
                      type="button"
                      disabled={
                        earned === undefined ||
                        earned === 0n ||
                        claimingCurve === l.curve
                      }
                      onClick={() => claim(l.curve as Address)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        earned === undefined ||
                        earned === 0n ||
                        claimingCurve === l.curve
                          ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
                          : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                      }`}
                    >
                      {claimingCurve === l.curve ? "Claiming…" : "Claim"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-zinc-600">
          Creators earn 0.25% of every trade on their token&apos;s bonding
          curve, claimable any time.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`mt-1 font-mono text-xl tabular-nums ${tone ?? "text-zinc-100"}`}
      >
        {value}
      </div>
    </div>
  );
}
