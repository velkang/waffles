"use client";

import Link from "next/link";
import { useAppKit } from "@reown/appkit/react";
import { useAccount } from "wagmi";

export function Header() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-black tracking-tight">
          arc<span className="text-emerald-400">.fun</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm text-zinc-400 hover:text-white">
            Explore
          </Link>
          <Link
            href="/portfolio"
            className="text-sm text-zinc-400 hover:text-white"
          >
            Portfolio
          </Link>
          <Link
            href="/create"
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Create
          </Link>
          {isConnected && address ? (
            <button
              onClick={() => open()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-sm text-zinc-300 hover:border-zinc-500"
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => open()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Connect Wallet
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
