"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  useReadWafflesBondingCurveCreator,
  useReadWafflesBondingCurveCreatorEarnings,
  useReadWafflesBondingCurveCurrentPrice,
  useReadWafflesBondingCurveGraduated,
  useReadWafflesBondingCurveGraduationProgressBps,
  useReadWafflesBondingCurveMarketCap,
  useReadWafflesBondingCurveQuoteBuy,
  useReadWafflesBondingCurveQuoteSell,
  useReadWafflesBondingCurveGraduationMarketCapTarget,
  useReadMockUsdcBalanceOf,
  useReadWafflesMemeTokenAllowance,
  useReadWafflesMemeTokenBalanceOf,
  useWriteWafflesBondingCurveBuy,
  useWriteWafflesBondingCurveClaimCreatorFees,
  useWriteWafflesBondingCurveSell,
  useWriteWafflesMemeTokenApprove,
} from "@/generated/contracts-generated";
import { PoolTradePanel } from "./PoolTradePanel";
import { useTrades } from "@/lib/hooks/queries";
import { formatToken, formatUsd, shortAddress } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/wagmi";
import { ProgressBar } from "@/components/ui/ProgressBar";

type Address = `0x${string}`;
type Mode = "buy" | "sell";

type TradeData = {
  trader: string;
  isBuy: boolean;
  usdcAmount: string;
  tokenAmount: string;
  mcapAfter?: string;
  priceAfter?: string;
  timestamp: string;
};

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;
const BUY_PRESETS = [25, 100, 250] as const;
const SELL_PRESETS = [25, 50, 100] as const;
const BPS_DENOM = 10_000n;
const NATIVE_USDC_SCALE = 10n ** 12n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export function TradePanel({
  tokenAddress,
  curveAddress,
  description,
}: {
  tokenAddress: Address;
  curveAddress: Address;
  description?: string;
}) {
  const { data: graduated, isLoading } = useReadWafflesBondingCurveGraduated({
    address: curveAddress,
  });

  if (graduated) {
    return <PoolTradePanel tokenAddress={tokenAddress} />;
  }
  if (isLoading) {
    return <div className="h-96 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />;
  }
  return (
    <CurveTradePanel
      tokenAddress={tokenAddress}
      curveAddress={curveAddress}
      description={description}
    />
  );
}

