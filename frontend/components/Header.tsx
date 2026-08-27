"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { CommandPalette } from "./ui/CommandPalette";

export function Header() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#24262e] bg-[#0e0f12]/95 backdrop-blur-xs">
        {/* Main Top Nav Bar */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
          {/* Left: Back / Brand */}
          <div className="flex items-center gap-3 shrink-0">
            {pathname !== "/" && (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
                title="Go back"
              >
                ‹
              </button>
            )}

            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#db9d6a] text-[#0e0f12] font-black text-sm transition-transform group-hover:scale-105">
                ▲
              </div>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-lg font-black tracking-tight text-white group-hover:text-[#db9d6a] transition-colors">
                  arc<span className="text-[#db9d6a]">.fun</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Center: Expansive Search Bar */}
          <div className="flex-1 max-w-xl mx-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center justify-between rounded-[8px] border border-[#24262e] bg-[#141519] px-3.5 py-1.5 text-xs text-zinc-400 hover:border-[#db9d6a] hover:text-white transition-all"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5 text-zinc-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="hidden sm:inline">Search for coins and users...</span>
                <span className="sm:hidden">Search coins...</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 bg-[#1a1b21] border border-[#24262e] rounded-[4px]">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: + Create, Portfolio, Connect Wallet */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/create"
              className="flex items-center gap-1.5 rounded-[6px] border border-[#24262e] bg-[#141519] px-3 py-1.5 text-xs font-bold text-zinc-200 hover:border-[#db9d6a] hover:text-white hover:bg-[#1a1b21] transition"
            >
              <span className="text-sm leading-none text-[#db9d6a] font-bold">+</span>
              <span className="hidden sm:inline">Create</span>
            </Link>

            <Link
              href="/portfolio"
              className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
                pathname === "/portfolio"
                  ? "bg-[#1a1b21] text-[#db9d6a] border border-[#db9d6a]/40"
                  : "text-zinc-400 hover:text-white hover:bg-[#141519]"
              }`}
            >
              Portfolio
            </Link>

            {isConnected && address ? (
              <button
                onClick={() => open()}
                type="button"
                className="flex items-center gap-1.5 rounded-[6px] border border-[#24262e] bg-[#141519] px-3 py-1.5 text-xs font-mono font-bold text-zinc-200 hover:border-[#db9d6a] hover:bg-[#1a1b21] transition"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                <span>{address.slice(0, 6)}…{address.slice(-4)}</span>
              </button>
            ) : (
              <button
                onClick={() => open()}
                type="button"
                className="rounded-[6px] bg-[#db9d6a] px-3.5 py-1.5 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] transition active:scale-98"
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
