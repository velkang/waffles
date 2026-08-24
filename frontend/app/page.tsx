"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import {
  launchFactoryAbi,
  memeTokenAbi,
  useReadBondingCurveGraduationProgressBps,
  useReadLaunchFactoryAllTokensLength,
} from "@/generated/contracts-generated";
import { FACTORY_ADDRESS } from "@/lib/wagmi";
import { useVenuePrice } from "@/lib/use-venue-price";

type Address = `0x${string}`;

type ApiLaunch = {
  token: string;
  curve: string;
  creator: string;
  name: string;
  symbol: string;
  imageUri?: string;
  graduated?: boolean;
  createdAt: string;
  volume24h?: string;
};

function formatUsd(raw: bigint | undefined) {
  if (raw === undefined) return "—";
  const n = Number(formatUnits(raw, 6));
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatVolume(raw: string | undefined) {
  if (!raw || raw === "0") return undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) return undefined;
  return formatUsd(BigInt(Math.round(n)));
}

function TokenRow({
  token,
  curve,
  symbol,
  imageUri,
  volume24h,
}: {
  token: Address;
  curve: Address;
  symbol?: string;
  imageUri?: string;
  volume24h?: string;
}) {
  const venue = useVenuePrice(token, curve);
  const { data: progressBps } = useReadBondingCurveGraduationProgressBps({
    address: curve,
  });
  const { data: chainSymbol } = useReadContracts({
    contracts: [
      {
        address: token,
        abi: memeTokenAbi,
        functionName: "symbol" as const,
      },
    ],
    query: { enabled: !symbol },
  });
  const resolvedSymbol =
    symbol ??
    ((chainSymbol?.[0]?.result as string | undefined) ?? "");

  const progress = progressBps !== undefined ? Number(progressBps) / 100 : 0;
  const vol = formatVolume(volume24h);

  return (
    <Link
      href={`/token/${token}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-emerald-500/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {imageUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUri}
              alt=""
              className="h-10 w-10 rounded-full border border-zinc-800 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-600 font-bold text-zinc-950">
              {(resolvedSymbol || "?").slice(0, 2)}
            </div>
          )}
          <div>
            <div className="font-semibold">
              {resolvedSymbol || "…"}
              <span className="text-zinc-500"> / USDC</span>
            </div>
            <div className="font-mono text-xs text-zinc-500">
              {token.slice(0, 6)}…{token.slice(-4)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono">{formatUsd(venue.mcap)}</div>
          <div className="text-xs text-zinc-500">
            MC{vol ? ` · ${vol} 24h` : ""}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${
              venue.graduated ? "bg-violet-400" : "bg-emerald-400"
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>{venue.graduated ? "Graduated" : `Bonding curve ${progress.toFixed(1)}%`}</span>
          <span>{venue.graduated ? "Trades on DEX" : "Graduates at $50K MC"}</span>
        </div>
      </div>
    </Link>
  );
}

/// Polls the indexer's launch index; null while unavailable.
function useApiLaunches(sort: "new" | "volume") {
  const [state, setState] = useState<{
    launches: ApiLaunch[] | null;
    available: boolean;
  }>({ launches: null, available: true });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/launches?sort=${sort}&limit=100`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { launches: ApiLaunch[] };
        if (!cancelled)
          setState({ launches: data.launches ?? [], available: true });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, available: false }));
      }
    }

    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sort]);

  return state;
}

export default function Home() {
  const [sort, setSort] = useState<"new" | "volume">("new");
  const api = useApiLaunches(sort);

  // ---- fallback path: read everything from the chain ----
  const { data: length } = useReadLaunchFactoryAllTokensLength({
    address: FACTORY_ADDRESS,
  });

  const indices = useMemo(() => {
    const n = Number(length ?? 0);
    return Array.from({ length: n }, (_, i) => BigInt(n - 1 - i));
  }, [length]);

  const tokensQuery = useReadContracts({
    contracts: indices.map((i) => ({
      address: FACTORY_ADDRESS,
      abi: launchFactoryAbi,
      functionName: "allTokens" as const,
      args: [i] as const,
    })),
    query: { enabled: indices.length > 0 && !api.available },
  });

  const tokenAddresses = useMemo(
    () =>
      (tokensQuery.data ?? [])
        .map((r) => r.result as Address | undefined)
        .filter((a): a is Address => Boolean(a)),
    [tokensQuery.data],
  );

  const launchesQuery = useReadContracts({
    contracts: tokenAddresses.map((token) => ({
      address: FACTORY_ADDRESS,
      abi: launchFactoryAbi,
      functionName: "launchOfToken" as const,
      args: [token] as const,
    })),
    query: { enabled: tokenAddresses.length > 0 && !api.available },
  });

  const chainLaunches = useMemo(() => {
    return (launchesQuery.data ?? [])
      .map((r) =>
        r.result as readonly [
          Address,
          Address,
          Address,
          ...unknown[],
        ]
        | undefined,
      )
      .filter(
        (l): l is readonly [Address, Address, Address, ...unknown[]] =>
          Boolean(l),
      )
      .map((l) => ({ token: l[0], curve: l[1] }));
  }, [launchesQuery.data]);

  if (!FACTORY_ADDRESS) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-amber-300">
        Factory address not configured. Set{" "}
        <code className="font-mono">NEXT_PUBLIC_FACTORY_ADDRESS</code> in{" "}
        <code className="font-mono">.env.local</code> and deploy the contracts.
      </div>
    );
  }

  const usingApi = api.available && api.launches !== null && api.launches.length > 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {sort === "new" ? "Live on Arc" : "Trending on Arc"}
        </h1>
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {(["new", "volume"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                sort === s
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s === "new" ? "New" : "Trending"}
            </button>
          ))}
        </div>
      </div>

      {!usingApi && !api.available && (
        <p className="mb-4 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-600">
          Indexer offline — showing on-chain launch registry without volumes.
        </p>
      )}

      {usingApi ? (
        api.launches!.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {api.launches!.map((l) => (
              <TokenRow
                key={l.token}
                token={l.token as Address}
                curve={l.curve as Address}
                symbol={l.symbol}
                imageUri={l.imageUri || undefined}
                volume24h={l.volume24h}
              />
            ))}
          </div>
        )
      ) : chainLaunches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {chainLaunches.map((l) => (
            <TokenRow key={l.token} token={l.token} curve={l.curve} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
      No tokens yet. Be the first —{" "}
      <Link href="/create" className="text-emerald-400 hover:underline">
        create one
      </Link>
      .
    </div>
  );
}
