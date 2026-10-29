import { formatUnits } from "@waffles/shared/solana";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";
export function TransactionNotice({
  error,
  signature,
}: {
  error: string;
  signature: string;
}) {
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {signature && (
        <p className="form-success" role="status">
          Transaction confirmed. Finalized indexing can take a moment.{" "}
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        </p>
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
  if (balances.isError) return <p>Funded creator balances are unavailable.</p>;
  if (balances.data?.custodyConsistent === false)
    return (
      <p role="alert">
        Market custody does not reconcile. Trading should wait for operator
        review.
      </p>
    );
  return (
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
  );
}
