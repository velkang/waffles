"use client";

import { useMemo } from "react";
import {
  useReadWafflesBondingCurveK,
  useReadWafflesBondingCurveReserveUsdc,
  useReadWafflesBondingCurveTotalSupply,
  useReadWafflesBondingCurveVirtualUsdc,
} from "@/generated/contracts-generated";

const EMERALD = "#4ade80";
const COPPER = "#db9d6a";
const BORDER = "#24262e";

const W = 600;
const H = 220;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

export function CurveChart({ curveAddress }: { curveAddress: `0x${string}` }) {
  const { data: k } = useReadWafflesBondingCurveK({ address: curveAddress });
  const { data: virtualUsdc } = useReadWafflesBondingCurveVirtualUsdc({
    address: curveAddress,
  });
  const { data: totalSupply } = useReadWafflesBondingCurveTotalSupply({
    address: curveAddress,
  });
  const { data: reserveUsdc } = useReadWafflesBondingCurveReserveUsdc({
    address: curveAddress,
  });

  const chart = useMemo(() => {
    if (!k || !virtualUsdc || !totalSupply) return undefined;
    const K = Number(k);
    const Vx = Number(virtualUsdc);
    const T = Number(totalSupply);

    const xAt = (mcap: number) => Math.sqrt((mcap * K) / T);
    const mcapAt = (raised: number) => {
      const X = Vx + raised;
      return (X * X * T) / K;
    };

    const startMcap = mcapAt(0);
    const ceiling = Math.max(startMcap * 25, startMcap * 1.05);
    const raisedMax = xAt(ceiling) - Vx;

    const points: Array<[number, number]> = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const r = (raisedMax * i) / N;
      points.push([r, mcapAt(r)]);
    }
    const mcapMin = points[0][1];
    const mcapMax = points[points.length - 1][1];

    const sx = (r: number) =>
      PAD_X + (r / raisedMax) * (W - 2 * PAD_X);
    const sy = (m: number) =>
      PAD_TOP +
      (1 - (m - mcapMin) / (mcapMax - mcapMin)) * (H - PAD_TOP - PAD_BOTTOM);

    const path = points
      .map(([r, m], i) => `${i === 0 ? "M" : "L"}${sx(r)},${sy(m)}`)
      .join(" ");

    return { path, sx, sy, raisedMax, mcapMin, mcapMax, K, Vx, T };
  }, [k, virtualUsdc, totalSupply]);

  const now = useMemo(() => {
    if (!chart || reserveUsdc === undefined) return undefined;
    const X = chart.Vx + Number(reserveUsdc);
    const mcapNow = (X * X * chart.T) / chart.K;
    return { x: chart.sx(Number(reserveUsdc)), y: chart.sy(mcapNow) };
  }, [chart, reserveUsdc]);

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
            {reserveUsdc !== undefined &&
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
                  <circle cx={now.x} cy={now.y} r="8" fill="none" stroke={COPPER} strokeWidth="1" opacity="0.6" />
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
          $50,000 GRADUATION TARGET
        </text>
      </svg>
    </figure>
  );
}
