'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import {
  wafflesAmmFactoryAbi,
  wafflesAmmPairAbi,
  useReadWafflesAmmMigratorFactory,
  useReadWafflesLaunchFactoryMigrator,
  useWriteWafflesBondingCurveClaimCreatorFees,
} from '@/generated/contracts-generated'
import { formatToken, formatUsd } from '@/lib/format'
import { poolPriceFromReserves } from '@/lib/use-venue-price'
import { FACTORY_ADDRESS, USDC_ADDRESS } from '@/lib/wagmi'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useLaunches, usePortfolio } from '@/lib/hooks/queries'
import { useRealtimeTopics } from '@/lib/realtime/RealtimeProvider'

type Address = `0x${string}`

type ApiLaunch = {
  token: string
  curve: string
  creator: string
  name: string
  symbol: string
  graduated?: boolean
}

type Position = {
  curve: string
  usdcSpent: string
  usdcReceived: string
  tokensBought: string
  tokensSold: string
  tradeCount: number
}

const ZERO = '0x0000000000000000000000000000000000000000' as Address

const balanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const priceAbi = [
  {
    type: 'function',
    name: 'currentPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const earningsAbi = [
  {
    type: 'function',
    name: 'creatorEarnings',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioView />
    </Suspense>
  )
}

function PortfolioView() {
  const { address: connected } = useAccount()
  const forced = useSearchParams().get('account')
  const validated =
    forced && /^0x[0-9a-fA-F]{40}$/.test(forced)
      ? (forced as Address)
      : undefined
  const address = validated ?? connected

  useRealtimeTopics(address ? [`portfolio:${address.toLowerCase()}`] : [])

  const { data: launchData, isLoading: launchesLoading } = useLaunches({
    sort: 'new',
    limit: 200,
  })
  const { data: portfolioData, isLoading: portfolioLoading } =
    usePortfolio(address)

  const launches = useMemo(
    () =>
      (launchData?.launches as ApiLaunch[]) ?? (launchesLoading ? null : []),
    [launchData, launchesLoading],
  )
  const positions = useMemo(
    () =>
      (portfolioData?.positions as Position[]) ??
      (portfolioLoading ? null : []),
    [portfolioData, portfolioLoading],
  )
  const [nonce, setNonce] = useState(0)

  if (!address) {
    return (
      <div className="mx-auto max-w-md rounded-[10px] border border-[#24262e] bg-[#141519] p-8 text-center font-mono">
        <h1 className="text-base font-bold text-white uppercase tracking-wider">
          PORTFOLIO TERMINAL
        </h1>
        <p className="mt-2 text-xs text-zinc-400">
          Connect your wallet to track active token holdings, P&amp;L, and
          creator rewards.
        </p>
      </div>
    )
  }

  return (
    <PortfolioBody
      key={nonce}
      address={address}
      launches={launches}
      positions={positions}
      onClaimed={() => setNonce((n) => n + 1)}
    />
  )
}

function PortfolioBody({
  address,
  launches,
  positions,
  onClaimed,
}: {
  address: Address
  launches: ApiLaunch[] | null
  positions: Position[] | null
  onClaimed: () => void
}) {
  const publicClient = usePublicClient()
  const claimAsync =
    useWriteWafflesBondingCurveClaimCreatorFees().writeContractAsync
  const [claimingCurve, setClaimingCurve] = useState<string | null>(null)

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
  )

  const createdLaunches = useMemo(
    () =>
      address === undefined
        ? []
        : (launches ?? []).filter(
            (l) => l.creator.toLowerCase() === address.toLowerCase(),
          ),
    [launches, address],
  )

  // Chain reads for active positions
  const balanceQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: p.launch.token as Address,
      abi: balanceAbi,
      functionName: 'balanceOf' as const,
      args: [address ?? ZERO] as const,
    })),
    query: { enabled: Boolean(address) && activePositions.length > 0 },
  })

  const priceQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: p.curve as Address,
      abi: priceAbi,
      functionName: 'currentPrice' as const,
    })),
    query: { enabled: activePositions.length > 0 },
  })

  const { data: migrator } = useReadWafflesLaunchFactoryMigrator({
    address: FACTORY_ADDRESS,
    query: { enabled: activePositions.some((p) => p.launch.graduated) },
  })
  const { data: ammFactory } = useReadWafflesAmmMigratorFactory({
    address: migrator,
    query: { enabled: Boolean(migrator) },
  })
  const pairQueries = useReadContracts({
    contracts: activePositions.map((p) => ({
      address: ammFactory ?? ZERO,
      abi: wafflesAmmFactoryAbi,
      functionName: 'getPair' as const,
      args: [p.launch.token as Address, USDC_ADDRESS] as const,
    })),
    query: {
      enabled:
        Boolean(ammFactory) && activePositions.some((p) => p.launch.graduated),
      refetchInterval: 10_000,
    },
  })
  const pairAddresses = activePositions.map((p, i) =>
    p.launch.graduated
      ? ((pairQueries.data?.[i]?.result as Address | undefined) ?? ZERO)
      : ZERO,
  )
  const token0Queries = useReadContracts({
    contracts: pairAddresses.map((pair) => ({
      address: pair,
      abi: wafflesAmmPairAbi,
      functionName: 'token0' as const,
    })),
    query: {
      enabled: pairAddresses.some((pair) => pair !== ZERO),
      refetchInterval: 10_000,
    },
  })
  const reserveQueries = useReadContracts({
    contracts: pairAddresses.map((pair) => ({
      address: pair,
      abi: wafflesAmmPairAbi,
      functionName: 'getReserves' as const,
    })),
    query: {
      enabled: pairAddresses.some((pair) => pair !== ZERO),
      refetchInterval: 10_000,
    },
  })

  const earningsQueries = useReadContracts({
    contracts: createdLaunches.map((l) => ({
      address: l.curve as Address,
      abi: earningsAbi,
      functionName: 'creatorEarnings' as const,
      args: [(address ?? ZERO) as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(address) && createdLaunches.length > 0 },
  })

  const rows = activePositions.map((p, i) => {
    const balance = balanceQueries.data?.[i]?.result as bigint | undefined
    const curvePrice = priceQueries.data?.[i]?.result as bigint | undefined
    const poolPrice = poolPriceFromReserves(
      p.launch.token as Address,
      token0Queries.data?.[i]?.result as Address | undefined,
      reserveQueries.data?.[i]?.result as readonly [bigint, bigint] | undefined,
    )
    const priceRaw = p.launch.graduated ? poolPrice : curvePrice
    const value =
      balance !== undefined && priceRaw !== undefined
        ? (balance * priceRaw) / 10n ** 30n
        : undefined

    const invested = BigInt(p.usdcSpent) - BigInt(p.usdcReceived)
    const pnl = value !== undefined ? value - invested : undefined

    return { ...p, balance, value, invested, pnl }
  })

  const totalValue = rows.reduce((acc, r) => acc + (r.value ?? 0n), 0n)
  const totalPnl = rows.reduce((acc, r) => acc + (r.pnl ?? 0n), 0n)

  const totalUnclaimed = earningsQueries.data?.reduce(
    (acc, q) => acc + ((q.result as bigint | undefined) ?? 0n),
    0n,
  )

  async function claim(curve: Address) {
    if (!publicClient) return
    try {
      setClaimingCurve(curve)
      const hash = await claimAsync({ address: curve })
      await publicClient.waitForTransactionReceipt({ hash })
      onClaimed()
    } catch (err) {
      console.error(err)
    } finally {
      setClaimingCurve(null)
    }
  }

  return (
    <div className="space-y-5 font-mono">
      {/* Header & Stats */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Portfolio
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Denominated in{' '}
          <span className="text-[#db9d6a] font-bold">Circle USDC</span> on Arc
          L1.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              ACTIVE POSITIONS
            </span>
            <div className="mt-1 text-xl font-bold text-[#db9d6a]">
              {rows.length}
            </div>
          </div>
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              PORTFOLIO VALUE
            </span>
            <div className="mt-1 text-xl font-bold text-white">
              {formatUsd(totalValue)}
            </div>
          </div>
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
              TOTAL NET P&amp;L
            </span>
            <div
              className={`mt-1 text-xl font-bold ${
                totalPnl > 0n
                  ? 'text-[#4ade80]'
                  : totalPnl < 0n
                    ? 'text-[#ef4444]'
                    : 'text-zinc-300'
              }`}
            >
              {totalPnl >= 0n ? `+${formatUsd(totalPnl)}` : formatUsd(totalPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Active Positions Ledger
        </h2>
        {positions === null ? (
          <div className="h-28 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
        ) : rows.length === 0 ? (
          <div className="rounded-[10px] border border-[#24262e] p-8 text-center text-xs text-zinc-400 bg-[#141519]">
            No active positions •{' '}
            <Link href="/" className="font-bold text-[#db9d6a] hover:underline">
              Explore floor →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-[#24262e] bg-[#141519]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#24262e] bg-[#101114] text-[10px] font-bold uppercase text-zinc-400">
                  <th className="px-4 py-3">TOKEN</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3 text-right">HOLDINGS</th>
                  <th className="px-4 py-3 text-right">VALUE</th>
                  <th className="px-4 py-3 text-right">COST BASIS</th>
                  <th className="px-4 py-3 text-right">NET P&amp;L</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1b22]">
                {rows.map((r) => (
                  <tr key={r.curve} className="transition hover:bg-[#1a1b21]">
                    <td className="px-4 py-3 font-bold text-white">
                      <Link
                        href={`/token/${r.launch.token}`}
                        className="hover:text-[#db9d6a] transition"
                      >
                        ${r.launch.symbol}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge graduated={r.launch.graduated} size="xs" />
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">
                      {formatToken(r.balance)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-white">
                      {formatUsd(r.value)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">
                      {formatUsd(r.invested)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        r.pnl === undefined
                          ? 'text-zinc-500'
                          : r.pnl >= 0n
                            ? 'text-[#4ade80]'
                            : 'text-[#ef4444]'
                      }`}
                    >
                      {r.pnl === undefined
                        ? '—'
                        : r.pnl >= 0n
                          ? `+${formatUsd(r.pnl)}`
                          : formatUsd(r.pnl)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/token/${r.launch.token}`}
                        className="rounded-[4px] bg-[#db9d6a] px-3 py-1 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] transition"
                      >
                        Trade
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Creator Fee Claims */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#db9d6a]">
            Creator Earnings (0.70% OF CURVE TRADE VOLUME)
          </h2>
          <span className="text-xs font-bold text-[#db9d6a]">
            {totalUnclaimed !== undefined
              ? `${formatUsd(totalUnclaimed)} TOTAL UNCLAIMED`
              : ''}
          </span>
        </div>

        {earningsQueries.isLoading ? (
          <div className="h-20 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
        ) : createdLaunches.length === 0 ? (
          <div className="rounded-[10px] border border-[#24262e] p-6 text-center text-xs text-zinc-500 bg-[#141519]">
            No tokens created under this address
          </div>
        ) : (
          <div className="space-y-2">
            {createdLaunches.map((l, i) => {
              const earned = earningsQueries.data?.[i]?.result as
                | bigint
                | undefined
              return (
                <div
                  key={l.curve}
                  className="flex items-center justify-between rounded-[8px] border border-[#24262e] bg-[#141519] px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white">${l.symbol}</span>
                    <span className="text-xs text-zinc-500">{l.name}</span>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <span className="text-sm font-bold text-[#db9d6a]">
                      {earned !== undefined ? formatUsd(earned) : '—'}
                    </span>
                    <button
                      type="button"
                      disabled={
                        earned === undefined ||
                        earned === 0n ||
                        claimingCurve === l.curve
                      }
                      onClick={() => claim(l.curve as Address)}
                      className="rounded-[4px] bg-[#db9d6a] px-3 py-1 text-xs font-bold text-[#0e0f12] transition hover:bg-[#e5ab7a] disabled:opacity-40 disabled:cursor-not-allowed uppercase"
                    >
                      {claimingCurve === l.curve ? 'Claiming…' : 'Claim'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
