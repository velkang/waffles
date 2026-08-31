'use client'

import { useMemo } from 'react'
import {
  useReadWafflesBondingCurveK,
  useReadWafflesBondingCurveGraduationMarketCapTarget,
  useReadWafflesBondingCurveVirtualUsdcReserve,
  useReadWafflesBondingCurveInitialVirtualUsdcReserve,
  useReadWafflesBondingCurveTargetVirtualUsdcReserve,
  useReadWafflesBondingCurveTotalSupply,
} from '@/generated/contracts-generated'

const EMERALD = '#4ade80'
const COPPER = '#db9d6a'
const BORDER = '#24262e'

const W = 600
const PAD_X = 8
const PAD_TOP = 14

export function CurveChart({
  curveAddress,
  compact = false,
}: {
  curveAddress: `0x${string}`
  compact?: boolean
}) {
  const H = compact ? 126 : 220
  const PAD_BOTTOM = compact ? 20 : 22
  const { data: k } = useReadWafflesBondingCurveK({ address: curveAddress })
  const { data: initialVirtualUsdc } =
    useReadWafflesBondingCurveInitialVirtualUsdcReserve({
      address: curveAddress,
    })
  const { data: virtualUsdcReserve } =
    useReadWafflesBondingCurveVirtualUsdcReserve({ address: curveAddress })
  const { data: targetVirtualUsdc } =
    useReadWafflesBondingCurveTargetVirtualUsdcReserve({
      address: curveAddress,
    })
  const { data: graduationTarget } =
    useReadWafflesBondingCurveGraduationMarketCapTarget({
      address: curveAddress,
    })
  const { data: totalSupply } = useReadWafflesBondingCurveTotalSupply({
    address: curveAddress,
  })

  const chart = useMemo(() => {
    if (!k || !initialVirtualUsdc || !targetVirtualUsdc || !totalSupply)
      return undefined
    const K = Number(k)
    const Vx = Number(initialVirtualUsdc)
    const T = Number(totalSupply)

    const mcapAt = (raised: number) => {
      const X = Vx + raised
      return (X * X * T) / K
    }

    const raisedMax = Number(targetVirtualUsdc) - Vx

    const points: Array<[number, number]> = []
    const N = 120
    for (let i = 0; i <= N; i++) {
      const r = (raisedMax * i) / N
      points.push([r, mcapAt(r)])
    }
    const mcapMin = points[0][1]
    const mcapMax = points[points.length - 1][1]

    const sx = (r: number) => PAD_X + (r / raisedMax) * (W - 2 * PAD_X)
    const sy = (m: number) =>
      PAD_TOP +
      (1 - (m - mcapMin) / (mcapMax - mcapMin)) * (H - PAD_TOP - PAD_BOTTOM)

    const path = points
      .map(([r, m], i) => `${i === 0 ? 'M' : 'L'}${sx(r)},${sy(m)}`)
      .join(' ')

    return { path, sx, sy, raisedMax, mcapMin, mcapMax, K, Vx, T }
  }, [H, PAD_BOTTOM, k, initialVirtualUsdc, targetVirtualUsdc, totalSupply])

  // Current position on the curve: derived from virtualUsdcReserve
  const now = useMemo(() => {
    if (!chart || virtualUsdcReserve === undefined || !initialVirtualUsdc)
      return undefined
    // reserveUsdc = virtualUsdcReserve - initialVirtualUsdc
    const raised = Math.min(
      chart.raisedMax,
      Math.max(0, Number(virtualUsdcReserve) - Number(initialVirtualUsdc)),
    )
    const X = chart.Vx + raised
    const mcapNow = (X * X * chart.T) / chart.K
    return { x: chart.sx(raised), y: chart.sy(mcapNow) }
  }, [chart, virtualUsdcReserve, initialVirtualUsdc])

  // Format graduation target label
  const gradLabel = useMemo(() => {
    if (graduationTarget === undefined) return '$— GRADUATION TARGET'
    // graduationTarget is in raw USDC (6 decimals)
    const usd = Number(graduationTarget) / 1e6
    if (usd >= 1000) {
      return `$${(usd / 1000).toFixed(usd % 1000 === 0 ? 0 : 1)}K GRADUATION TARGET`
    }
    return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })} GRADUATION TARGET`
  }, [graduationTarget])

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        role="img"
        aria-label="Bonding curve market cap trajectory"
      >
        {/* Baseline */}
        <line
          x1={PAD_X}
          y1={H - PAD_BOTTOM}
          x2={W - PAD_X}
          y2={H - PAD_BOTTOM}
          stroke={BORDER}
          strokeWidth="1"
        />

        {/* Graduation Threshold Target Line */}
        <line
          x1={W - PAD_X}
          y1={PAD_TOP}
          x2={W - PAD_X}
          y2={H - PAD_BOTTOM}
          stroke={EMERALD}
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.8"
        />

        {chart && (
          <>
            <path
              d={chart.path}
              fill="none"
              stroke={COPPER}
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Current Position Marker (Solid flat) */}
            {virtualUsdcReserve !== undefined &&
              now &&
              isFinite(now.x) &&
              isFinite(now.y) && (
                <g>
                  <line
                    x1={now.x}
                    y1={now.y}
                    x2={now.x}
                    y2={H - PAD_BOTTOM}
                    stroke={COPPER}
                    strokeOpacity="0.7"
                    strokeDasharray="3 3"
                  />
                  <circle cx={now.x} cy={now.y} r="5" fill={COPPER} />
                  <circle
                    cx={now.x}
                    cy={now.y}
                    r="8"
                    fill="none"
                    stroke={COPPER}
                    strokeWidth="1"
                    opacity="0.6"
                  />
                </g>
              )}
          </>
        )}

        <text
          x={PAD_X}
          y={H - 6}
          fontSize="10"
          fill="#71717a"
          fontFamily="monospace"
          fontWeight="500"
        >
          $0 RAISED
        </text>
        <text
          x={W - PAD_X}
          y={H - 6}
          fontSize="10"
          fill="#4ade80"
          textAnchor="end"
          fontFamily="monospace"
          fontWeight="700"
        >
          {gradLabel}
        </text>
      </svg>
    </figure>
  )
}
