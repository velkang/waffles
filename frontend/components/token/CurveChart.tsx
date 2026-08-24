"use client";

import { useMemo } from "react";
import {
  useReadBondingCurveGraduated,
  useReadBondingCurveK,
  useReadBondingCurveReserveUsdc,
  useReadBondingCurveTotalSupply,
  useReadBondingCurveVirtualUsdc,
} from "@/generated/contracts-generated";
import { formatUsd } from "@/lib/format";

const W = 600;
const H = 220;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

/**
 * The real bonding-curve market-cap trajectory, derived from on-chain
 * constants: with X = v_x + raised and conservation X·Y = k,
 * market cap = X² · totalSupply / k.
 */
export function CurveChart({ curveAddress }: { curveAddress: `0x${string}` }) {
  const { data: k } = useReadBondingCurveK({ address: curveAddress });
  const { data: virtualUsdc } = useReadBondingCurveVirtualUsdc({
    address: curveAddress,
  });
  const { data: totalSupply } = useReadBondingCurveTotalSupply({
    address: curveAddress,
  });
  const { data: reserveUsdc } = useReadBondingCurveReserveUsdc({
    address: curveAddress,
  });

  const chart = useMemo(() => {
    if (!k || !virtualUsdc || !totalSupply) return undefined;
    const K = Number(k);
    const Vx = Number(virtualUsdc);
    const T = Number(totalSupply);

    // raised needed to reach a given mcap: X = sqrt(mcap * k / T)
    const xAt = (mcap: number) => Math.sqrt((mcap * K) / T);
    const mcapAt = (raised: number) => {
      const X = Vx + raised;
      return (X * X * T) / K;
    };

    // domain: up to the raise where mcap hits ~1.15x of a sensible ceiling
    const startMcap = mcapAt(0);
    const ceiling = Math.max(startMcap * 25, startMcap * 1.05); // full curve range
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
    const area = `${path} L${sx(raisedMax)},${H - PAD_BOTTOM} L${sx(0)},${
      H - PAD_BOTTOM
    } Z`;

    return { path, area, sx, sy, raisedMax, mcapMin, mcapMax, K, Vx, T };
  }, [k, virtualUsdc, totalSupply]);

  const { data: graduated } = useReadBondingCurveGraduated({
    address: curveAddress,
  });

  const now = useMemo(() => {
    if (!chart || reserveUsdc === undefined) return undefined;
    const X = chart.Vx + Number(reserveUsdc);
    const mcapNow = (X * X * chart.T) / chart.K;
    return { x: chart.sx(Number(reserveUsdc)), y: chart.sy(mcapNow) };
  }, [chart, reserveUsdc]);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Bonding curve market cap trajectory"
      >
        <defs>
          <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1={PAD_X}
          y1={H - PAD_BOTTOM}
          x2={W - PAD_X}
          y2={H - PAD_BOTTOM}
          stroke="#27272a"
          strokeWidth="1"
        />

        {chart && (
          <>
            <path d={chart.area} fill="url(#curveFill)" />
            <path
              d={chart.path}
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* current position */}
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
                    stroke="#34d399"
                    strokeOpacity="0.35"
                    strokeDasharray="3 4"
                  />
                  <circle cx={now.x} cy={now.y} r="5" fill="#34d399">
                    {!graduated && (
                      <animate
                        attributeName="r"
                        values="4;6;4"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>
                </g>
              )}
          </>
        )}

        <text
          x={PAD_X}
          y={H - 6}
          fontSize="10"
          fill="#71717a"
          fontFamily="var(--font-geist-mono)"
        >
          $0 raised
        </text>
        <text
          x={W - PAD_X}
          y={H - 6}
          fontSize="10"
          fill="#71717a"
          textAnchor="end"
          fontFamily="var(--font-geist-mono)"
        >
          {chart
            ? `${formatUsd(
                BigInt(
                  Math.round(
                    ((chart.Vx + chart.raisedMax) ** 2 * chart.T) / chart.K,
                  ),
                ),
              )} raised`
            : ""}
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-zinc-600">
        Market cap as a function of USDC raised — the live curve, not a price
        history
      </figcaption>
    </figure>
  );
}
