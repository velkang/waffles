import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import { useWallet } from "../wallet";
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Shell,
    notFoundComponent: () => (
      <div className="market-empty">
        <h1>Page not found</h1>
        <Link to="/">Explore markets</Link>
      </div>
    ),
  },
);
function Shell() {
  const wallet = useWallet(),
    queryClient = useQueryClient();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  useEffect(() => {
    let socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      stopped = false;
    let sequence = Number(sessionStorage.getItem("waffles-sequence") ?? 0);
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/v1/events?topic=launches`,
      );
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "stream.ready") {
            void queryClient.invalidateQueries();
            return;
          }
          if (data.sequence <= sequence) return;
          sequence = data.sequence;
          sessionStorage.setItem("waffles-sequence", String(sequence));
          void queryClient.invalidateQueries({ queryKey: ["markets"] });
          if (data.mint) {
            void queryClient.invalidateQueries({
              queryKey: ["market", data.mint],
            });
            void queryClient.invalidateQueries({
              queryKey: ["commitments", data.mint],
            });
            void queryClient.invalidateQueries({
              queryKey: ["trades", data.mint],
            });
            void queryClient.invalidateQueries({
              queryKey: ["candles", data.mint],
            });
          }
          void queryClient.invalidateQueries({ queryKey: ["portfolio"] });
          if (data.wallet) {
            void queryClient.invalidateQueries({
              queryKey: ["claims", data.wallet],
            });
            void queryClient.invalidateQueries({
              queryKey: ["rewards", data.wallet],
            });
          }
          if (data.type === "distribution") {
            for (const key of ["distributions", "epochs", "claims", "rewards"])
              void queryClient.invalidateQueries({ queryKey: [key] });
          }
        } catch {}
      };
      socket.onclose = () => {
        if (!stopped) timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [queryClient]);
  return (
    <>
      <header className="market-header">
        <div className="market-header-inner">
          <Link to="/" className="market-brand">
            waffles<span>.meme</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link to="/">Explore</Link>
            <Link to="/analytics">Analytics</Link>
            <Link to="/portfolio">Portfolio</Link>
            <Link to="/rewards">Rewards</Link>
          </nav>
          <div className="market-header-actions">
            <Link to="/create" className="market-button">
              Create
            </Link>
            <button className="market-primary" onClick={() => setOpen(!open)}>
              {wallet.account
                ? `${wallet.account.address.slice(0, 4)}…${wallet.account.address.slice(-4)}`
                : "Connect"}
            </button>
          </div>
        </div>
      </header>
      <div className="devnet-notice">
        Solana {config.data?.network ?? "devnet"} · Test tokens only · Unaudited
        ·{" "}
        {config.data?.configured
          ? "Operator-calculated rewards"
          : "Deployment configuration pending"}
      </div>
      {open && (
        <section className="wallet-drawer" aria-label="Connect wallet">
          <h2>{wallet.account ? "Your wallet" : "Connect a Solana wallet"}</h2>
          {wallet.account ? (
            <button
              className="market-button"
              onClick={() =>
                void wallet.disconnect().then(() => setOpen(false))
              }
            >
              Disconnect
            </button>
          ) : wallet.wallets.length ? (
            wallet.wallets.map((w) => (
              <button
                className="market-button"
                disabled={busy}
                key={w.name}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void wallet
                    .connect(w)
                    .then(() => setOpen(false))
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                {w.name}
              </button>
            ))
          ) : (
            <p>
              {config.data?.network === "localnet"
                ? "No wallet detected. This app uses a local validator. Connect a wallet that supports localnet."
                : "No compatible wallet detected. Install Phantom or Solflare, enable devnet, and reload."}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="market-button" onClick={() => setOpen(false)}>
            Close
          </button>
        </section>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="app-footer">
        Trading in SOL. Creator commitments are inspectable, not guarantees
        against loss.
        {config.data?.upgradeAuthority && (
          <span>
            {" "}
            Program upgrade authority:{" "}
            <a
              href={`https://explorer.solana.com/address/${config.data.upgradeAuthority}?cluster=devnet`}
            >
              {config.data.upgradeAuthority}
            </a>
          </span>
        )}
      </footer>
    </>
  );
}
