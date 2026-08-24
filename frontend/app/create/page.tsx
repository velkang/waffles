"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePublicClient } from "wagmi";
import {
  launchFactoryAbi,
  useReadLaunchFactoryCreationFee,
  useWriteLaunchFactoryCreateToken,
  useWriteMockUsdcApprove,
} from "@/generated/contracts-generated";
import { FACTORY_ADDRESS, USDC_ADDRESS } from "@/lib/wagmi";

type Status = "idle" | "approving" | "creating" | "done" | "error";

const inputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";

export default function CreatePage() {
  const router = useRouter();
  const publicClient = usePublicClient();

  const { data: creationFee } = useReadLaunchFactoryCreationFee({
    address: FACTORY_ADDRESS,
  });

  const approveAsync = useWriteMockUsdcApprove().writeContractAsync;
  const createAsync = useWriteLaunchFactoryCreateToken().writeContractAsync;

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    imageUri: "",
    website: "",
    twitter: "",
    telegram: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const feeUsd =
    creationFee !== undefined ? Number(creationFee) / 1e6 : undefined;
  const canSubmit =
    status === "idle" && form.name.trim() !== "" && form.symbol.trim() !== "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !publicClient) return;
    setError("");

    try {
      const fee = creationFee ?? 0n;
      if (fee > 0n) {
        setStatus("approving");
        const hash = await approveAsync({
          address: USDC_ADDRESS,
          args: [FACTORY_ADDRESS, fee],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setStatus("creating");
      const hash = await createAsync({
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
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      for (const log of receipt.logs) {
        try {
          const ev = {
            abi: launchFactoryAbi,
            data: log.data,
            topics: log.topics,
          } as const;
          const { eventName, args } = await import("viem").then((m) =>
            m.decodeEventLog(ev),
          );
          if (eventName === "TokenCreated") {
            setStatus("done");
            router.push(`/token/${(args as { token: string }).token}`);
            return;
          }
        } catch {
          // not a factory event
        }
      }
      setStatus("done");
      router.push("/");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold">Create a token</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Live on the bonding curve immediately. Graduates to DEX liquidity at
        $50K market cap.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Name *</span>
            <input
              className={inputClass}
              placeholder="Ghost Coin"
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              maxLength={32}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Ticker *</span>
            <input
              className={inputClass}
              placeholder="GHOST"
              value={form.symbol}
              onChange={(e) => set("symbol")(e.target.value.toUpperCase())}
              maxLength={11}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Description</span>
          <textarea
            className={`${inputClass} h-20 resize-none`}
            placeholder="What is this token about?"
            value={form.description}
            onChange={(e) => set("description")(e.target.value)}
            maxLength={280}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-zinc-400">Image URL</span>
          <input
            className={inputClass}
            placeholder="https://…"
            value={form.imageUri}
            onChange={(e) => set("imageUri")(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Website</span>
            <input
              className={inputClass}
              value={form.website}
              onChange={(e) => set("website")(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">X / Twitter</span>
            <input
              className={inputClass}
              value={form.twitter}
              onChange={(e) => set("twitter")(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">Telegram</span>
            <input
              className={inputClass}
              value={form.telegram}
              onChange={(e) => set("telegram")(e.target.value)}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {status === "approving"
            ? "Approving USDC…"
            : status === "creating"
              ? "Creating token…"
              : feeUsd !== undefined && feeUsd > 0
                ? `Create Token ($${feeUsd} fee)`
                : "Create Token"}
        </button>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
