"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  useReadBondingCurveCurrentPrice,
  useReadBondingCurveGraduated,
  useReadBondingCurveQuoteBuy,
  useReadBondingCurveQuoteSell,
  useReadMockUsdcAllowance,
  useReadMockUsdcBalanceOf,
  useReadMemeTokenAllowance,
  useReadMemeTokenBalanceOf,
  useWriteBondingCurveBuy,
  useWriteBondingCurveSell,
  useWriteMemeTokenApprove,
  useWriteMockUsdcApprove,
} from "@/generated/contracts-generated";
import { PoolTradePanel } from "./PoolTradePanel";
import { formatPrice, formatToken, formatUsd } from "@/lib/format";
import { USDC_ADDRESS } from "@/lib/wagmi";

type Address = `0x${string}`;
type Mode = "buy" | "sell";

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;
const BPS_DENOM = 10_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/// Routes to the bonding-curve panel while the token trades on the curve,
/// and to the DEX pool panel once it has graduated.
export function TradePanel({
  tokenAddress,
  curveAddress,
}: {
  tokenAddress: Address;
  curveAddress: Address;
}) {
  const { data: graduated, isLoading } = useReadBondingCurveGraduated({
    address: curveAddress,
  });

  if (graduated) {
    return <PoolTradePanel tokenAddress={tokenAddress} />;
  }
  if (isLoading) {
    return <div className="h-96 animate-pulse rounded-2xl bg-zinc-900" />;
  }
  return <CurveTradePanel tokenAddress={tokenAddress} curveAddress={curveAddress} />;
}

function CurveTradePanel({
  tokenAddress,
  curveAddress,
}: {
  tokenAddress: Address;
  curveAddress: Address;
}) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
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

  // --- balances & allowances ---
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

  // --- quotes ---
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

  const quote = mode === "buy" ? quoteBuy.data : quoteSell.data;
  const balance = mode === "buy" ? usdcBalance.data : tokenBalance.data;
  const allowance = mode === "buy" ? usdcAllowance.data : tokenAllowance.data;

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

  // price impact: execution price vs marginal price
  const priceImpactPct = useMemo(() => {
    if (quote === undefined || parsedAmount === undefined || !currentPrice)
      return undefined;
    const marginal = Number(currentPrice) / 1e6; // usd per token
    if (marginal <= 0) return undefined;
    const exec =
      mode === "buy"
        ? Number(parsedAmount) / 1e6 / (Number(quote) / 1e18)
        : Number(quote) / 1e6 / (Number(parsedAmount) / 1e18);
    if (!isFinite(exec) || exec <= 0) return undefined;
    return Math.abs((exec / marginal - 1) * 100);
  }, [quote, parsedAmount, currentPrice, mode]);

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
          ? err.message.length > 200
            ? `${err.message.slice(0, 200)}…`
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

  const inputCls =
    "w-full bg-transparent text-right font-mono text-2xl tabular-nums outline-none placeholder:text-zinc-600";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      {/* mode toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1">
        {(["buy", "sell"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setAmount("");
              setError("");
            }}
            className={`rounded-lg py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
              mode === m
                ? m === "buy"
                  ? "bg-emerald-500 text-zinc-950"
                  : "bg-red-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {/* pay field */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition-colors focus-within:border-emerald-500/60">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{mode === "buy" ? "You pay" : "You sell"}</span>
            {account && (
              <button
                type="button"
                onClick={() =>
                  balance !== undefined &&
                  setAmount(formatUnits(balance, mode === "buy" ? 6 : 18))
                }
                className="font-mono text-emerald-400 hover:text-emerald-300"
              >
                MAX{" "}
                {balance !== undefined
                  ? formatToken(balance)
                  : ""}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label={mode === "buy" ? "USDC amount" : "Token amount"}
              className={inputCls}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <span className="shrink-0 text-sm font-semibold text-zinc-400">
              {mode === "buy" ? "USDC" : "TOKEN"}
            </span>
          </div>
        </div>

        {/* receive field */}
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">You receive</span>
            <span
              className={`font-mono text-lg tabular-nums ${
                quote !== undefined ? "text-zinc-200" : "text-zinc-600"
              }`}
            >
              {quote !== undefined
                ? mode === "buy"
                  ? `${formatToken(quote)} TOKEN`
                  : formatUsd(quote)
                : "—"}
            </span>
          </div>
        </div>

        {/* slippage */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-zinc-500">Max slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                aria-pressed={slippageBps === bps}
                className={`rounded-md px-2 py-0.5 font-mono text-xs tabular-nums transition-colors ${
                  slippageBps === bps
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {Number(bps) / 100}%
              </button>
            ))}
          </div>
        </div>

        {/* details */}
        {parsedAmount !== undefined && (
          <dl className="space-y-1.5 border-t border-zinc-800 pt-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Min received</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {minOut !== undefined
                  ? mode === "buy"
                    ? `${formatToken(minOut)} TOKEN`
                    : formatUsd(minOut)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Trade fee · 1%</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {mode === "buy"
                  ? formatUsd((parsedAmount * 100n) / BPS_DENOM)
                  : `${formatToken((parsedAmount * 100n) / BPS_DENOM)} tokens`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Price impact</dt>
              <dd
                className={`font-mono tabular-nums ${
                  (priceImpactPct ?? 0) > 5 ? "text-amber-400" : "text-zinc-300"
                }`}
              >
                {priceImpactPct !== undefined
                  ? `${priceImpactPct.toFixed(2)}%`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Price</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {formatPrice(currentPrice)}
              </dd>
            </div>
          </dl>
        )}

        {!account ? (
          <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            Connect your wallet to trade.
          </p>
        ) : null}
        {insufficientBalance ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Not enough {mode === "buy" ? "USDC" : "tokens"} in your wallet.
          </p>
        ) : null}
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={disabled}
          className={`w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 ${
            mode === "buy"
              ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              : "bg-red-500 text-zinc-950 hover:bg-red-400"
          }`}
        >
          {busy
            ? phase === "approve"
              ? "Approving…"
              : "Trading…"
            : !account
              ? "Connect wallet"
              : !hasAmount(parsedAmount)
                ? "Enter an amount"
                : needsApproval
                  ? `Approve & ${mode}`
                  : `${mode} now`}
        </button>
      </form>
    </div>
  );
}

function hasAmount(v: bigint | undefined): boolean {
  return v !== undefined && v > 0n;
}
