import { useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { buildTransaction, type TxAction } from "@waffles/shared/client";
import { connection, useWallet } from "./wallet";
import { useQueryClient } from "@tanstack/react-query";
import { transactionLabels, type TransactionPhase } from "./transaction-status";
export function useTransaction() {
  const wallet = useWallet(),
    query = useQueryClient();
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<TransactionPhase>("idle");
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [signature, setSignature] = useState("");
  async function send(input: TxAction) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setPhase("preparing");
    setError("");
    setSignature("");
    try {
      if (!wallet.account)
        throw new Error("Connect a Solana devnet wallet first");
      const built = await buildTransaction(
        connection,
        new PublicKey(wallet.account.address),
        input,
      );
      const hash = await wallet.send(
        built.transaction,
        built.lastValidBlockHeight,
        (nextPhase, hash) => {
          setPhase(nextPhase);
          if (hash) setSignature(hash);
        },
      );
      setSignature(hash);
      setPhase("indexing");
      try {
        await query.invalidateQueries();
      } catch {
        /* Confirmation is independent of refreshing indexed data. */
      }
      setPhase("confirmed");
      return { ...built, signature: hash };
    } catch (error) {
      setPhase("error");
      setError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return {
    send,
    pending,
    error,
    signature,
    phase,
    label: transactionLabels[phase],
  };
}
