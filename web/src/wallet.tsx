import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { Connection, type Transaction } from "@solana/web3.js";
import { api } from "./api";
const rpcUrl =
  import.meta.env.VITE_RPC_URL || `${window.location.origin}/v1/rpc`;
export const connection = new Connection(rpcUrl, "confirmed");
interface WalletState {
  wallet: Wallet | null;
  account: WalletAccount | null;
  wallets: readonly Wallet[];
  connect: (wallet: Wallet) => Promise<void>;
  disconnect: () => Promise<void>;
  send: (
    transaction: Transaction,
    lastValidBlockHeight: number,
  ) => Promise<string>;
}
const Context = createContext<WalletState | null>(null);
export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null),
    [account, setAccount] = useState<WalletAccount | null>(null),
    [wallets, setWallets] = useState<readonly Wallet[]>([]);
  useEffect(() => {
    const registry = getWallets();
    const refresh = () =>
      setWallets(
        registry.get().filter((w) => "solana:signTransaction" in w.features),
      );
    refresh();
    const a = registry.on("register", refresh),
      b = registry.on("unregister", refresh);
    return () => {
      a();
      b();
    };
  }, []);
  useEffect(() => {
    if (!wallet || !("standard:events" in wallet.features)) return;
    const feature = wallet.features["standard:events"] as {
      on: (
        event: string,
        fn: (event: { accounts?: readonly WalletAccount[] }) => void,
      ) => () => void;
    };
    return feature.on("change", (event) => {
      if (event.accounts) setAccount(event.accounts[0] ?? null);
    });
  }, [wallet]);
  async function connect(selected: Wallet) {
    const feature = selected.features["standard:connect"] as {
      connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
    };
    const result = await feature.connect();
    const config = await api.config();
    const chain = `solana:${config.network}` as const;
    const a = result.accounts.find((a) => a.chains.includes(chain));
    if (!a)
      throw new Error(
        config.network === "localnet"
          ? "This app uses a local Solana validator. Use a wallet that supports localnet with RPC http://127.0.0.1:8899. Public devnet is a different network."
          : "Enable Solana devnet in this wallet",
      );
    setWallet(selected);
    setAccount(a);
  }
  async function disconnect() {
    if (wallet) {
      const feature = wallet.features["standard:disconnect"] as
        { disconnect: () => Promise<void> } | undefined;
      await feature?.disconnect();
    }
    setWallet(null);
    setAccount(null);
  }
  async function send(transaction: Transaction, lastValidBlockHeight: number) {
    if (!wallet || !account) throw new Error("Connect a Solana wallet");
    const config = await api.config();
    if (!config.configured)
      throw new Error("This Solana deployment has not been configured");
    if ((await connection.getGenesisHash()) !== config.genesisHash)
      throw new Error("RPC network does not match this Solana deployment");
    const chain = `solana:${config.network}` as const;
    if (!account.chains.includes(chain))
      throw new Error(
        `Wallet does not support this app's Solana ${config.network} network`,
      );
    if (transaction.feePayer?.toBase58() !== account.address)
      throw new Error("Transaction wallet changed");
    const feature = wallet.features["solana:signTransaction"] as {
      signTransaction: (
        ...inputs: {
          account: WalletAccount;
          chain: "solana:devnet" | "solana:localnet";
          transaction: Uint8Array;
        }[]
      ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
    };
    const [signed] = await feature.signTransaction({
      account,
      chain,
      transaction: transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }),
    });
    const hash = await connection.sendRawTransaction(signed.signedTransaction, {
      skipPreflight: false,
    });
    // The restricted HTTP proxy does not expose Solana RPC subscriptions.
    // Confirm through statuses so local and deployed wallets use the same path.
    for (;;) {
      const status = (
        await connection.getSignatureStatuses([hash], {
          searchTransactionHistory: true,
        })
      ).value[0];
      if (status?.err)
        throw new Error(`Transaction reverted: ${JSON.stringify(status.err)}`);
      if (
        status?.confirmationStatus === "confirmed" ||
        status?.confirmationStatus === "finalized"
      )
        break;
      if ((await connection.getBlockHeight("confirmed")) > lastValidBlockHeight)
        throw new Error(
          `Confirmation expired. Inspect transaction ${hash} before retrying.`,
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return hash;
  }
  return (
    <Context.Provider
      value={{ wallet, account, wallets, connect, disconnect, send }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWallet() {
  const value = useContext(Context);
  if (!value) throw new Error("Wallet provider missing");
  return value;
}
