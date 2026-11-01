import type { WalletSendPhase } from "./wallet";
export type TransactionPhase =
  | "idle"
  | "preparing"
  | WalletSendPhase
  | "indexing"
  | "confirmed"
  | "error";
export const transactionLabels: Record<TransactionPhase, string> = {
  idle: "Ready",
  preparing: "Preparing transaction…",
  "awaiting-wallet": "Approve in your wallet…",
  submitting: "Submitting to Solana…",
  confirming: "Waiting for confirmation…",
  indexing: "Refreshing your activity…",
  confirmed: "Transaction confirmed",
  error: "Transaction needs attention",
};
