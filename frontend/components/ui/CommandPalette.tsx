"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLaunches } from "@/lib/hooks/queries";

interface TokenResult {
  token: string;
  name: string;
  symbol: string;
  mcap?: string;
  graduated?: boolean;
}

export function CommandPalette({
  onClose,
}: {
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data, isLoading: loading } = useLaunches({ limit: 100 });
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const results = useMemo(() => {
    const launches = (data?.launches ?? []) as TokenResult[];
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return launches.slice(0, 8);
    return launches
      .filter(
        (launch) =>
          launch.symbol.toLowerCase().includes(normalizedQuery) ||
          launch.name.toLowerCase().includes(normalizedQuery) ||
          launch.token.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 10);
  }, [data, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#141519] border border-[#24262e] rounded-[10px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#24262e] bg-[#1a1b21]">
          <svg
            className="w-4 h-4 text-[#db9d6a] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tokens, symbols, or 0x contract address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-mono text-white placeholder-zinc-500 outline-none"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-[#0e0f12] border border-[#24262e] rounded-[4px]">
            ESC
          </kbd>
        </div>

        {/* Quick Nav Options */}
        <div className="px-3 py-2 bg-[#101114] border-b border-[#24262e] flex items-center gap-2 text-xs font-mono">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Quick:</span>
          <button
            onClick={() => {
              onClose();
              router.push("/create");
            }}
            className="px-2 py-0.5 rounded-[4px] bg-[#3b2718] text-[#db9d6a] hover:bg-[#db9d6a] hover:text-[#0e0f12] font-bold transition-colors"
          >
            + Launch Token
          </button>
          <button
            onClick={() => {
              onClose();
              router.push("/portfolio");
            }}
            className="px-2 py-0.5 rounded-[4px] bg-[#1a1b21] text-zinc-300 hover:text-white hover:bg-[#24262e] transition-colors"
          >
            Portfolio
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {loading && results.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-zinc-500">
              Scanning Arc L1 contracts...
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-zinc-500">
              No matching tokens found on Arc L1.
            </div>
          ) : (
            <div className="flex flex-col gap-1 font-mono">
              {results.map((item) => (
                <Link
                  key={item.token}
                  href={`/token/${item.token}`}
                  onClick={onClose}
                  className="flex items-center justify-between p-2.5 rounded-[6px] hover:bg-[#1a1b21] border border-transparent hover:border-[#db9d6a]/30 transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-[6px] bg-[#1a1b21] border border-[#24262e] flex items-center justify-center font-bold text-xs text-[#db9d6a]">
                      {item.symbol.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white group-hover:text-[#db9d6a] transition-colors text-sm">
                          ${item.symbol}
                        </span>
                        <span className="text-xs text-zinc-400 truncate max-w-[140px]">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {item.token.slice(0, 6)}…{item.token.slice(-4)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {item.graduated ? (
                      <span className="text-[10px] font-bold text-[#4ade80]">
                        GRADUATED
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#db9d6a]">
                        IN CURVE
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
