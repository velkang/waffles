'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePublicClient } from 'wagmi'
import { parseUnits, decodeEventLog } from 'viem'
import {
  wafflesLaunchFactoryAbi,
  useReadWafflesLaunchFactoryCreationFee,
  useWriteWafflesLaunchFactoryCreateToken,
  useWriteMockUsdcApprove,
  useWriteWafflesBondingCurveBuy,
} from '@/generated/contracts-generated'
import { FACTORY_ADDRESS, USDC_ADDRESS } from '@/lib/wagmi'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ImageUpload } from '@/components/ui/ImageUpload'
import {
  GRADUATION_TARGET_FORMATTED,
  INITIAL_MCAP_FORMATTED,
  MAX_DEV_BUY_USDC,
} from '@/lib/config'

type Status = 'idle' | 'approving' | 'creating' | 'buying' | 'done' | 'error'

const inputClass =
  'w-full rounded-[6px] border border-[#24262e] bg-[#1a1b21] px-3 py-2 text-xs font-mono text-white outline-none transition placeholder:text-zinc-500 focus:border-[#db9d6a]'

export default function CreatePage() {
  const router = useRouter()
  const publicClient = usePublicClient()

  const { data: creationFee } = useReadWafflesLaunchFactoryCreationFee({
    address: FACTORY_ADDRESS,
  })

  const approveAsync = useWriteMockUsdcApprove().writeContractAsync
  const createAsync =
    useWriteWafflesLaunchFactoryCreateToken().writeContractAsync
  const buyAsync = useWriteWafflesBondingCurveBuy().writeContractAsync

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [initialBuyAmount, setInitialBuyAmount] = useState<string>('')
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    description: '',
    imageUri: '',
    website: '',
    twitter: '',
    telegram: '',
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const feeUsd =
    creationFee !== undefined ? Number(creationFee) / 1e6 : undefined
  const initialBuyNum = Number(initialBuyAmount) || 0
  const isBuyAmountValid =
    initialBuyNum >= 0 && initialBuyNum <= MAX_DEV_BUY_USDC
  const totalCostUsd = (feeUsd ?? 0) + initialBuyNum

  const canSubmit =
    status === 'idle' &&
    !imageUploading &&
    form.name.trim() !== '' &&
    form.symbol.trim() !== '' &&
    isBuyAmountValid

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !publicClient) return
    setError('')

    try {
      const fee = creationFee ?? 0n
      const initialBuyRaw =
        initialBuyNum > 0 ? parseUnits(initialBuyAmount, 6) : 0n

      // 1. Approve factory creation fee if needed
      if (fee > 0n) {
        setStatus('approving')
        const hash = await approveAsync({
          address: USDC_ADDRESS,
          args: [FACTORY_ADDRESS, fee],
        })
        await publicClient.waitForTransactionReceipt({ hash })
      }

      // 2. Deploy token & bonding curve via factory
      setStatus('creating')
      const createHash = await createAsync({
        address: FACTORY_ADDRESS,
        args: [
          form.name.trim(),
          form.symbol.trim(),
          form.description,
          form.imageUri,
          form.website,
          form.twitter,
          form.telegram,
        ],
      })
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: createHash,
      })

      let createdToken = ''
      let createdCurve = '' as `0x${string}`

      for (const log of receipt.logs) {
        try {
          const ev = {
            abi: wafflesLaunchFactoryAbi,
            data: log.data,
            topics: log.topics,
          } as const
          const { eventName, args } = decodeEventLog(ev)
          if (eventName === 'TokenCreated') {
            createdToken = (args as { token: string }).token
            createdCurve = (args as { curve: `0x${string}` }).curve
            break
          }
        } catch {
          // not factory event
        }
      }

      if (!createdToken) {
        setStatus('done')
        router.push('/')
        return
      }

      // 3. Execute Initial Dev Buy if specified
      if (initialBuyRaw > 0n && createdCurve) {
        setStatus('buying')
        // Approve curve to spend USDC
        const approveBuyHash = await approveAsync({
          address: USDC_ADDRESS,
          args: [createdCurve, initialBuyRaw],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveBuyHash })

        // Execute buy on bonding curve
        const buyHash = await buyAsync({
          address: createdCurve,
          args: [initialBuyRaw, 0n],
        })
        await publicClient.waitForTransactionReceipt({ hash: buyHash })
      }

      setStatus('done')
      router.push(`/token/${createdToken}`)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Deploy token on <span className="text-[#db9d6a]">waffles.meme</span>
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Fair launch • Instant trading.
          {feeUsd !== undefined && feeUsd > 0 && (
            <span className="ml-1 text-[#db9d6a] font-bold">
              Creation fee: ${feeUsd} USDC.
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Form */}
        <form
          onSubmit={submit}
          className="rounded-[10px] border border-[#24262e] bg-[#141519] p-5 space-y-4 font-mono text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                TOKEN NAME *
              </label>
              <input
                className={inputClass}
                placeholder="e.g. Bare"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                maxLength={32}
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                SYMBOL / TICKER *
              </label>
              <input
                className={`${inputClass} font-bold text-[#db9d6a] uppercase`}
                placeholder="e.g. BARE"
                value={form.symbol}
                onChange={(e) => set('symbol')(e.target.value.toUpperCase())}
                maxLength={10}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              DESCRIPTION
            </label>
            <textarea
              className={`${inputClass} h-20 resize-none font-sans`}
              placeholder="Token thesis, utility, roadmap…"
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
              maxLength={280}
            />
          </div>

          {/* Drag and Drop / File Picker Image Upload */}
          <ImageUpload
            value={form.imageUri}
            onChange={(url) => set('imageUri')(url)}
            onUploadingChange={setImageUploading}
          />

          {/* Initial Dev Buy Option */}
          <div className="rounded-[8px] border border-[#db9d6a]/30 bg-[#1a1b21] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#db9d6a]">
                  INITIAL BUY (OPTIONAL)
                </label>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Max: ${MAX_DEV_BUY_USDC} USDC
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={MAX_DEV_BUY_USDC}
                  className={`${inputClass} pr-12 ${
                    !isBuyAmountValid
                      ? 'border-red-500/80 focus:border-red-500'
                      : ''
                  }`}
                  placeholder="0.00"
                  value={initialBuyAmount}
                  onChange={(e) => setInitialBuyAmount(e.target.value)}
                />
                <span className="absolute right-3 top-2 text-[10px] font-bold text-zinc-400">
                  USDC
                </span>
              </div>
              <div className="flex items-center gap-1">
                {['1', '5', '10', '25', '50']
                  .filter((p) => Number(p) <= MAX_DEV_BUY_USDC)
                  .map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInitialBuyAmount(preset)}
                      className={`rounded-[4px] border px-2 py-1.5 text-[10px] font-bold transition ${
                        initialBuyAmount === preset
                          ? 'border-[#db9d6a] bg-[#db9d6a] text-[#0e0f12]'
                          : 'border-[#24262e] bg-[#141519] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                {initialBuyAmount && (
                  <button
                    type="button"
                    onClick={() => setInitialBuyAmount('')}
                    className="rounded-[4px] border border-[#24262e] px-1.5 py-1.5 text-[10px] text-zinc-500 hover:text-red-400 transition"
                    title="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {!isBuyAmountValid && (
              <p className="text-[10px] text-red-400 font-sans">
                Initial dev buy cannot exceed ${MAX_DEV_BUY_USDC} USDC.
              </p>
            )}
          </div>

          <div className="border-t border-[#24262e] pt-3.5 space-y-3">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#db9d6a]">
              COMMUNITY & SOCIAL METADATA (OPTIONAL)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">
                  WEBSITE
                </label>
                <input
                  className={inputClass}
                  placeholder="https://…"
                  value={form.website}
                  onChange={(e) => set('website')(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">
                  𝕏 TWITTER
                </label>
                <input
                  className={inputClass}
                  placeholder="@handle"
                  value={form.twitter}
                  onChange={(e) => set('twitter')(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 mb-0.5">
                  TELEGRAM
                </label>
                <input
                  className={inputClass}
                  placeholder="t.me/…"
                  value={form.telegram}
                  onChange={(e) => set('telegram')(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-[6px] border border-red-500/40 bg-[#2b1114] p-2.5 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-[6px] bg-[#db9d6a] py-2.5 text-xs font-mono font-bold text-[#0e0f12] transition hover:bg-[#e5ab7a] active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
          >
            {status === 'approving'
              ? 'Approving USDC Fee…'
              : status === 'creating'
                ? 'Deploying Token on Arc…'
                : status === 'buying'
                  ? `Purchasing Initial ${initialBuyAmount} USDC Bag…`
                  : totalCostUsd > 0
                    ? `Deploy Token & Buy ($${totalCostUsd.toFixed(2)} USDC Total)`
                    : 'Deploy Token'}
          </button>
        </form>

        {/* Live Card Preview */}
        <div className="space-y-2">
          <span className="block text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            Preview
          </span>
          <div className="rounded-[10px] border border-[#24262e] bg-[#141519] p-4 space-y-3 font-mono text-xs">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {form.imageUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.imageUri}
                    alt=""
                    className="h-10 w-10 rounded-[8px] border border-[#24262e] object-cover bg-[#1a1b21]"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#1a1b21] border border-[#24262e] font-bold text-[#db9d6a] text-xs">
                    {(form.symbol || 'NEW').slice(0, 3)}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="truncate font-bold text-white text-sm block">
                    ${form.symbol || 'TICKER'}
                  </span>
                  <span className="truncate text-[11px] text-zinc-400 font-sans block">
                    {form.name || 'Token Name'}
                  </span>
                </div>
              </div>

              <StatusBadge graduated={false} size="xs" />
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-[6px] bg-[#1a1b21] p-2 border border-[#24262e]">
              <div>
                <span className="text-[9px] text-zinc-500 uppercase block">
                  INITIAL MCAP
                </span>
                <span className="font-bold text-white text-xs">
                  {INITIAL_MCAP_FORMATTED}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-[#db9d6a] uppercase block">
                  TARGET
                </span>
                <span className="font-bold text-[#db9d6a] text-xs">
                  {GRADUATION_TARGET_FORMATTED}
                </span>
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#24262e]">
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">CURVE PROGRESS</span>
                <span className="font-bold text-[#db9d6a]">0.0%</span>
              </div>
              <ProgressBar
                progress={0}
                graduated={false}
                size="sm"
                showTicks={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
