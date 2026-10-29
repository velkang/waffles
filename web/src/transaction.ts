import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { buildTransaction, type TxAction } from "@waffles/shared/client";
import { connection, useWallet } from "./wallet";
import { useQueryClient } from "@tanstack/react-query";
export function useTransaction() {
  const wallet = useWallet(),
    query = useQueryClient();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [signature, setSignature] = useState("");
  async function send(input: TxAction) {
    setPending(true);
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
      );
      setSignature(hash);
      await query.invalidateQueries();
      return { ...built, signature: hash };
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setPending(false);
    }
  }
  return { send, pending, error, signature };
}
