'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ensureAppKit } from '@/lib/appkit'
import { shortAddress } from '@/lib/format'
import { CommandPalette } from './ui/CommandPalette'

export function Header() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [walletStatus, setWalletStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  )

  const preloadWallet = () => {
    void ensureAppKit().catch(() => undefined)
  }

  const openWallet = async () => {
    setWalletStatus('loading')
    try {
      const modal = await ensureAppKit()
      await modal.open()
      setWalletStatus('idle')
    } catch {
      setWalletStatus('error')
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#24262e] bg-[#0e0f12]/95 backdrop-blur-xs">
        {/* Main Top Nav Bar */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
          {/* Left: Back / Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#db9d6a] text-[#0e0f12] font-black text-base transition-transform group-hover:scale-105 select-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                🧇
              </div>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-lg font-black tracking-tight text-white group-hover:text-[#db9d6a] transition-colors">
                  waffles<span className="text-[#db9d6a]">.meme</span>
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
                <span className="hidden sm:inline">
                  Search for coins and creators on waffles...
                </span>
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
              <span className="text-sm leading-none text-[#db9d6a] font-bold">
                +
              </span>
              <span className="hidden sm:inline">Create</span>
            </Link>

            <Link
              href="/portfolio"
              className={`rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
                pathname === '/portfolio'
                  ? 'bg-[#1a1b21] text-[#db9d6a] border border-[#db9d6a]/40'
                  : 'text-zinc-400 hover:text-white hover:bg-[#141519]'
              }`}
            >
              Portfolio
            </Link>

            <Link
              href="/rewards"
              title="Rewards"
              aria-label="Rewards"
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-xs font-bold transition ${
                pathname === '/rewards'
                  ? 'border border-[#db9d6a]/40 bg-[#1a1b21] text-[#db9d6a]'
                  : 'text-zinc-400 hover:bg-[#141519] hover:text-white'
              }`}
            >
              <span className="hidden sm:inline">Rewards</span>
            </Link>

            <button
              type="button"
              onMouseEnter={preloadWallet}
              onFocus={preloadWallet}
              onClick={() => void openWallet()}
              title={walletStatus === 'error' ? 'Wallet failed to load. Click to retry.' : undefined}
              className="rounded-[6px] bg-[#db9d6a] px-3 py-1.5 text-xs font-bold text-[#0e0f12] transition hover:bg-[#e5ab7a] disabled:cursor-wait disabled:opacity-70"
              disabled={walletStatus === 'loading'}
            >
              {walletStatus === 'loading'
                ? 'Loading…'
                : walletStatus === 'error'
                  ? 'Retry wallet'
                  : isConnected && address
                    ? shortAddress(address)
                    : 'Connect'}
            </button>
          </div>
        </div>
      </header>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </>
  )
}
