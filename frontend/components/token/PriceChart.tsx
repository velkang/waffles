'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useReadWafflesBondingCurveTotalSupply } from '@/generated/contracts-generated'
import { useCandles } from '@/lib/hooks/queries'
import { useRealtime, useRealtimeTopics } from '@/lib/realtime/RealtimeProvider'
import type { Candle } from '@waffles/shared'

const INTERVALS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3_600 },
  { label: '4h', seconds: 14_400 },
  { label: '1D', seconds: 86_400 },
] as const

const PRICE_SCALE = 1e18
const USDC_SCALE = 1e6
const TOKEN_SCALE = 1e18
const UP = '#4ade80'
const DOWN = '#ef4444'
const COPPER = '#db9d6a'
const BORDER = '#24262e'
const SURFACE = '#141519'
const MUTED = '#71717a'

type DisplayMode = 'price' | 'mcap'

interface Readout {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface ChartDataset {
  candles: CandlestickData<UTCTimestamp>[]
  volume: HistogramData<UTCTimestamp>[]
  latest: Readout | null
}

export function PriceChart({
  token,
  curve,
}: {
  token: `0x${string}`
  curve: `0x${string}`
}) {
  useRealtimeTopics([`token:${token.toLowerCase()}`])

  const { status } = useRealtime()
  const [intervalSec, setIntervalSec] = useState<number>(60)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('price')
  const [hovered, setHovered] = useState<Readout | null>(null)
  const { data, isLoading, isError, refetch } = useCandles(
    token,
    intervalSec,
    240,
  )
  const { data: totalSupply } = useReadWafflesBondingCurveTotalSupply({
    address: curve,
  })

  const dataset = useMemo(
    () => buildDataset(data?.candles ?? [], displayMode, totalSupply),
    [data?.candles, displayMode, totalSupply],
  )
  const readout = hovered ?? dataset.latest
  const selectedInterval =
    INTERVALS.find((interval) => interval.seconds === intervalSec)?.label ??
    `${intervalSec}s`

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#24262e] bg-[#141519]">
      <div className="flex flex-col gap-3 border-b border-[#24262e] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Market chart</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Confirmed trades · UTC candles
            </p>
          </div>
          <RealtimeStatus status={status} />
        </div>

        <div
          className="inline-flex w-fit rounded-[6px] border border-[#24262e] bg-[#0e0f12] p-0.5 text-xs font-semibold"
          aria-label="Chart value"
        >
          <ModeButton
            active={displayMode === 'price'}
            onClick={() => setDisplayMode('price')}
          >
            Price
          </ModeButton>
          <ModeButton
            active={displayMode === 'mcap'}
            disabled={totalSupply === undefined}
            onClick={() => setDisplayMode('mcap')}
          >
            Market cap
          </ModeButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex max-w-full gap-1 overflow-x-auto pb-1"
          aria-label="Candle interval"
        >
          {INTERVALS.map((interval) => (
            <button
              key={interval.label}
              type="button"
              aria-pressed={intervalSec === interval.seconds}
              onClick={() => setIntervalSec(interval.seconds)}
              className={`shrink-0 rounded-[5px] border px-2.5 py-1.5 font-mono text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#db9d6a] ${
                intervalSec === interval.seconds
                  ? 'border-[#db9d6a] bg-[#db9d6a] text-[#0e0f12]'
                  : 'border-[#24262e] bg-[#1a1b21] text-zinc-400 hover:border-zinc-600 hover:text-white'
              }`}
            >
              {interval.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-500">
          {readout ? (
            <>
              <Metric
                label="O"
                value={formatValue(readout.open, displayMode)}
              />
              <Metric
                label="H"
                value={formatValue(readout.high, displayMode)}
                tone="up"
              />
              <Metric
                label="L"
                value={formatValue(readout.low, displayMode)}
                tone="down"
              />
              <Metric
                label="C"
                value={formatValue(readout.close, displayMode)}
              />
              <Metric label="VOL" value={formatCompactUsd(readout.volume)} />
              <span className="text-zinc-600">
                {formatCandleTime(readout.time)}
              </span>
            </>
          ) : (
            <span>OHLCV appears with the first confirmed trade</span>
          )}
        </div>
      </div>

      <div className="relative mt-1 min-h-[340px] sm:min-h-[390px]">
        <FinancialChart
          dataset={dataset}
          displayMode={displayMode}
          intervalSec={intervalSec}
          onHover={setHovered}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#141519]/90">
            <p className="font-mono text-xs text-zinc-400">
              Loading {selectedInterval} candles…
            </p>
          </div>
        )}

        {!isLoading && isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141519]/95 px-6 text-center">
            <p className="text-sm font-semibold text-white">
              Chart data is unavailable
            </p>
            <p className="mt-1 max-w-sm text-xs text-zinc-400">
              Realtime remains connected; retry the historical candle snapshot.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-[6px] border border-[#db9d6a] px-3 py-1.5 text-xs font-bold text-[#db9d6a] transition-colors hover:bg-[#db9d6a] hover:text-[#0e0f12]"
            >
              Retry candles
            </button>
          </div>
        )}

        {!isLoading && !isError && dataset.candles.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 h-px w-16 bg-[#db9d6a]" />
            <p className="text-sm font-semibold text-white">
              No trades in this interval yet
            </p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-400">
              The first confirmed trade will create the active candle here
              automatically.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function FinancialChart({
  dataset,
  displayMode,
  intervalSec,
  onHover,
}: {
  dataset: ChartDataset
  displayMode: DisplayMode
  intervalSec: number
  onHover: (readout: Readout | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const renderStateRef = useRef({ key: '', length: 0, lastTime: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: SURFACE },
        textColor: MUTED,
        fontSize: 11,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: 'rgba(36, 38, 46, 0.5)' },
        horzLines: { color: 'rgba(36, 38, 46, 0.75)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#52525b', labelBackgroundColor: '#27272a' },
        horzLine: { color: '#52525b', labelBackgroundColor: '#27272a' },
      },
      rightPriceScale: {
        borderColor: BORDER,
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
      priceLineColor: COPPER,
      priceLineWidth: 1,
      priceLineVisible: true,
      lastValueVisible: true,
    })
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        onHover(null)
        return
      }
      const candle = param.seriesData.get(candleSeries)
      const volume = param.seriesData.get(volumeSeries)
      if (!candle || !('open' in candle)) {
        onHover(null)
        return
      }
      onHover({
        time: param.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: volume && 'value' in volume ? volume.value : 0,
      })
    })

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      })
    })
    resizeObserver.observe(container)

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      renderStateRef.current = { key: '', length: 0, lastTime: 0 }
    }
  }, [onHover])

  useEffect(() => {
    const chart = chartRef.current
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (!chart || !candleSeries || !volumeSeries) return

    const latest = dataset.candles.at(-1)
    const key = `${displayMode}:${intervalSec}`
    const previous = renderStateRef.current
    const latestTime = latest ? Number(latest.time) : 0
    const canUpdateLastBar =
      previous.key === key &&
      dataset.candles.length > 0 &&
      (latestTime === previous.lastTime ||
        (latestTime > previous.lastTime &&
          dataset.candles.length === previous.length + 1))

    candleSeries.applyOptions({
      priceFormat: {
        type: 'custom',
        minMove: minimumMove(latest?.close ?? 0),
        formatter: (value: number) => formatAxisValue(value, displayMode),
      },
    })

    if (canUpdateLastBar && latest) {
      candleSeries.update(latest)
      const latestVolume = dataset.volume.at(-1)
      if (latestVolume) volumeSeries.update(latestVolume)
    } else {
      candleSeries.setData(dataset.candles)
      volumeSeries.setData(dataset.volume)
      if (dataset.candles.length > 0) chart.timeScale().fitContent()
    }

    renderStateRef.current = {
      key,
      length: dataset.candles.length,
      lastTime: latestTime,
    }
  }, [dataset, displayMode, intervalSec])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      role="img"
      aria-label={`${displayMode === 'price' ? 'Price' : 'Market cap'} candlestick chart with volume`}
    />
  )
}

