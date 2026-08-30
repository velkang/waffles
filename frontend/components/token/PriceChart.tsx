'use client'

import { useMemo, useState } from 'react'
import { CurveChart } from '@/components/token/CurveChart'
import { formatUsd } from '@/lib/format'
import { useCandles } from '@/lib/hooks/queries'
import { useRealtimeTopics } from '@/lib/realtime/RealtimeProvider'
import type { Candle } from '@waffles/shared'

const INTERVALS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
] as const

const EMERALD = '#4ade80'
const CRIMSON = '#ef4444'
const GRATICULE = '#24262e'

const W = 600
const H = 280
const PAD_L = 8
const PAD_R = 64
const PRICE_H = 210
const VOL_TOP = 226
const VOL_H = 40

export function PriceChart({
  token,
  curve,
}: {
  token: `0x${string}`
  curve: `0x${string}`
}) {
  useRealtimeTopics([`token:${token.toLowerCase()}`])
  const [intervalSec, setIntervalSec] = useState<number>(60)
  const { data, isLoading } = useCandles(token, intervalSec, 240)
  const candles = data?.candles ?? (isLoading ? null : [])

  const hasCandles = candles !== null && candles.length > 0

  return (
    <section className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4">
      {hasCandles ? (
        <CandleSvg
          candles={candles!}
          intervalSec={intervalSec}
          onInterval={setIntervalSec}
        />
      ) : (
        <>
          <CurveChart curveAddress={curve} />
          <p className="mt-2 text-center text-xs font-mono text-zinc-400">
            {candles === null
              ? 'Streaming historical ticks…'
              : 'Showing live curve trajectory · Candles appear with first trades'}
          </p>
        </>
      )}
    </section>
  )
}

