"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  useReadBondingCurveCreator,
  useReadBondingCurveCreatorEarnings,
  useReadBondingCurveCurrentPrice,
  useReadBondingCurveGraduated,
  useReadBondingCurveGraduationMcap,
  useReadBondingCurveGraduationProgressBps,
  useReadBondingCurveQuoteBuy,
  useReadBondingCurveQuoteSell,
  useReadMockUsdcAllowance,
  useReadMockUsdcBalanceOf,
  useReadMemeTokenAllowance,
  useReadMemeTokenBalanceOf,
  useWriteBondingCurveBuy,
  useWriteBondingCurveClaimCreatorFees,
  useWriteBondingCurveSell,
  useWriteMemeTokenApprove,
  useWriteMockUsdcApprove,
} from "@/generated/contracts-generated";
import { PoolTradePanel } from "./PoolTradePanel";
import { formatPrice, formatToken, formatUsd, shortAddress } from "@/lib/format";
import { FACTORY_ADDRESS, USDC_ADDRESS } from "@/lib/wagmi";
import { ProgressBar } from "@/components/ui/ProgressBar";

type Address = `0x${string}`;
type Mode = "buy" | "sell";

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;
const BUY_PRESETS = [25, 100, 250] as const;
const SELL_PRESETS = [25, 50, 100] as const;
const BPS_DENOM = 10_000n;
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
  const { data: graduated, isLoading } = useReadBondingCurveGraduated({
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
  const [statsTimeframe, setStatsTimeframe] = useState<"5m" | "1h" | "24h">("24h");
  const [phase, setPhase] = useState<"idle" | "approve" | "trade">("idle");
  const [error, setError] = useState("");

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
  const tokenBalance = useReadMemeTokenBalanceOf({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: Boolean(account) },
  });
  const usdcAllowance = useReadMockUsdcAllowance({
    address: USDC_ADDRESS,
    args: [account ?? ZERO_ADDRESS, curveAddress],
    query: { enabled: Boolean(account) },
  });
  const tokenAllowance = useReadMemeTokenAllowance({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS, curveAddress],
    query: { enabled: Boolean(account) },
  });

  // Quotes
  const quoteBuy = useReadBondingCurveQuoteBuy({
    address: curveAddress,
    args: [parsedAmount ?? 0n],
    query: { enabled: mode === "buy" && parsedAmount !== undefined },
  });
  const quoteSell = useReadBondingCurveQuoteSell({
    address: curveAddress,
    args: [parsedAmount ?? 0n],
    query: { enabled: mode === "sell" && parsedAmount !== undefined },
  });
  const { data: currentPrice } = useReadBondingCurveCurrentPrice({
    address: curveAddress,
  });
  const { data: progressBps } = useReadBondingCurveGraduationProgressBps({
    address: curveAddress,
  });
  const { data: graduationMcap } = useReadBondingCurveGraduationMcap({
    address: curveAddress,
  });
  const { data: creator } = useReadBondingCurveCreator({
    address: curveAddress,
  });

  const quote = mode === "buy" ? quoteBuy.data : quoteSell.data;
  const balance = mode === "buy" ? usdcBalance.data : tokenBalance.data;
  const allowance = mode === "buy" ? usdcAllowance.data : tokenAllowance.data;
  const progress = progressBps !== undefined ? Number(progressBps) / 100 : 0;

  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    allowance < parsedAmount;

  const insufficientBalance =
    parsedAmount !== undefined && balance !== undefined && balance < parsedAmount;

  const minOut =
    quote !== undefined
      ? (quote * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM
      : undefined;

  const approveAsync = useWriteMockUsdcApprove().writeContractAsync;
  const approveTokenAsync = useWriteMemeTokenApprove().writeContractAsync;
  const buyAsync = useWriteBondingCurveBuy().writeContractAsync;
  const sellAsync = useWriteBondingCurveSell().writeContractAsync;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || parsedAmount === undefined || minOut === undefined)
      return;
    setError("");
    try {
      if (needsApproval) {
        setPhase("approve");
        const hash =
          mode === "buy"
            ? await approveAsync({
                address: USDC_ADDRESS,
                args: [curveAddress, parsedAmount],
              })
            : await approveTokenAsync({
                address: tokenAddress,
                args: [curveAddress, parsedAmount],
              });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setPhase("trade");
      const hash =
        mode === "buy"
          ? await buyAsync({
              address: curveAddress,
              args: [parsedAmount, minOut],
            })
          : await sellAsync({
              address: curveAddress,
              args: [parsedAmount, minOut],
            });
      await publicClient.waitForTransactionReceipt({ hash });
      setAmount("");
      setPhase("idle");
    } catch (err) {
      setPhase("idle");
      setError(
        err instanceof Error
          ? err.message.length > 180
            ? `${err.message.slice(0, 180)}…`
            : err.message
          : String(err),
      );
    }
  }

  const busy = phase !== "idle";
  const disabled =
    busy ||
    !account ||
    parsedAmount === undefined ||
    insufficientBalance ||
    (mode === "buy" ? quoteBuy.isLoading : quoteSell.isLoading);

  return (
    <div className="space-y-4 font-mono">
      {/* 1. Order Slip Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-3.5">
        {/* Mode Switch Tabs (Pump.fun style) */}
        <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-[#101114] p-1 border border-[#24262e] text-xs">
          <button
            type="button"
            onClick={() => {
              setMode("buy");
              setAmount("");
              setError("");
            }}
            className={`rounded-[4px] py-2 font-bold transition ${
              mode === "buy"
                ? "bg-[#db9d6a] text-[#0e0f12]"
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
              setError("");
            }}
            className={`rounded-[4px] py-2 font-bold transition ${
              mode === "sell"
                ? "bg-[#ef4444] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Sell
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {/* Main Amount Input Container */}
          <div className="rounded-[8px] bg-[#1a1b21] border border-[#24262e] p-3 focus-within:border-[#db9d6a] transition">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{mode === "buy" ? "YOU PAY (USDC)" : "YOU SELL (TOKENS)"}</span>
              {account && (
                <div className="flex items-center gap-1">
                  <span>
                    Bal: {balance !== undefined ? (mode === "buy" ? formatUsd(balance) : formatToken(balance)) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      balance !== undefined &&
                      setAmount(formatUnits(balance, mode === "buy" ? 6 : 18))
                    }
                    className="font-bold text-[#db9d6a] hover:underline ml-1"
                  >
                    [MAX]
                  </button>
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-2xl font-black text-zinc-400">$</span>
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
                {mode === "buy" ? "USD ⇅" : "TOKEN ⇅"}
              </span>
            </div>
          </div>

          {/* Preset Buttons */}
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

          {/* Estimated Output Readout */}
          {quote !== undefined && (
            <div className="rounded-[6px] bg-[#101114] border border-[#24262e] p-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400">ESTIMATED OUTPUT</span>
              <span className="font-bold text-white">
                {mode === "buy" ? `${formatToken(quote)} tokens` : formatUsd(quote)}
              </span>
            </div>
          )}

          {/* Error Message */}
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

          {/* Submit Action Button */}
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
                ? "Approving Token…"
                : "Confirming Trade…"
              : !account
                ? "Connect wallet to trade"
                : !parsedAmount || parsedAmount === 0n
                  ? "Enter an amount"
                  : needsApproval
                    ? `Approve & ${mode === "buy" ? "Buy" : "Sell"}`
                    : `${mode === "buy" ? "Buy" : "Sell"} Now`}
          </button>
        </form>
      </div>

      {/* 2. Stats & Buy/Sell Ratio Card (Pump.fun style) */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-3 text-xs">
        {/* Sub Header: Stats vs Audit */}
        <div className="flex items-center justify-between border-b border-[#24262e] pb-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white">Stats</span>
            <span className="text-zinc-500 hover:text-zinc-300 cursor-pointer">Audit</span>
          </div>
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
        </div>

        {/* Volume & Price Change */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-500 block">Price change</span>
            <span className="font-bold text-[#4ade80]">↑ 226.0%</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 block">Volume</span>
            <span className="font-bold text-white">$424K</span>
          </div>
        </div>

        {/* 2-Color Ratio Bars */}
        <div className="space-y-2">
          {/* Buys vs Sells */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#4ade80] font-bold">5,632 buys</span>
              <span className="text-[#ef4444] font-bold">4,530 sells</span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-1">
              <div className="h-full bg-[#4ade80] rounded-full" style={{ width: "55%" }} />
              <div className="h-full bg-[#ef4444] rounded-full" style={{ width: "45%" }} />
            </div>
          </div>

          {/* Buy Vol vs Sell Vol */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#4ade80] font-bold">$216K buy vol</span>
              <span className="text-[#ef4444] font-bold">$207K sell vol</span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full gap-1">
              <div className="h-full bg-[#4ade80] rounded-full" style={{ width: "51%" }} />
              <div className="h-full bg-[#ef4444] rounded-full" style={{ width: "49%" }} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bonding Curve Progress Card */}
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-2.5 text-xs">
        <div className="flex items-center justify-between font-bold">
          <span className="text-zinc-400">
            MC <span className="text-white">${((progress * 50000) / 100).toFixed(1)}K</span>
          </span>
          <span className="text-zinc-400">
            ATH <span className="text-[#db9d6a]">$50.0K</span>
          </span>
        </div>
        <ProgressBar progress={progress} graduated={false} size="md" />
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Graduation target: $50,000 USDC</span>
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

  const earningsQuery = useReadBondingCurveCreatorEarnings({
    address: curveAddress,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: isCreator },
  });
  const { writeContractAsync: claimAsync, isPending } =
    useWriteBondingCurveClaimCreatorFees();

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
