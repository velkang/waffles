import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { request } from "../api";
import { useWallet } from "../wallet";
import { useTransaction } from "../transaction";
import {
  formatUnits,
  parseUnits,
  type Market,
  type Commitment,
} from "@waffles/shared/solana";
import {
  dateTime,
  AddressLink,
  TransactionNotice,
  CreatorEarnings,
} from "../components";
export const Route = createFileRoute("/portfolio")({ component: Portfolio });
function Portfolio() {
  const wallet = useWallet(),
    tx = useTransaction();
  const query = useQuery({
    queryKey: ["portfolio", wallet.account?.address],
    queryFn: () =>
      request<{
        positions: { mint: string; balance: string }[];
        created: Market[];
        commitments: Commitment[];
      }>(`/v1/portfolios/${wallet.account!.address}`),
    enabled: Boolean(wallet.account),
    refetchInterval: 30_000,
  });
  const [mint, setMint] = useState(""),
    [amount, setAmount] = useState(""),
    [unlock, setUnlock] = useState(""),
    [asset, setAsset] = useState("token"),
    [error, setError] = useState("");
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
      await tx.send({
        action: "lock",
        mint,
        amount: parseUnits(amount, asset === "token" ? 6 : 9).toString(),
        unlock: date,
        tokenAsset: asset === "token",
        nonce: Date.now().toString(),
      });
    } catch (e) {
      setError(String(e));
    }
  }
  if (!wallet.account)
    return (
      <div className="market-empty">
        <h1>Your portfolio</h1>
        <p>
          Connect a Solana devnet wallet to inspect your holdings, creator
          earnings, and commitments.
        </p>
      </div>
    );
  return (
    <div className="market-page">
      <div className="market-heading">
        <div>
          <h1>Your portfolio</h1>
          <p>
            <AddressLink address={wallet.account.address} />
          </p>
        </div>
      </div>
      {query.isError ? (
        <div role="alert" className="market-empty">
          <p>{query.error.message}</p>
          <button
            className="market-button"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <section className="analytics-panel">
            <h2>Indexed holdings</h2>
            {query.data?.positions.length ? (
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Balance</th>
                    <th>Market</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.positions.map((p) => (
                    <tr key={p.mint}>
                      <td>
                        <AddressLink address={p.mint} />
                      </td>
                      <td>{formatUnits(p.balance, 6, 2)}</td>
                      <td>
                        <Link to="/token/$mint" params={{ mint: p.mint }}>
                          Open market
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No finalized holdings indexed yet.</p>
            )}
            <p className="market-footnote">
              Includes recognized vested beneficial ownership. Indexed balances
              can lag wallet activity.
            </p>
          </section>
          <section className="analytics-panel">
            <h2>Your launches</h2>
            {query.data?.created.length ? (
              query.data.created.map((m) => (
                <div className="claim-row" key={m.mint}>
                  <Link to="/token/$mint" params={{ mint: m.mint }}>
                    {m.name} · ${m.symbol}
                  </Link>
                  <CreatorEarnings mint={m.mint} />
                  <div className="button-row">
                    <button
                      className="market-button"
                      disabled={tx.pending}
                      onClick={() =>
                        void tx.send({
                          action: "withdrawFees",
                          mint: m.mint,
                          locked: false,
                        })
                      }
                    >
                      Claim direct earnings
                    </button>
                    {m.routing.locked > 0 && (
                      <button
                        className="market-button"
                        disabled={tx.pending || m.feeCliff > Date.now() / 1000}
                        onClick={() =>
                          void tx.send({
                            action: "withdrawFees",
                            mint: m.mint,
                            locked: true,
                          })
                        }
                      >
                        Withdraw unlocked fee earnings
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p>No launches created by this wallet.</p>
            )}
          </section>
          <section className="analytics-panel">
            <h2>Public commitments</h2>
            {query.data?.commitments.length ? (
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Amount</th>
                    <th>Unlock</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.commitments.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.asset === "sol" ? "SOL earnings" : "Tokens"}
                        <br />
                        <AddressLink address={c.mint} />
                      </td>
                      <td>
                        {formatUnits(c.amount, c.asset === "sol" ? 9 : 6)}
                      </td>
                      <td>{dateTime(c.unlockAt)}</td>
                      <td>
                        {c.withdrawn ? (
                          "Withdrawn"
                        ) : c.unlockAt > Date.now() / 1000 ? (
                          "Locked"
                        ) : (
                          <button
                            className="market-button"
                            disabled={tx.pending}
                            onClick={() =>
                              void request<{ nonce: string }>(
                                `/v1/commitment/${c.id}`,
                              ).then((d) =>
                                tx.send({
                                  action: "unlock",
                                  mint: c.mint,
                                  nonce: d.nonce,
                                }),
                              )
                            }
                          >
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No funded commitments yet.</p>
            )}
          </section>
          <section className="analytics-panel">
            <h2>Create an additional lock</h2>
            <p>
              Creators can choose any future cliff for their own token. The
              beneficiary and unlock date cannot change. Ticket credit requires
              verified purchase cost and completed weeks.
            </p>
            <form onSubmit={submit} className="lock-form">
              <label className="field">
                Token mint
                <input
                  required
                  value={mint}
                  onChange={(e) => setMint(e.target.value)}
                  list="owned-mints"
                />
                <datalist id="owned-mints">
                  {query.data?.created.map((p) => (
                    <option key={p.mint} value={p.mint} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                Asset
                <select
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  <option value="token">Purchased tokens</option>
                  <option value="sol">Earned, unwithdrawn creator SOL</option>
                </select>
              </label>
              <label className="field">
                Amount
                <input
                  required
                  inputMode="decimal"
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
              <button className="market-primary" disabled={tx.pending}>
                Create irreversible lock
              </button>
            </form>
          </section>
        </>
      )}
      <TransactionNotice error={error || tx.error} signature={tx.signature} />
    </div>
  );
}