function CandleSvg({
  candles,
  intervalSec,
  onInterval,
}: {
  candles: Candle[]
  intervalSec: number
  onInterval: (s: number) => void
}) {
  const chart = useMemo(() => {
    const maxBars = Math.min(candles.length, 60)
    const view = candles.slice(-maxBars)
    if (view.length === 0) return null

    let pMin = Infinity
    let pMax = -Infinity
    let vMax = 0
    view.forEach((c) => {
      const h = Number(c.high)
      const l = Number(c.low)
      const v = Number(c.volume)
      if (h > pMax) pMax = h
      if (l < pMin) pMin = l
      if (v > vMax) vMax = v
    })

    if (pMax === pMin) {
      pMax *= 1.05
      pMin *= 0.95
    }
    const pRange = pMax - pMin || 1
    const vRange = vMax || 1

    const plotW = W - PAD_L - PAD_R
    const barW = Math.max(3, Math.min(10, plotW / view.length - 2))
    const step = plotW / view.length

    const yP = (p: number) =>
      PRICE_H - ((p - pMin) / pRange) * (PRICE_H - 16) - 8
    const yV = (v: number) => VOL_TOP + VOL_H - (v / vRange) * VOL_H

    const bars = view.map((c, i) => {
      const x = PAD_L + i * step + step / 2
      const o = Number(c.open)
      const cl = Number(c.close)
      const h = Number(c.high)
      const l = Number(c.low)
      const v = Number(c.volume)
      const isUp = cl >= o
      const bodyTop = yP(Math.max(o, cl))
      const bodyBot = yP(Math.min(o, cl))
      const bodyH = Math.max(1, bodyBot - bodyTop)

      return {
        x,
        wickY1: yP(h),
        wickY2: yP(l),
        bodyTop,
        bodyH,
        isUp,
        vH: VOL_TOP + VOL_H - yV(v),
        volY: yV(v),
        c,
      }
    })

    const last = view[view.length - 1]
    const lastPrice = Number(last.close)

    return {
      bars,
      pMin,
      pMax,
      vMax,
      barW,
      lastPrice,
      yLast: yP(lastPrice),
    }
  }, [candles])

  if (!chart) return null

  return (
    <div>
      {/* Header controls (Pump.fun style) */}
      <div className="mb-2 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-1">
          {INTERVALS.map((int) => (
            <button
              key={int.label}
              type="button"
              onClick={() => onInterval(int.seconds)}
              className={`rounded-[4px] px-2.5 py-1 font-bold transition ${
                intervalSec === int.seconds
                  ? 'bg-[#db9d6a] text-[#0e0f12]'
                  : 'bg-[#1a1b21] text-zinc-400 hover:text-white border border-[#24262e]'
              }`}
            >
              {int.label}
            </button>
          ))}
          <span className="text-zinc-500 ml-2">Price/MCap</span>
        </div>
        <span className="text-[11px] text-zinc-400">
          LAST:{' '}
          <span className="font-bold text-white">
            ${(chart.lastPrice / 1e18).toFixed(9)}
          </span>
        </span>
      </div>

      <figure className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none"
          role="img"
        >
          {/* Graticule lines */}
          <line
            x1={PAD_L}
            y1={PRICE_H / 4}
            x2={W - PAD_R}
            y2={PRICE_H / 4}
            stroke={GRATICULE}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1={PAD_L}
            y1={PRICE_H / 2}
            x2={W - PAD_R}
            y2={PRICE_H / 2}
            stroke={GRATICULE}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1={PAD_L}
            y1={(PRICE_H * 3) / 4}
            x2={W - PAD_R}
            y2={(PRICE_H * 3) / 4}
            stroke={GRATICULE}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1={PAD_L}
            y1={PRICE_H}
            x2={W - PAD_R}
            y2={PRICE_H}
            stroke={GRATICULE}
            strokeWidth="1"
          />
          <line
            x1={PAD_L}
            y1={VOL_TOP + VOL_H}
            x2={W - PAD_R}
            y2={VOL_TOP + VOL_H}
            stroke={GRATICULE}
            strokeWidth="1"
          />

          {/* Right Y-axis price labels */}
          <text
            x={W - PAD_R + 6}
            y={14}
            fill="#71717a"
            fontSize="9"
            fontFamily="monospace"
          >
            ${(chart.pMax / 1e18).toPrecision(4)}
          </text>
          <text
            x={W - PAD_R + 6}
            y={PRICE_H / 2}
            fill="#71717a"
            fontSize="9"
            fontFamily="monospace"
          >
            $
            {((chart.pMin + (chart.pMax - chart.pMin) / 2) / 1e18).toPrecision(
              4,
            )}
          </text>
          <text
            x={W - PAD_R + 6}
            y={PRICE_H - 4}
            fill="#71717a"
            fontSize="9"
            fontFamily="monospace"
          >
            ${(chart.pMin / 1e18).toPrecision(4)}
          </text>

          {/* Volume baseline */}
          <text
            x={W - PAD_R + 6}
            y={VOL_TOP + 10}
            fill="#71717a"
            fontSize="8"
            fontFamily="monospace"
          >
            VOL {formatUsd(BigInt(Math.round(chart.vMax)))}
          </text>

          {/* Volume Bars */}
          {chart.bars.map((b, i) => (
            <rect
              key={`v-${i}`}
              x={b.x - chart.barW / 2}
              y={b.volY}
              width={chart.barW}
              height={Math.max(1, b.vH)}
              fill={b.isUp ? EMERALD : CRIMSON}
              opacity={0.4}
            />
          ))}

          {/* Candles */}
          {chart.bars.map((b, i) => (
            <g key={`c-${i}`}>
              <line
                x1={b.x}
                y1={b.wickY1}
                x2={b.x}
                y2={b.wickY2}
                stroke={b.isUp ? EMERALD : CRIMSON}
                strokeWidth="1"
              />
              <rect
                x={b.x - chart.barW / 2}
                y={b.bodyTop}
                width={chart.barW}
                height={b.bodyH}
                fill={b.isUp ? EMERALD : CRIMSON}
              />
            </g>
          ))}

          {/* Last Price Marker */}
          <line
            x1={PAD_L}
            y1={chart.yLast}
            x2={W - PAD_R}
            y2={chart.yLast}
            stroke="#db9d6a"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <rect
            x={W - PAD_R + 2}
            y={chart.yLast - 7}
            width={PAD_R - 4}
            height={14}
            fill="#db9d6a"
            rx="3"
          />
          <text
            x={W - PAD_R + 5}
            y={chart.yLast + 3}
            fill="#0e0f12"
            fontSize="8.5"
            fontWeight="bold"
            fontFamily="monospace"
          >
            ${(chart.lastPrice / 1e18).toPrecision(4)}
          </text>
        </svg>
      </figure>
    </div>
  )
}