function CurveTradePanel({
  tokenAddress,
  curveAddress,
  description,
}: {
  tokenAddress: Address;
  curveAddress: Address;
  description?: string;
}) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [statsTab, setStatsTab] = useState<"stats" | "audit">("stats");
  const [statsTimeframe, setStatsTimeframe] = useState<"5m" | "1h" | "24h">("24h");
  const [phase, setPhase] = useState<"idle" | "approve" | "trade">("idle");
  const [error, setError] = useState("");

  // Live trades data for real stats computation (shared canonical query)
  const { data: tradesData } = useTrades(tokenAddress, 200);
  const trades = useMemo(() => (tradesData?.trades as TradeData[]) ?? [], [tradesData]);

  const parsedAmount = useMemo(() => {
    try {
      if (amount === "" || Number(amount) <= 0) return undefined;
      return mode === "buy" ? parseUnits(amount, 6) : parseUnits(amount, 18);
    } catch {
      return undefined;
    }
  }, [amount, mode]);

  // Balances & Allowances
  const usdcBalance = useReadMockUsdcBalanceOf({
    address: USDC_ADDRESS,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: Boolean(account) },
  });
  const tokenBalance = useReadWafflesMemeTokenBalanceOf({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: Boolean(account) },
  });
  const tokenAllowance = useReadWafflesMemeTokenAllowance({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS, curveAddress],
    query: { enabled: Boolean(account) },
  });

  // Quotes & On-chain Curve Reads
  const quoteBuy = useReadWafflesBondingCurveQuoteBuy({
    address: curveAddress,
    args: [parsedAmount ?? 0n],
    query: { enabled: mode === "buy" && parsedAmount !== undefined },
  });
  const quoteSell = useReadWafflesBondingCurveQuoteSell({
    address: curveAddress,
    args: [parsedAmount ?? 0n],
    query: { enabled: mode === "sell" && parsedAmount !== undefined },
  });
  const { data: currentPrice } = useReadWafflesBondingCurveCurrentPrice({
    address: curveAddress,
  });
  const { data: marketCap } = useReadWafflesBondingCurveMarketCap({
    address: curveAddress,
  });
  const { data: progressBps } = useReadWafflesBondingCurveGraduationProgressBps({
    address: curveAddress,
  });
  const { data: creator } = useReadWafflesBondingCurveCreator({
    address: curveAddress,
  });
  const { data: graduationMarketCapTarget } =
    useReadWafflesBondingCurveGraduationMarketCapTarget({
      address: curveAddress,
    });

  const quote = mode === "buy" ? quoteBuy.data : quoteSell.data;
  const balance = mode === "buy" ? usdcBalance.data : tokenBalance.data;
  const progress = progressBps !== undefined ? Number(progressBps) / 100 : 0;

  const graduationTargetUsd =
    graduationMarketCapTarget === undefined
      ? undefined
      : Number(formatUnits(graduationMarketCapTarget, 6));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Real stats computation based on timeframe
  const stats = useMemo(() => {
    const windowMs =
      statsTimeframe === "5m"
        ? 5 * 60 * 1000
        : statsTimeframe === "1h"
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    const filtered = trades.filter(
      (t) => now - new Date(t.timestamp).getTime() <= windowMs
    );

    let buyCount = 0;
    let sellCount = 0;
    let buyVol = 0n;
    let sellVol = 0n;

    for (const t of filtered) {
      const usdc = BigInt(t.usdcAmount);
      if (t.isBuy) {
        buyCount++;
        buyVol += usdc;
      } else {
        sellCount++;
        sellVol += usdc;
      }
    }

    const totalVol = buyVol + sellVol;
    const totalCount = buyCount + sellCount;

    let priceChangePct: number | null = null;
    if (filtered.length > 0) {
      const oldest = filtered[filtered.length - 1];
      const oldestPrice = oldest.priceAfter ? BigInt(oldest.priceAfter) : undefined;
      if (oldestPrice && currentPrice && oldestPrice > 0n) {
        const diff = Number(currentPrice) - Number(oldestPrice);
        priceChangePct = (diff / Number(oldestPrice)) * 100;
      }
    }

    const buyCountPct = totalCount > 0 ? (buyCount / totalCount) * 100 : 50;
    const sellCountPct = 100 - buyCountPct;

    const buyVolPct = totalVol > 0n ? Number((buyVol * 100n) / totalVol) : 50;
    const sellVolPct = 100 - buyVolPct;

    return {
      buyCount,
      sellCount,
      buyVol,
      sellVol,
      totalVol,
      priceChangePct,
      buyCountPct,
      sellCountPct,
      buyVolPct,
      sellVolPct,
    };
  }, [trades, statsTimeframe, currentPrice, now]);

  const needsApproval =
    mode === "sell" &&
    parsedAmount !== undefined &&
    tokenAllowance.data !== undefined &&
    tokenAllowance.data < parsedAmount;

  const insufficientBalance =
    parsedAmount !== undefined && balance !== undefined && balance < parsedAmount;

  const minOut =
    quote !== undefined
      ? (quote * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM
      : undefined;

  const approveTokenAsync = useWriteWafflesMemeTokenApprove().writeContractAsync;
  const buyAsync = useWriteWafflesBondingCurveBuy().writeContractAsync;
  const sellAsync = useWriteWafflesBondingCurveSell().writeContractAsync;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !account || parsedAmount === undefined || minOut === undefined)
      return;
    setError("");
    try {
      if (needsApproval) {
        setPhase("approve");
        const hash = await approveTokenAsync({
          address: tokenAddress,
          args: [curveAddress, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setPhase("trade");
      const hash =
        mode === "buy"
          ? await buyAsync({
              address: curveAddress,
              args: [minOut, account],
              value: parsedAmount * NATIVE_USDC_SCALE,
            })
          : await sellAsync({
              address: curveAddress,
              args: [parsedAmount, minOut],
            });
      await publicClient.waitForTransactionReceipt({ hash });

      setAmount("");
      usdcBalance.refetch();
      tokenBalance.refetch();
      tokenAllowance.refetch();
      quoteBuy.refetch();
      quoteSell.refetch();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Transaction rejected";
      setError(message.slice(0, 160));
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const disabled =
    busy ||
    !account ||
    parsedAmount === undefined ||
    insufficientBalance ||
    minOut === undefined;

  return (
    <div className="space-y-4 font-mono">
      {/* 1. Buy / Sell Form Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-4">
        {/* Mode & Slippage Bar */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-[6px] bg-[#101114] p-1 border border-[#24262e]">
            <button
              type="button"
              onClick={() => {
                setMode("buy");
                setAmount("");
              }}
              className={`rounded-[4px] px-5 py-1.5 text-xs font-black transition ${
                mode === "buy"
                  ? "bg-[#4ade80] text-[#0e0f12]"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("sell");
                setAmount("");
              }}
              className={`rounded-[4px] px-5 py-1.5 text-xs font-black transition ${
                mode === "sell"
                  ? "bg-[#ef4444] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sell
            </button>
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-zinc-500 mr-1">SLIP</span>
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className={`px-2 py-1 rounded-[4px] font-bold transition ${
                  slippageBps === bps
                    ? "bg-[#1a1b21] text-[#db9d6a] border border-[#db9d6a]/40"
                    : "bg-[#101114] text-zinc-500 hover:text-zinc-300 border border-[#24262e]"
                }`}
              >
                {bps / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-[8px] bg-[#101114] border border-[#24262e] p-3 space-y-1.5 focus-within:border-[#db9d6a] transition">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="uppercase font-bold">
                {mode === "buy" ? "Amount to Spend" : "Amount to Sell"}
              </span>
              <span className="text-zinc-500">
                Bal:{" "}
                <button
                  type="button"
                  onClick={() => {
                    if (balance !== undefined && balance > 0n) {
                      setAmount(
                        mode === "buy"
                          ? formatUnits(balance, 6)
                          : formatUnits(balance, 18)
                      );
                    }
                  }}
                  className="text-zinc-300 underline hover:text-white"
                >
                  {balance !== undefined
                    ? mode === "buy"
                      ? formatUsd(balance)
                      : formatToken(balance)
                    : "—"}
                </button>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                aria-label="Trade amount"
                className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-zinc-600"
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <span className="shrink-0 text-xs font-bold text-zinc-400">
                {mode === "buy" ? "USDC" : "TOKEN"}
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          {mode === "buy" ? (
            <div className="flex items-center gap-1.5 text-xs">
              {BUY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className="flex-1 rounded-[6px] bg-[#1a1b21] border border-[#24262e] py-1.5 font-bold text-zinc-300 hover:border-[#db9d6a] hover:text-[#db9d6a] transition"
                >
                  ${preset}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs">
              {SELL_PRESETS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    if (balance !== undefined && balance > 0n) {
                      const sel = (balance * BigInt(pct)) / 100n;
                      setAmount(formatUnits(sel, 18));
                    }
                  }}
                  className="flex-1 rounded-[6px] bg-[#1a1b21] border border-[#24262e] py-1.5 font-bold text-zinc-300 hover:border-[#ef4444] hover:text-[#ef4444] transition"
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {/* Output Readout */}
          {quote !== undefined && quote > 0n && (
            <div className="rounded-[6px] bg-[#101114] border border-[#24262e] p-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400">ESTIMATED OUTPUT</span>
              <span className="font-bold text-white">
                {mode === "buy" ? `${formatToken(quote)} tokens` : formatUsd(quote)}
              </span>
            </div>
          )}

          {insufficientBalance && (
            <p className="rounded-[6px] border border-red-500/40 bg-[#2b1114] p-2 text-xs text-red-300 font-bold">
              Insufficient {mode === "buy" ? "USDC" : "Token"} balance
            </p>
          )}
          {error && (
            <p className="rounded-[6px] border border-red-500/40 bg-[#2b1114] p-2 text-xs text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={disabled}
            className={`w-full rounded-[8px] py-3 text-xs font-black uppercase tracking-wider transition active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed ${
              mode === "buy"
                ? "bg-[#db9d6a] text-[#0e0f12] hover:bg-[#e5ab7a]"
                : "bg-[#ef4444] text-white hover:bg-[#dc2626]"
            }`}
          >
            {busy
              ? phase === "approve"
                ? "Approving…"
                : "Confirming on Curve…"
              : !account
                ? "Connect wallet to trade"
                : !parsedAmount || parsedAmount === 0n
                  ? "Enter an amount"
                  : needsApproval
                    ? "Approve & Sell"
                    : `${mode === "buy" ? "Buy" : "Sell"} Now`}
          </button>
        </form>
      </div>

      {/* 2. Real Stats & Audit Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-3 text-xs">
        {/* Sub Header: Stats vs Audit Toggle */}
        <div className="flex items-center justify-between border-b border-[#24262e] pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatsTab("stats")}
              className={`font-bold transition ${
                statsTab === "stats"
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Stats
            </button>
            <span className="text-zinc-600">•</span>
            <button
              type="button"
              onClick={() => setStatsTab("audit")}
              className={`font-bold transition ${
                statsTab === "audit"
                  ? "text-[#db9d6a]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Audit
            </button>
          </div>

          {statsTab === "stats" && (
            <div className="flex items-center gap-1 text-[10px]">
              {(["5m", "1h", "24h"] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setStatsTimeframe(tf)}
                  className={`px-1.5 py-0.5 rounded-[4px] font-bold ${
                    statsTimeframe === tf
                      ? "bg-[#1a1b21] text-white border border-[#24262e]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>

        {statsTab === "stats" ? (
          /* Live Computed Stats View */
          <div className="space-y-3">
            {/* Volume & Price Change */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-zinc-500 block">Price change ({statsTimeframe})</span>
                {stats.priceChangePct !== null ? (
                  <span
                    className={`font-bold ${
                      stats.priceChangePct >= 0 ? "text-[#4ade80]" : "text-[#ef4444]"
                    }`}
                  >
                    {stats.priceChangePct >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(stats.priceChangePct).toFixed(1)}%
                  </span>
                ) : (
                  <span className="font-bold text-zinc-400">0.0%</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 block">Volume ({statsTimeframe})</span>
                <span className="font-bold text-white">{formatUsd(stats.totalVol)}</span>
              </div>
            </div>

            {/* 2-Color Ratio Bars */}
            <div className="space-y-2">
              {/* Buys vs Sells */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#4ade80] font-bold">
                    {stats.buyCount.toLocaleString()} {stats.buyCount === 1 ? "buy" : "buys"}
                  </span>
                  <span className="text-[#ef4444] font-bold">
                    {stats.sellCount.toLocaleString()} {stats.sellCount === 1 ? "sell" : "sells"}
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-1 bg-[#101114]">
                  <div
                    className="h-full bg-[#4ade80] rounded-full transition-all duration-300"
                    style={{ width: `${stats.buyCountPct}%` }}
                  />
                  <div
                    className="h-full bg-[#ef4444] rounded-full transition-all duration-300"
                    style={{ width: `${stats.sellCountPct}%` }}
                  />
                </div>
              </div>

              {/* Buy Vol vs Sell Vol */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#4ade80] font-bold">
                    {formatUsd(stats.buyVol)} buy vol
                  </span>
                  <span className="text-[#ef4444] font-bold">
                    {formatUsd(stats.sellVol)} sell vol
                  </span>
                </div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-1 bg-[#101114]">
                  <div
                    className="h-full bg-[#4ade80] rounded-full transition-all duration-300"
                    style={{ width: `${stats.buyVolPct}%` }}
                  />
                  <div
                    className="h-full bg-[#ef4444] rounded-full transition-all duration-300"
                    style={{ width: `${stats.sellVolPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Live On-Chain Safety & Audit View */
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-[#1f2128]">
              <span className="text-zinc-400">Mint Authority</span>
              <span className="font-bold text-[#4ade80] flex items-center gap-1">
                <span>✓</span> Fixed 1.0B Supply
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[#1f2128]">
              <span className="text-zinc-400">Freeze Authority</span>
              <span className="font-bold text-[#4ade80] flex items-center gap-1">
                <span>✓</span> Immutable ERC20
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[#1f2128]">
              <span className="text-zinc-400">LP Lock</span>
              <span className="font-bold text-[#4ade80] flex items-center gap-1">
                <span>✓</span> 100% Burned at Graduation
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[#1f2128]">
              <span className="text-zinc-400">Team Pre-mine</span>
              <span className="font-bold text-zinc-200">0% (100% Fair Launch)</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-400">Trade Fee</span>
              <span className="font-bold text-zinc-200">
                1.0% (0.70% Creator / 0.25% Platform / 0.05% Rewards)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bonding Curve Progress Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-2.5 text-xs">
        <div className="flex items-center justify-between font-bold">
          <span className="text-zinc-400">
            MC <span className="text-white">{marketCap ? formatUsd(marketCap) : "—"}</span>
          </span>
          <span className="text-zinc-400">
            ATH <span className="text-[#db9d6a]">
              {graduationTargetUsd !== undefined
                ? graduationTargetUsd >= 1000
                  ? `$${(graduationTargetUsd / 1000).toFixed(graduationTargetUsd % 1000 === 0 ? 0 : 1)}K`
                  : `$${graduationTargetUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "—"}
            </span>
          </span>
        </div>
        <ProgressBar progress={progress} graduated={false} size="md" />
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Graduation target: {graduationTargetUsd !== undefined
            ? `$${graduationTargetUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`
            : "—"}
          </span>
          <span className="font-bold text-[#db9d6a]">{progress.toFixed(1)}%</span>
        </div>
      </div>

      {/* 4. Description Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-2 text-xs">
        <span className="font-bold text-white block">Description</span>
        <p className="text-zinc-400 leading-relaxed font-sans">
          {description || "Created on Arc L1 with virtual USDC constant-product bonding curve."}
        </p>
      </div>

      {/* 5. Creator Rewards Card */}
      {curveAddress && (
        <CreatorRewardsCard curveAddress={curveAddress} creator={creator} />
      )}
    </div>
  );
}

function CreatorRewardsCard({
  curveAddress,
  creator,
}: {
  curveAddress: Address;
  creator?: Address;
}) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const [claiming, setClaiming] = useState(false);
  const [err, setErr] = useState("");

  const isCreator = Boolean(
    account && creator && account.toLowerCase() === creator.toLowerCase()
  );

  const earningsQuery = useReadWafflesBondingCurveCreatorEarnings({
    address: curveAddress,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: isCreator },
  });
  const { writeContractAsync: claimAsync, isPending } =
    useWriteWafflesBondingCurveClaimCreatorFees();

  return (
    <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-white">Creator rewards</span>
        <span className="text-[10px] text-zinc-500">Coin timeline</span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[#1a1b21] border border-[#24262e] flex items-center justify-center text-xs">
            👨‍💻
          </div>
          <div>
            <span className="font-bold text-zinc-200 block">
              {creator ? shortAddress(creator) : "Deployer"}
            </span>
            <span className="text-[10px] text-[#db9d6a]">Creator • 100%</span>
          </div>
        </div>

        {isCreator && (
          <button
            type="button"
            onClick={async () => {
              if (!publicClient) return;
              setErr("");
              setClaiming(true);
              try {
                const hash = await claimAsync({ address: curveAddress });
                await publicClient.waitForTransactionReceipt({ hash });
                earningsQuery.refetch();
              } catch (e) {
                setErr(e instanceof Error ? e.message.slice(0, 160) : String(e));
              } finally {
                setClaiming(false);
              }
            }}
            disabled={claiming || isPending || !earningsQuery.data || earningsQuery.data === 0n}
            className="rounded-[4px] bg-[#db9d6a] px-2.5 py-1 text-xs font-bold text-[#0e0f12] hover:bg-[#e5ab7a] disabled:opacity-40"
          >
            {claiming ? "Claiming…" : "Claim Rewards"}
          </button>
        )}
      </div>

      {err && <p className="text-[10px] text-red-400">{err}</p>}
    </div>
  );
}
