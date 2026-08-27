"use client";

import { shortAddress } from "@/lib/format";

interface Holder {
  rank: number;
  address: string;
  avatarSeed: string;
  positionUsd: number;
  pnlUsd: number;
  pnlPercent: number;
  supplyPercent: number;
}

export function HoldersTable({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  // Deterministic sample holders based on token address for immediate visual parity
  const seed = parseInt(tokenAddress.slice(2, 6), 16) || 42;
  const holders: Holder[] = [
    {
      rank: 1,
      address: "0x71C...aB9",
      avatarSeed: "Stridooor",
      positionUsd: 319.83 + (seed % 100),
      pnlUsd: -1500,
      pnlPercent: -70.4,
      supplyPercent: 1.56,
    },
    {
      rank: 2,
      address: "0x34A...f12",
      avatarSeed: "rigidshark30166",
      positionUsd: 249.8,
      pnlUsd: -869.26,
      pnlPercent: -45.2,
      supplyPercent: 1.22,
    },
    {
      rank: 3,
      address: "0x98E...c04",
      avatarSeed: "crassorca20660",
      positionUsd: 246.96,
      pnlUsd: 547.83,
      pnlPercent: 31.0,
      supplyPercent: 1.21,
    },
    {
      rank: 4,
      address: "0x12B...e55",
      avatarSeed: "warmseal68696",
      positionUsd: 226.67,
      pnlUsd: -970.15,
      pnlPercent: -55.0,
      supplyPercent: 1.11,
    },
    {
      rank: 5,
      address: "0x54F...d88",
      avatarSeed: "tilitid",
      positionUsd: 226.32,
      pnlUsd: -916.54,
      pnlPercent: -50.2,
      supplyPercent: 1.1,
    },
    {
      rank: 6,
      address: "0xAB3...112",
      avatarSeed: "clearsalmon1144",
      positionUsd: 217.19,
      pnlUsd: -210.14,
      pnlPercent: -15.4,
      supplyPercent: 1.06,
    },
    {
      rank: 7,
      address: "0xCD8...339",
      avatarSeed: "scharoX",
      positionUsd: 198.26,
      pnlUsd: -8.94,
      pnlPercent: -1.2,
      supplyPercent: 0.97,
    },
  ];

  return (
    <div className="rounded-[10px] bg-[#141519] border border-[#24262e] overflow-hidden flex flex-col">
      {/* Tabs Header */}
      <div className="flex items-center gap-2 p-2.5 border-b border-[#24262e] bg-[#101114] text-xs font-mono">
        <button
          type="button"
          className="rounded-[4px] bg-[#1a1b21] border border-[#24262e] px-2.5 py-1 font-bold text-white"
        >
          Arc.fun (318)
        </button>
        <button
          type="button"
          className="rounded-[4px] px-2 py-1 text-zinc-400 hover:text-white transition"
        >
          All (1,007)
        </button>
        <button
          type="button"
          className="rounded-[4px] px-2 py-1 text-zinc-400 hover:text-white transition"
        >
          Following
        </button>
      </div>

      {/* Holders Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-[#24262e] text-[10px] font-bold uppercase text-zinc-500 bg-[#141519]">
              <th className="px-3 py-2">Holder</th>
              <th className="px-3 py-2 text-right">Position</th>
              <th className="px-3 py-2 text-right">PnL</th>
              <th className="px-3 py-2 text-right">% supply</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1b22]">
            {holders.map((h) => (
              <tr key={h.rank} className="transition hover:bg-[#1a1b21]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-[#1a1b21] border border-[#24262e] flex items-center justify-center text-[10px]">
                      👾
                    </div>
                    <span className="font-bold text-zinc-200 truncate max-w-[100px]">
                      {h.avatarSeed}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-zinc-200">
                  ${h.positionUsd.toFixed(2)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-bold ${
                    h.pnlUsd >= 0 ? "text-[#4ade80]" : "text-[#ef4444]"
                  }`}
                >
                  {h.pnlUsd >= 0
                    ? `+$${h.pnlUsd.toFixed(2)}`
                    : `-$${Math.abs(h.pnlUsd).toFixed(2)}`}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400">
                  {h.supplyPercent}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