function buildDataset(
  candles: Candle[],
  mode: DisplayMode,
  totalSupply: bigint | undefined,
): ChartDataset {
  const supply =
    totalSupply === undefined ? undefined : Number(totalSupply) / TOKEN_SCALE
  const valueFor = (raw: string) => {
    const price = Number(raw) / PRICE_SCALE
    return mode === 'mcap' && supply !== undefined ? price * supply : price
  }

  const sorted = [...candles].sort((a, b) => a.time - b.time)
  const points = sorted.flatMap((candle) => {
    const point = {
      time: Math.floor(candle.time / 1000) as UTCTimestamp,
      open: valueFor(candle.open),
      high: valueFor(candle.high),
      low: valueFor(candle.low),
      close: valueFor(candle.close),
    }
    if (
      !Number.isFinite(point.open) ||
      !Number.isFinite(point.high) ||
      !Number.isFinite(point.low) ||
      !Number.isFinite(point.close)
    ) {
      return []
    }
    return [
      {
        candle: point,
        volume: {
          time: point.time,
          value: Number(candle.volume) / USDC_SCALE,
          color:
            point.close >= point.open
              ? 'rgba(74, 222, 128, 0.35)'
              : 'rgba(239, 68, 68, 0.35)',
        },
      },
    ]
  })

  const mapped = points.map((point) => point.candle)
  const volumes = points.map((point) => point.volume)
  const latestCandle = mapped.at(-1)
  const latestVolume = volumes.at(-1)

  return {
    candles: mapped,
    volume: volumes,
    latest:
      latestCandle && latestVolume
        ? {
            ...latestCandle,
            volume: latestVolume.value,
          }
        : null,
  }
}

function RealtimeStatus({
  status,
}: {
  status: 'connecting' | 'connected' | 'disconnected'
}) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  const label = connected ? 'Live' : connecting ? 'Connecting' : 'Reconnecting'
  const dot = connected
    ? 'bg-[#4ade80]'
    : connecting
      ? 'bg-[#db9d6a]'
      : 'bg-[#ef4444]'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#24262e] bg-[#0e0f12] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[4px] px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#db9d6a] disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-[#24262e] text-white' : 'text-zinc-500 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
}) {
  return (
    <span>
      {label}{' '}
      <span
        className={
          tone === 'up'
            ? 'text-[#4ade80]'
            : tone === 'down'
              ? 'text-[#ef4444]'
              : 'text-zinc-200'
        }
      >
        {value}
      </span>
    </span>
  )
}

function minimumMove(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.00000001
  return 10 ** (Math.floor(Math.log10(value)) - 5)
}

function formatAxisValue(value: number, mode: DisplayMode): string {
  if (mode === 'mcap') return formatCompactNumber(value)
  if (value === 0) return '$0'
  if (Math.abs(value) >= 1)
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
  if (Math.abs(value) >= 0.0001)
    return `$${value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
  return `$${value.toPrecision(4)}`
}

function formatValue(value: number, mode: DisplayMode): string {
  return mode === 'mcap'
    ? formatCompactNumber(value)
    : formatAxisValue(value, mode)
}

function formatCompactNumber(value: number): string {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatCompactUsd(value: number): string {
  return formatCompactNumber(value)
}

function formatCandleTime(time: UTCTimestamp): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(new Date(Number(time) * 1000))
}
