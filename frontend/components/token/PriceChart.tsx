"use client";

import { useEffect, useMemo, useState } from "react";
import { CurveChart } from "@/components/token/CurveChart";
import { formatUsd } from "@/lib/format";

type Candle = {
  time: number;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  trades: number;
};

const INTERVALS = [
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
] as const;

const W = 600;
const H = 280;
const PAD_L = 8;
const PAD_R = 64; // room for the price axis
const PRICE_H = 210;
const VOL_TOP = 226;
const VOL_H = 40;

/// Real indexed candles when trade history exists,
/// otherwise the theoretical bonding-curve trajectory.
export function PriceChart({
  token,
  curve,
}: {
  token: `0x${string}`;
  curve: `0x${string}`;
}) {
  const [intervalSec, setIntervalSec] = useState<number>(60);
  const [candles, setCandles] = useState<Candle[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/candles?token=${token}&interval=${intervalSec}&limit=240`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { candles?: Candle[] };
        if (!cancelled) setCandles(data.candles ?? []);
      } catch {
        /* keep whatever we had; the trade feed surfaces indexer outages */
      }
    }

    poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, intervalSec]);

  const hasCandles = candles !== null && candles.length > 0;

  return (
    <section className="order-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:col-start-1 lg:row-start-2">
      {hasCandles ? (
        <CandleSvg candles={candles!} intervalSec={intervalSec} onInterval={setIntervalSec} />
      ) : (
        <>
          <CurveChart curveAddress={curve} />
          <p className="mt-1 text-center text-xs text-zinc-600">
            {candles === null
              ? "Loading price history…"
              : "Candles appear with the first trades — showing the live curve until then"}
          </p>
        </>
      )}
    </section>
  );
}

function CandleSvg({
  candles,
  intervalSec,
  onInterval,
}: {
  candles: Candle[];
  intervalSec: number;
  onInterval: (s: number) => void;
}) {
  const chart = useMemo(() => {
    const maxBars = Math.min(candles.length, 60);
    const view = candles.slice(-maxBars);

    const prices = view.flatMap((c) => [
      Number(c.high) / 1e6,
      Number(c.low) / 1e6,
    ]);
    const vols = view.map((c) => Number(c.volume) / 1e6);
    let pMin = Math.min(...prices);
    let pMax = Math.max(...prices);
    if (pMax === pMin) {
      pMax += pMax * 0.01 || 1e-12;
      pMin -= pMin * 0.01 || 1e-12;
    }
    const pad = (pMax - pMin) * 0.08;
    pMin -= pad;
    pMax += pad;
    const vMax = Math.max(...vols, 1e-12);

    const plotW = W - PAD_L - PAD_R;
    const slot = plotW / view.length;
    const bodyW = Math.max(2, Math.min(14, slot * 0.62));

    const py = (p: number) =>
      14 + (1 - (p - pMin) / (pMax - pMin)) * (PRICE_H - 14);
    const cx = (i: number) => PAD_L + slot * i + slot / 2;

    const candleEls = view.map((c, i) => {
      const o = Number(c.open) / 1e6;
      const cl = Number(c.close) / 1e6;
      const h = Number(c.high) / 1e6;
      const l = Number(c.low) / 1e6;
      const up = cl >= o;
      const color = up ? "#34d399" : "#f87171";
      const yO = py(o);
      const yC = py(cl);
      return (
        <g key={c.time}>
          <line
            x1={cx(i)}
            x2={cx(i)}
            y1={py(h)}
            y2={py(l)}
            stroke={color}
            strokeWidth="1"
            opacity="0.85"
          />
          <rect
            x={cx(i) - bodyW / 2}
            y={Math.min(yO, yC)}
            width={bodyW}
            height={Math.max(1.5, Math.abs(yC - yO))}
            fill={color}
            rx="1"
          />
        </g>
      );
    });

    const volumeEls = view.map((c, i) => {
      const vh = Math.max(1, (Number(c.volume) / 1e6 / vMax) * VOL_H);
      return (
        <rect
          key={`v-${c.time}`}
          x={cx(i) - bodyW / 2}
          y={VOL_TOP + VOL_H - vh}
          width={bodyW}
          height={vh}
          fill={Number(c.close) >= Number(c.open) ? "#34d399" : "#f87171"}
          opacity="0.35"
        />
      );
    });

    const lastPrice = Number(view[view.length - 1].close) / 1e6;

    return {
      candleEls,
      volumeEls,
      lastPrice,
      lastY: py(lastPrice),
      volLabel: formatUsd(BigInt(Math.round(vMax * 1e6))),
    };
  }, [candles]);

  return (
    <figure>
      {/* interval selector */}
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => onInterval(i.seconds)}
              aria-pressed={intervalSec === i.seconds}
              className={`rounded-md px-2 py-0.5 font-mono text-xs transition-colors ${
                intervalSec === i.seconds
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-zinc-600">
          {candles.length} candles · indexed trades
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Price candles"
      >
        {[0.25, 0.5, 0.75].map((f) => {
          const y = 14 + f * (PRICE_H - 14);
          return (
            <line
              key={f}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y}
              y2={y}
              stroke="#27272a"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          );
        })}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PRICE_H}
          y2={PRICE_H}
          stroke="#27272a"
        />

        {chart.candleEls}
        {chart.volumeEls}

        {/* last price marker */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={chart.lastY}
          y2={chart.lastY}
          stroke="#34d399"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.6"
        />
        <rect
          x={W - PAD_R + 4}
          y={chart.lastY - 9}
          width={PAD_R - 8}
          height={18}
          rx="4"
          fill="#052e22"
          stroke="#34d399"
          strokeWidth="1"
        />
        <text
          x={W - PAD_R + 8}
          y={chart.lastY + 4}
          fontSize="10"
          fill="#34d399"
          fontFamily="var(--font-geist-mono)"
        >
          {chart.lastPrice.toPrecision(4)}
        </text>

        {/* volume axis */}
        <text
          x={W - PAD_R + 4}
          y={VOL_TOP + 10}
          fontSize="9"
          fill="#71717a"
          fontFamily="var(--font-geist-mono)"
        >
          {chart.volLabel}
        </text>
      </svg>
    </figure>
  );
}
