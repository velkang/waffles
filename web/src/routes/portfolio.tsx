import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { request } from "../api";
import { useWallet } from "../wallet";
import { useTransaction } from "../transaction";
import { WalletWelcome } from "../brand";
import { parseUnits, type Commitment } from "@waffles/shared/solana";
import { AddressLink, TransactionNotice } from "../components";
import { PortfolioDashboard, type PortfolioData } from "../portfolio-view";
export const Route = createFileRoute("/portfolio")({ component: Portfolio });

function Portfolio() {
  const wallet = useWallet(),
    tx = useTransaction();
  const query = useQuery({
    queryKey: ["portfolio", wallet.account?.address],
    queryFn: () =>
      request<PortfolioData>(`/v1/portfolios/${wallet.account!.address}`),
    enabled: Boolean(wallet.account),
    refetchInterval: 30_000,
  });
  const [mint, setMint] = useState(""),
    [amount, setAmount] = useState(""),
    [unlock, setUnlock] = useState(""),
    [asset, setAsset] = useState("token"),
    [error, setError] = useState(""),
    [loadingCommitment, setLoadingCommitment] = useState(false);
  const withdrawalLookup = useRef(false);
  async function withdraw(c: Commitment) {
    if (withdrawalLookup.current || tx.pending) return;
    withdrawalLookup.current = true;
    setLoadingCommitment(true);
    setError("");
    try {
      const d = await request<{ nonce: string }>(`/v1/commitment/${c.id}`);
      await tx.send({ action: "unlock", mint: c.mint, nonce: d.nonce });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      withdrawalLookup.current = false;
      setLoadingCommitment(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!query.data?.created.some((m) => m.mint === mint))
        throw new Error(
          "Choose a token you created to add a creator commitment",
        );
      const date = Math.floor(new Date(unlock).getTime() / 1000);
      if (!Number.isSafeInteger(date) || date <= Date.now() / 1000)
        throw new Error("Choose a future unlock date");
      const units = parseUnits(amount, asset === "token" ? 6 : 9);
      if (units <= 0n) throw new Error("Enter an amount greater than zero");
      await tx.send({
        action: "lock",
        mint,
        amount: units.toString(),
        unlock: date,
        tokenAsset: asset === "token",
        nonce: Date.now().toString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  if (!wallet.account)
    return (
      <div className="market-page portfolio-page">
        <WalletWelcome />
        <section
          className="portfolio-peek"
          aria-labelledby="portfolio-peek-title"
        >
          <div className="ux-panel-heading">
            <h2 id="portfolio-peek-title">
              A place for every part of your stack.
            </h2>
            <span className="ux-network-chip">Connect to view</span>
          </div>
          <dl>
            <div>
              <dt>Coin holdings</dt>
              <dd>—</dd>
              <dd className="peek-description">
                Finalized token balances and links to their markets.
              </dd>
            </div>
            <div>
              <dt>Creator earnings</dt>
              <dd>—</dd>
              <dd className="peek-description">
                Your launches, funded earnings and claim controls.
              </dd>
            </div>
            <div>
              <dt>Public commitments</dt>
              <dd>—</dd>
              <dd className="peek-description">
                Lock amounts, unlock dates and available withdrawals.
              </dd>
            </div>
          </dl>
          <p className="ux-muted-note">
            Personal data appears after connecting. View your tickets and
            available prizes on <Link to="/rewards">Rewards</Link>.
          </p>
        </section>
      </div>
    );
  return (
    <div className="market-page portfolio-page">
      <div className="market-heading dashboard-heading">
        <div>
          <h1>Your Waffle stack.</h1>
          <p>Coins, creator earnings and commitments, together.</p>
          <div className="portfolio-address">
            <AddressLink address={wallet.account.address} />
            <span>Solana devnet</span>
          </div>
        </div>
        <div className="button-row">
          <Link className="market-button" to="/">
            Explore coins
          </Link>
          <button
            className="market-button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Refresh holdings"}
          </button>
        </div>
      </div>
      {query.isError && (
        <div className="dashboard-message" role="alert">
          <strong>
            {query.data
              ? "The latest refresh didn’t arrive."
              : "We couldn’t load your portfolio."}
          </strong>
          <p>{query.error.message}</p>
          <button
            className="market-button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
          {query.data && (
            <p>Showing the last loaded portfolio. Balances may have changed.</p>
          )}
        </div>
      )}
      {query.isPending ? (
        <section className="analytics-panel dashboard-loading" role="status">
          <h2>Gathering your stack…</h2>
          <p>Loading finalized holdings, launches and commitments.</p>
          <div className="loading-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : query.data ? (
        <>
          <PortfolioDashboard
            key={wallet.account.address}
            data={query.data}
            pending={tx.pending || loadingCommitment}
            onWithdraw={(c) => void withdraw(c)}
            onClaim={(m, locked) => {
              setError("");
              void tx.send({ action: "withdrawFees", mint: m.mint, locked });
            }}
          />
          <section
            className="analytics-panel additional-lock"
            id="additional-lock"
          >
            <div className="ux-panel-heading">
              <div>
                <h2>Put a little aside.</h2>
                <p className="dashboard-description">
                  Create an additional public lock for a token you launched.
                </p>
              </div>
            </div>
            {query.data.created.length ? (
              <details>
                <summary>Create an additional lock</summary>
                <p className="lock-explanation">
                  Choose any future cliff for your own token. The beneficiary
                  and unlock date cannot change. Ticket credit requires verified
                  purchase cost and completed weeks.
                </p>
                <form onSubmit={submit} className="lock-form">
                  <fieldset disabled={tx.pending || loadingCommitment}>
                    <div className="lock-fields">
                      <label className="field">
                        Your token
                        <select
                          required
                          value={mint}
                          onChange={(e) => setMint(e.target.value)}
                        >
                          <option value="">Choose a launch</option>
                          {query.data.created.map((m) => (
                            <option key={m.mint} value={m.mint}>
                              {m.name} (${m.symbol}) · {m.mint.slice(0, 5)}…
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Asset
                        <select
                          value={asset}
                          onChange={(e) => setAsset(e.target.value)}
                        >
                          <option value="token">Purchased tokens</option>
                          <option value="sol">
                            Earned, unwithdrawn creator SOL
                          </option>
                        </select>
                      </label>
                      <label className="field">
                        Amount
                        <input
                          required
                          inputMode="decimal"
                          placeholder={asset === "token" ? "0 tokens" : "0 SOL"}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        Unlock date
                        <input
                          required
                          type="datetime-local"
                          value={unlock}
                          onChange={(e) => setUnlock(e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="lock-warning">
                      This lock is irreversible. The chosen assets remain locked
                      until the date above.
                    </p>
                    <button className="market-primary">
                      {tx.pending ? tx.label : "Create irreversible lock"}
                    </button>
                  </fieldset>
                </form>
              </details>
            ) : (
              <p className="dashboard-description">
                You’ll be able to add a lock after creating a coin with this
                wallet. <Link to="/create">Create a coin</Link>
              </p>
            )}
          </section>
        </>
      ) : null}
      {loadingCommitment && (
        <p className="dashboard-message" role="status">
          Checking the commitment before requesting wallet approval…
        </p>
      )}
      <TransactionNotice
        error={error || tx.error}
        signature={tx.signature}
        phase={tx.phase}
      />
    </div>
  );
}
