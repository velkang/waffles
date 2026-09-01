'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { formatUsd } from '@/lib/format'
import { getOptimizedImageUrl } from '@/lib/image'

export interface TrendingToken {
  token: string
  name: string
  symbol: string
  mcap?: bigint | string
  imageUri?: string
  description?: string
  graduated?: boolean
}

export function TrendingCarousel({ tokens }: { tokens: TrendingToken[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -320 : 320
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
    }
  }

  if (!tokens || tokens.length === 0) return null

  return (
    <section className="space-y-3">
      {/* Header with Title and Scroll Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white tracking-wide">
          Trending now
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
            aria-label="Scroll left"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#141519] border border-[#24262e] text-zinc-400 hover:text-white hover:border-[#db9d6a] transition"
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      </div>

      {/* Horizontal Scrolling Card Track */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-none scroll-smooth snap-x"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tokens.map((token) => {
          const mcapVal =
            typeof token.mcap === 'bigint'
              ? token.mcap
              : BigInt(token.mcap || 0)

          return (
            <Link
              key={token.token}
              href={`/token/${token.token}`}
              className="group shrink-0 w-[240px] sm:w-[280px] snap-start rounded-[10px] bg-[#141519] border border-[#24262e] overflow-hidden hover:border-[#db9d6a] transition-all flex flex-col"
            >
              {/* Media Area (3:2 Aspect Ratio) */}
              <div className="relative aspect-[3/2] w-full bg-[#1a1b21] overflow-hidden">
                {token.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getOptimizedImageUrl(token.imageUri, {
                      width: 400,
                      height: 266,
                      quality: 75,
                    })}
                    alt={token.name}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#1a1b21] text-2xl font-black text-[#db9d6a]">
                    ${token.symbol.slice(0, 4)}
                  </div>
                )}

                {/* Flat Dark Bottom Overlay for Stats */}
                <div className="absolute inset-x-0 bottom-0 bg-[#0e0f12]/90 p-2.5 backdrop-blur-xs border-t border-[#24262e]">
                  <div className="text-sm font-black text-white">
                    {formatUsd(mcapVal)}
                  </div>
                  <div className="text-xs font-bold text-zinc-200 truncate">
                    {token.name}{' '}
                    <span className="text-zinc-400 font-normal">
                      ${token.symbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description snippet */}
              <div className="p-2.5 text-xs text-zinc-400 line-clamp-2 leading-relaxed bg-[#141519]">
                {token.description ||
                  'Arc L1 Fair Launch token backed by virtual USDC curve.'}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
