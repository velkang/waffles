import { formatUnits } from "@waffles/shared/solana";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";
import { transactionLabels, type TransactionPhase } from "./transaction-status";
export function TransactionNotice({
  error,
  signature,
  phase = signature ? "confirmed" : "idle",
}: {
  error: string;
  signature: string;
  phase?: TransactionPhase;
}) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {phase !== "idle" && (phase !== "error" || signature) && (
        <div
          className={`transaction-status ${phase === "confirmed" ? "is-complete" : ""}`}
          role="status"
          aria-live="polite"
        >
          <strong>
            {phase === "error" && signature
              ? "Check this transaction before retrying"
              : transactionLabels[phase]}
          </strong>
          <p>
            {phase === "awaiting-wallet"
              ? "Check the amounts and approve or reject the request in your wallet."
              : phase === "confirmed" || phase === "indexing"
                ? "Confirmed on Solana. Finalized balances and rewards may take a moment to update."
                : phase === "confirming"
                  ? "Your transaction was submitted. Keep this page open while Solana confirms it."
                  : phase === "error"
                    ? "Confirmation was interrupted. Open the transaction to check its on-chain status."
                    : "Your balances will update after confirmation."}
          </p>
          {signature && (
            <a
              href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          )}
        </div>
      )}
    </>
  );
}
export function dateTime(at: number) {
  return new Date(at * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {address.slice(0, 5)}…{address.slice(-5)}
    </a>
  );
}
export function Upload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <label htmlFor="token-image">
        Token image · PNG, JPEG, WebP, or GIF up to 5 MB
      </label>
      <input
        id="token-image"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            const form = new FormData();
            form.set("file", file);
            const response = await fetch("/v1/uploads", {
              method: "POST",
              body: form,
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            onUploaded(data.url);
          } catch (error) {
            setError(String(error));
          } finally {
            e.target.value = "";
            setBusy(false);
          }
        }}
      />
      {busy && <p role="status">Uploading image…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function CreatorEarnings({ mint }: { mint: string }) {
  const balances = useQuery({
    queryKey: ["creator-earnings", mint],
    queryFn: () =>
      request<{
        directSol: string;
        lockedSol: string;
        buybackSol: string;
        custodyConsistent: boolean;
      }>(`/v1/creator-earnings/${mint}`),
    refetchInterval: 30_000,
    retry: false,
  });
  if (balances.isError && !balances.data)
    return (
      <div role="alert">
        <p>Funded creator balances are unavailable.</p>
        <button
          className="market-button"
          onClick={() => void balances.refetch()}
        >
          Retry earnings
        </button>
      </div>
    );
  if (balances.data?.custodyConsistent === false)
    return (
      <p role="alert">
        Market custody does not reconcile. Trading should wait for operator
        review.
      </p>
    );
  return (
    <div aria-busy={balances.isPending}>
      {balances.isPending && (
        <p className="ux-muted-note" role="status">
          Loading funded creator balances…
        </p>
      )}
      {balances.isError && (
        <p className="ux-muted-note" role="alert">
          Creator balances couldn’t refresh. Showing the last loaded amounts.
        </p>
      )}
      <dl className="analytics-fees">
        {[
          ["Direct earnings", balances.data?.directSol],
          ["Locked earnings", balances.data?.lockedSol],
          ["Buyback allocation", balances.data?.buybackSol],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label} · funded</dt>
            <dd>{value === undefined ? "—" : formatUnits(value)} SOL</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
