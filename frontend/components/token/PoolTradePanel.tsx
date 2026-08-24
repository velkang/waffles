"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  useReadAmmFactoryGetPair,
  useReadAmmMigratorFactory,
  useReadAmmPairGetReserves,
  useReadAmmPairToken0,
  useReadLaunchFactoryMigrator,
  useReadMemeTokenAllowance,
  useReadMemeTokenBalanceOf,
  useReadMockUsdcAllowance,
  useReadMockUsdcBalanceOf,
  useWriteAmmRouterSwapExactTokensForTokens,
  useWriteMemeTokenApprove,
  useWriteMockUsdcApprove,
} from "@/generated/contracts-generated";
import { formatPrice, formatToken, formatUsd } from "@/lib/format";
import { FACTORY_ADDRESS, ROUTER_ADDRESS, USDC_ADDRESS } from "@/lib/wagmi";

type Address = `0x${string}`;
type Mode = "buy" | "sell";

const SLIPPAGE_OPTIONS = [50, 100, 300] as const;
const BPS_DENOM = 10_000n;
const FEE_NUM = 9_975n; // AmmPair swap fee: 0.25% to LPs
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/// @notice V2 constant-product exact-in quote with the 0.25% pool fee.
function poolQuote(amountIn: bigint, rIn: bigint, rOut: bigint): bigint {
  if (amountIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n;
  return (amountIn * FEE_NUM * rOut) / (rIn * BPS_DENOM + amountIn * FEE_NUM);
}

/// Post-graduation trading against the token/USDC AmmPair. The pool is
/// resolved on-chain (factory -> migrator -> AMM factory -> getPair), so this
/// works even when the indexer is offline.
export function PoolTradePanel({ tokenAddress }: { tokenAddress: Address }) {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [phase, setPhase] = useState<"idle" | "approve" | "swap">("idle");
  const [error, setError] = useState("");

  // --- resolve the pool on-chain ---
  const { data: migrator } = useReadLaunchFactoryMigrator({
    address: FACTORY_ADDRESS,
  });
  const { data: ammFactory } = useReadAmmMigratorFactory({
    address: migrator,
    query: { enabled: Boolean(migrator) },
  });
  const { data: rawPool, isLoading: poolLoading } = useReadAmmFactoryGetPair({
    address: ammFactory,
    args: [tokenAddress, USDC_ADDRESS],
    query: { enabled: Boolean(ammFactory) },
  });
  const pool = rawPool && rawPool !== ZERO_ADDRESS ? rawPool : undefined;

  const { data: token0 } = useReadAmmPairToken0({
    address: pool,
    query: { enabled: Boolean(pool) },
  });
  const reservesQuery = useReadAmmPairGetReserves({
    address: pool,
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  });

  const tokenIsToken0 =
    token0 !== undefined &&
    token0.toLowerCase() === tokenAddress.toLowerCase();

  const [r0, r1] = reservesQuery.data ?? [];
  const rUsdc = tokenIsToken0 ? r1 : r0;
  const rToken = tokenIsToken0 ? r0 : r1;
  const poolPrice =
    rUsdc !== undefined && rToken !== undefined && rToken > 0n
      ? (rUsdc * 10n ** 18n) / rToken
      : undefined;

  // --- balances & allowances (spender: the atomic router) ---
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
    args: [account ?? ZERO_ADDRESS, ROUTER_ADDRESS || ZERO_ADDRESS],
    query: { enabled: Boolean(account && ROUTER_ADDRESS) },
  });
  const tokenAllowance = useReadMemeTokenAllowance({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS, ROUTER_ADDRESS || ZERO_ADDRESS],
    query: { enabled: Boolean(account && ROUTER_ADDRESS) },
  });

  const parsedAmount = useMemo(() => {
    try {
      if (amount === "" || Number(amount) <= 0) return undefined;
      return mode === "buy" ? parseUnits(amount, 6) : parseUnits(amount, 18);
    } catch {
      return undefined;
    }
  }, [amount, mode]);

  const balance = mode === "buy" ? usdcBalance.data : tokenBalance.data;
  const allowance = mode === "buy" ? usdcAllowance.data : tokenAllowance.data;

  const quote = useMemo(() => {
    if (parsedAmount === undefined || rUsdc === undefined || rToken === undefined)
      return undefined;
    return mode === "buy"
      ? poolQuote(parsedAmount, rUsdc, rToken)
      : poolQuote(parsedAmount, rToken, rUsdc);
  }, [parsedAmount, rUsdc, rToken, mode]);

  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    allowance < parsedAmount;

  const insufficientBalance =
    parsedAmount !== undefined && balance !== undefined && balance < parsedAmount;

  const minOut =
    quote !== undefined && quote > 0n
      ? (quote * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM
      : undefined;

  const priceImpactPct = useMemo(() => {
    if (quote === undefined || parsedAmount === undefined || poolPrice === undefined)
      return undefined;
    const marginal = Number(poolPrice) / 1e6; // usd per token
    if (marginal <= 0) return undefined;
    const exec =
      mode === "buy"
        ? Number(parsedAmount) / 1e6 / (Number(quote) / 1e18)
        : Number(quote) / 1e6 / (Number(parsedAmount) / 1e18);
    if (!isFinite(exec) || exec <= 0) return undefined;
    return Math.abs((exec / marginal - 1) * 100);
  }, [quote, parsedAmount, poolPrice, mode]);

  const approveUsdcAsync = useWriteMockUsdcApprove().writeContractAsync;
  const approveTokenAsync = useWriteMemeTokenApprove().writeContractAsync;
  const swapAsync = useWriteAmmRouterSwapExactTokensForTokens().writeContractAsync;

  function refetchAll() {
    reservesQuery.refetch();
    usdcBalance.refetch();
    tokenBalance.refetch();
    usdcAllowance.refetch();
    tokenAllowance.refetch();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !publicClient ||
      !pool ||
      !account ||
      !ROUTER_ADDRESS ||
      parsedAmount === undefined ||
      minOut === undefined
    )
      return;
    setError("");
    try {
      if (needsApproval) {
        setPhase("approve");
        const hash =
          mode === "buy"
            ? await approveUsdcAsync({
                address: USDC_ADDRESS,
                args: [ROUTER_ADDRESS, parsedAmount],
              })
            : await approveTokenAsync({
                address: tokenAddress,
                args: [ROUTER_ADDRESS, parsedAmount],
              });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setPhase("swap");
      const swapHash = await swapAsync({
        address: ROUTER_ADDRESS,
        args: [
          pool,
          mode === "buy" ? USDC_ADDRESS : tokenAddress,
          parsedAmount,
          minOut,
          account,
          BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: swapHash });

      setAmount("");
      setPhase("idle");
      refetchAll();
    } catch (err) {
      setPhase("idle");
      refetchAll();
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
    !pool ||
    !ROUTER_ADDRESS ||
    parsedAmount === undefined ||
    insufficientBalance ||
    quote === undefined ||
    quote === 0n;

  const inputCls =
    "w-full bg-transparent text-right font-mono text-2xl tabular-nums outline-none placeholder:text-zinc-600";

  if (poolLoading) {
    return (
      <div className="h-96 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
    );
  }

  if (!pool) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">Trade</span>
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
            🎓 Graduated
          </span>
        </div>
        <p className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
          This token graduated, but no DEX pool was found for it. Trading is
          only possible on-chain.
        </p>
      </div>
    );
  }

  if (!ROUTER_ADDRESS) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">Trade</span>
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300">
            Graduated
          </span>
        </div>
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200" role="status">
          DEX trading is paused until the atomic router address is configured.
          Your assets cannot be sent through the old two-step flow.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      {/* mode toggle + venue badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-zinc-950 p-1">
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
                    ? "bg-emerald-500 text-emerald-950"
                    : "bg-red-500 text-red-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="ml-3 shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] text-violet-300">
          🎓 DEX pool
        </span>
      </div>

      <form onSubmit={submit} className="space-y-3">
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
                MAX {balance !== undefined ? formatToken(balance) : ""}
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
            <span className="text-xs text-zinc-500">You receive (min)</span>
            <span
              className={`font-mono text-lg tabular-nums ${
                minOut !== undefined ? "text-zinc-200" : "text-zinc-600"
              }`}
            >
              {minOut !== undefined
                ? mode === "buy"
                  ? `${formatToken(minOut)} TOKEN`
                  : formatUsd(minOut)
                : quote !== undefined && quote > 0n
                  ? "…"
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
              <dt className="text-zinc-500">Quote</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {quote !== undefined
                  ? mode === "buy"
                    ? `${formatToken(quote)} TOKEN`
                    : formatUsd(quote)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Pool fee · 0.25%</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {mode === "buy"
                  ? formatUsd((parsedAmount * 25n) / BPS_DENOM)
                  : `${formatToken((parsedAmount * 25n) / BPS_DENOM)} tokens`}
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
              <dt className="text-zinc-500">Pool price</dt>
              <dd className="font-mono tabular-nums text-zinc-300">
                {formatPrice(poolPrice)}
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
          className={`w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
            disabled
              ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
              : mode === "buy"
                ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                : "bg-red-500 text-red-950 hover:bg-red-400"
          }`}
        >
          {busy
            ? phase === "approve"
              ? "Approving…"
              : "Swapping atomically…"
            : !account
              ? "Connect wallet"
              : parsedAmount === undefined || parsedAmount === 0n
                ? "Enter an amount"
                : quote === undefined || quote === 0n
                  ? "Insufficient pool liquidity"
                  : needsApproval
                    ? `Approve & ${mode}`
                    : `${mode} on DEX`}
        </button>
      </form>
    </div>
  );
}
