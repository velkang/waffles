'use client'

import { useMemo, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import {
  useReadWafflesAmmFactoryGetPair,
  useReadWafflesAmmPairGetReserves,
  useReadWafflesMemeTokenAllowance,
  useReadWafflesMemeTokenBalanceOf,
  useReadMockUsdcAllowance,
  useReadMockUsdcBalanceOf,
  useWriteWafflesAmmRouterSwapExactTokensForTokens,
  useWriteWafflesMemeTokenApprove,
  useWriteMockUsdcApprove,
} from '@/generated/contracts-generated'
import { formatToken, formatUsd } from '@/lib/format'
import {
  AMM_FACTORY_ADDRESS,
  ROUTER_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/wagmi'
import { StatusBadge } from '@/components/ui/StatusBadge'

type Address = `0x${string}`
type Mode = 'buy' | 'sell'

const BUY_PRESETS = [25, 100, 250] as const
const SELL_PRESETS = [25, 50, 100] as const
const BPS_DENOM = 10_000n
const FEE_BPS = 100n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function poolQuote(
  amountIn: bigint,
  rIn: bigint,
  rOut: bigint,
  isUsdcInput: boolean,
): bigint {
  if (amountIn <= 0n || rIn <= 0n || rOut <= 0n) return 0n
  if (isUsdcInput) {
    const netAmountIn = amountIn - (amountIn * FEE_BPS) / BPS_DENOM
    return (netAmountIn * rOut) / (rIn + netAmountIn)
  }
  const grossAmountOut = (amountIn * rOut) / (rIn + amountIn)
  return grossAmountOut - (grossAmountOut * FEE_BPS) / BPS_DENOM
}

export function PoolTradePanel({ tokenAddress }: { tokenAddress: Address }) {
  const { address: account } = useAccount()
  const publicClient = usePublicClient()

  const [mode, setMode] = useState<Mode>('buy')
  const [amount, setAmount] = useState('')
  const slippageBps = 100
  const [phase, setPhase] = useState<'idle' | 'approve' | 'swap'>('idle')
  const [error, setError] = useState('')

  const { data: rawPool, isLoading: poolLoading } =
    useReadWafflesAmmFactoryGetPair({
      address: AMM_FACTORY_ADDRESS,
      args: [tokenAddress, USDC_ADDRESS],
      query: { enabled: Boolean(AMM_FACTORY_ADDRESS) },
    })
  const pool = rawPool && rawPool !== ZERO_ADDRESS ? rawPool : undefined

  const reservesQuery = useReadWafflesAmmPairGetReserves({
    address: pool,
    query: { enabled: Boolean(pool), refetchInterval: 10_000 },
  })

  const tokenIsToken0 =
    tokenAddress.toLowerCase() < USDC_ADDRESS.toLowerCase()

  const [r0, r1] = reservesQuery.data ?? []
  const rUsdc = tokenIsToken0 ? r1 : r0
  const rToken = tokenIsToken0 ? r0 : r1
  const usdcBalance = useReadMockUsdcBalanceOf({
    address: USDC_ADDRESS,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: Boolean(account) },
  })
  const tokenBalance = useReadWafflesMemeTokenBalanceOf({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS],
    query: { enabled: Boolean(account) },
  })
  const usdcAllowance = useReadMockUsdcAllowance({
    address: USDC_ADDRESS,
    args: [account ?? ZERO_ADDRESS, ROUTER_ADDRESS || ZERO_ADDRESS],
    query: { enabled: Boolean(account && ROUTER_ADDRESS) },
  })
  const tokenAllowance = useReadWafflesMemeTokenAllowance({
    address: tokenAddress,
    args: [account ?? ZERO_ADDRESS, ROUTER_ADDRESS || ZERO_ADDRESS],
    query: { enabled: Boolean(account && ROUTER_ADDRESS) },
  })

  const parsedAmount = useMemo(() => {
    try {
      if (amount === '' || Number(amount) <= 0) return undefined
      return mode === 'buy' ? parseUnits(amount, 6) : parseUnits(amount, 18)
    } catch {
      return undefined
    }
  }, [amount, mode])

  const balance = mode === 'buy' ? usdcBalance.data : tokenBalance.data
  const allowance = mode === 'buy' ? usdcAllowance.data : tokenAllowance.data

  const quote = useMemo(() => {
    if (
      parsedAmount === undefined ||
      rUsdc === undefined ||
      rToken === undefined
    )
      return undefined
    return mode === 'buy'
      ? poolQuote(parsedAmount, rUsdc, rToken, true)
      : poolQuote(parsedAmount, rToken, rUsdc, false)
  }, [parsedAmount, rUsdc, rToken, mode])

  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    allowance < parsedAmount

  const insufficientBalance =
    parsedAmount !== undefined &&
    balance !== undefined &&
    balance < parsedAmount

  const minOut =
    quote !== undefined && quote > 0n
      ? (quote * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM
      : undefined

  const approveUsdcAsync = useWriteMockUsdcApprove().writeContractAsync
  const approveTokenAsync = useWriteWafflesMemeTokenApprove().writeContractAsync
  const swapAsync =
    useWriteWafflesAmmRouterSwapExactTokensForTokens().writeContractAsync

  function refetchAll() {
    reservesQuery.refetch()
    usdcBalance.refetch()
    tokenBalance.refetch()
    usdcAllowance.refetch()
    tokenAllowance.refetch()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !publicClient ||
      !pool ||
      !account ||
      !ROUTER_ADDRESS ||
      parsedAmount === undefined ||
      minOut === undefined
    )
      return
    setError('')
    try {
      if (needsApproval) {
        setPhase('approve')
        const hash =
          mode === 'buy'
            ? await approveUsdcAsync({
                address: USDC_ADDRESS,
                args: [ROUTER_ADDRESS, parsedAmount],
              })
            : await approveTokenAsync({
                address: tokenAddress,
                args: [ROUTER_ADDRESS, parsedAmount],
              })
        await publicClient.waitForTransactionReceipt({ hash })
      }

      setPhase('swap')
      const swapHash = await swapAsync({
        address: ROUTER_ADDRESS,
        args: [
          pool,
          mode === 'buy' ? USDC_ADDRESS : tokenAddress,
          parsedAmount,
          minOut,
          account,
          BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: swapHash })

      setAmount('')
      setPhase('idle')
      refetchAll()
    } catch (err) {
      setPhase('idle')
      refetchAll()
      setError(
        err instanceof Error
          ? err.message.length > 180
            ? `${err.message.slice(0, 180)}…`
            : err.message
          : String(err),
      )
    }
  }

  const busy = phase !== 'idle'
  const disabled =
    busy ||
    !account ||
    !pool ||
    !ROUTER_ADDRESS ||
    parsedAmount === undefined ||
    insufficientBalance ||
    quote === undefined ||
    quote === 0n

  if (poolLoading) {
    return (
      <div className="h-96 animate-pulse rounded-[10px] bg-[#141519] border border-[#24262e]" />
    )
  }

  if (!pool) {
    return (
      <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-6 text-center font-mono">
        <StatusBadge graduated={true} />
        <p className="mt-3 text-xs text-zinc-400">
          Token has graduated · DEX AMM pool resolving on-chain
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 font-mono">
      <div className="rounded-[10px] bg-[#141519] border border-[#24262e] p-4 space-y-3.5">
        {/* Pool Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#24262e]">
          <span className="text-xs font-bold text-[#4ade80]">
            DEX AMM PAIR ACTIVE
          </span>
          <StatusBadge graduated={true} size="xs" />
        </div>

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 gap-1 rounded-[6px] bg-[#101114] p-1 border border-[#24262e] text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('buy')
              setAmount('')
              setError('')
            }}
            className={`rounded-[4px] py-2 font-bold transition ${
              mode === 'buy'
                ? 'bg-[#db9d6a] text-[#0e0f12]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('sell')
              setAmount('')
              setError('')
            }}
            className={`rounded-[4px] py-2 font-bold transition ${
              mode === 'sell'
                ? 'bg-[#ef4444] text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sell
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {/* Amount Input */}
          <div className="rounded-[8px] bg-[#1a1b21] border border-[#24262e] p-3 focus-within:border-[#db9d6a] transition">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {mode === 'buy' ? 'YOU PAY (USDC)' : 'YOU SELL (TOKENS)'}
              </span>
              {account && (
                <div className="flex items-center gap-1">
                  <span>
                    Bal:{' '}
                    {balance !== undefined
                      ? mode === 'buy'
                        ? formatUsd(balance)
                        : formatToken(balance)
                      : '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      balance !== undefined &&
                      setAmount(formatUnits(balance, mode === 'buy' ? 6 : 18))
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
                aria-label="Swap amount"
                className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-zinc-600"
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9.]/g, ''))
                }
              />
              <span className="shrink-0 text-xs font-bold text-zinc-400">
                {mode === 'buy' ? 'USD ⇅' : 'TOKEN ⇅'}
              </span>
            </div>
          </div>

          {/* Quick Presets */}
          {mode === 'buy' ? (
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
                      const sel = (balance * BigInt(pct)) / 100n
                      setAmount(formatUnits(sel, 18))
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
          {minOut !== undefined && (
            <div className="rounded-[6px] bg-[#101114] border border-[#24262e] p-2.5 flex items-center justify-between text-xs">
              <span className="text-zinc-400">ESTIMATED OUTPUT</span>
              <span className="font-bold text-white">
                {mode === 'buy'
                  ? `${formatToken(minOut)} tokens`
                  : formatUsd(minOut)}
              </span>
            </div>
          )}

          {insufficientBalance && (
            <p className="rounded-[6px] border border-red-500/40 bg-[#2b1114] p-2 text-xs text-red-300 font-bold">
              Insufficient {mode === 'buy' ? 'USDC' : 'Token'} balance
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
              mode === 'buy'
                ? 'bg-[#db9d6a] text-[#0e0f12] hover:bg-[#e5ab7a]'
                : 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
            }`}
          >
            {busy
              ? phase === 'approve'
                ? 'Approving Token…'
                : 'Executing Swap…'
              : !account
                ? 'Connect wallet to trade'
                : !parsedAmount || parsedAmount === 0n
                  ? 'Enter an amount'
                  : needsApproval
                    ? `Approve & ${mode === 'buy' ? 'Buy' : 'Sell'}`
                    : `${mode === 'buy' ? 'Buy' : 'Sell'} on DEX`}
          </button>
        </form>
      </div>
    </div>
  )
}
