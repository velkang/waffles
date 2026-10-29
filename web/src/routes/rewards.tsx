import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, request } from "../api";
import { formatUnits } from "@waffles/shared/solana";
import { unhex } from "@waffles/shared/rewards";
import { useWallet } from "../wallet";
import { useTransaction } from "../transaction";
import { dateTime, AddressLink, TransactionNotice } from "../components";
export const Route = createFileRoute("/rewards")({ component: Rewards });
function Rewards() {
  const wallet = useWallet(),
    tx = useTransaction();
  const current = useQuery({
    queryKey: ["rewards", wallet.account?.address],
    queryFn: () => api.rewards(wallet.account?.address),
    refetchInterval: 30_000,
  });
  const claims = useQuery({
    queryKey: ["claims", wallet.account?.address],
    refetchInterval: 30_000,
    queryFn: () => api.claims(wallet.account!.address),
    enabled: Boolean(wallet.account),
  });
  const history = useQuery({
    queryKey: ["epochs"],
    queryFn: () =>
      request<{
        epochs: {
          epoch: number;
          status: string;
          pool_sol: string;
          snapshot_key: string | null;
          data: string | null;
        }[];
      }>("/v1/rewards/epochs"),
  });
  const distributions = useQuery({
    queryKey: ["distributions"],
    queryFn: () =>
      request<{
        distributions: {
          id: string;
          kind: string;
          epoch: number;
          amount: string;
          status: string;
          snapshot_key: string;
        }[];
      }>("/v1/distributions"),
  });
  return (
    <div className="market-page">
      <div className="market-heading">
        <div>
          <h1>Weekly rewards</h1>
          <p>
            Trade, hold, or commit. Each activity earns tickets differently.
          </p>
        </div>
      </div>
      {current.isError ? (
        <div className="market-empty" role="alert">
          <h2>Rewards unavailable</h2>
          <p>{current.error.message}</p>
          <button
            className="market-button"
            onClick={() => void current.refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <section className="analytics-panel">
          <div className="reward-summary">
            <div>
              <h2>Current raffle pool</h2>
              <strong>
                {current.data ? formatUnits(current.data.poolSol) : "—"} SOL
              </strong>
            </div>
            <div>
              <h2>Estimated winning tickets</h2>
              <strong>
                {current.data?.winningTickets ?? "Awaiting price"}
              </strong>
            </div>
            <div>
              <h2>Week closes</h2>
              <p>{current.data ? dateTime(current.data.end) : "Loading…"}</p>
            </div>
          </div>
          <p>
            Approximately $1,000 per winning ticket, paid in SOL. One wallet can
            hold several winning tickets. Dollar value may change after the
            cutoff.
          </p>
          {current.data?.missingPrices ? (
            <p role="status">
              {current.data.missingPrices} trades are awaiting historical
              prices. Ticket totals remain provisional.
            </p>
          ) : null}
        </section>
      )}
      <section className="analytics-panel">
        <h2>Your tickets</h2>
        {wallet.account ? (
          <dl className="analytics-fees">
            {(["trading", "holding", "creator"] as const).map((kind) => (
              <div key={kind}>
                <dt>
                  {kind === "trading"
                    ? "Trading"
                    : kind === "holding"
                      ? "First-day holding"
                      : "Creator locks"}
                </dt>
                <dd>{current.data?.user?.[kind] ?? "0"} / 1,000</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Connect a wallet to see your ticket totals and claims.</p>
        )}
        <p>
          Holding bonuses appear after the launch’s 24-hour checkpoint. Creator
          tickets require each funded deposit to complete a full week.
        </p>
      </section>
      <section className="analytics-panel">
        <h2>Ready to claim</h2>
        {claims.isError ? (
          <p role="alert">Claims could not be loaded.</p>
        ) : claims.data?.claims.some((c) => !c.claimed) ? (
          claims.data.claims
            .filter((c) => !c.claimed)
            .map((c) => (
              <div className="claim-row" key={c.id}>
                <span>
                  {c.kind === "raffle"
                    ? "Raffle prize"
                    : c.kind === "holders"
                      ? "Holder distribution"
                      : "Protocol reward"}{" "}
                  · Week {c.epoch}
                </span>
                <button
                  className="market-primary"
                  disabled={tx.pending}
                  onClick={() =>
                    void tx
                      .send({
                        action: "claim",
                        distribution: c.distribution,
                        amount: c.amount,
                        proof: c.proof.map((p) => Array.from(unhex(p))),
                      })
                      .then(() => void claims.refetch())
                  }
                >
                  Claim {formatUnits(c.amount)} SOL
                </button>
              </div>
            ))
        ) : (
          <p>No finalized, unclaimed distributions for this wallet.</p>
        )}
        <TransactionNotice error={tx.error} signature={tx.signature} />
      </section>
      <section className="analytics-panel">
        <h2>How tickets work</h2>
        <table className="market-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>One ticket</th>
              <th>Weekly cap</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Trading</td>
              <td>$1,000 eligible gross volume, valued at trade time</td>
              <td>1,000</td>
            </tr>
            <tr>
              <td>First-day holding</td>
              <td>
                1 SOL purchase cost held for a full launch day; partial time is
                weighted
              </td>
              <td>1,000</td>
            </tr>
            <tr>
              <td>Creator commitments</td>
              <td>1 SOL eligible principal for one completed locked week</td>
              <td>1,000</td>
            </tr>
          </tbody>
        </table>
        <p className="launch-warning">
          If the weekly pool is below $1,000, no raffle takes place. Its SOL
          goes to the Waffles incentives vault and tickets expire. This rule
          applies to every participant.
        </p>
        <p>
          Creators’ own-market trading and holding, same-transaction round
          trips, and protocol buybacks do not earn tickets. Wallet caps do not
          identify individual people.
        </p>
      </section>
      <section className="analytics-panel">
        <h2>Ticket leaderboard</h2>
        {current.data?.leaderboard.length ? (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Trading</th>
                  <th>Holding</th>
                  <th>Creator</th>
                </tr>
              </thead>
              <tbody>
                {current.data.leaderboard.map((r) => (
                  <tr key={r.wallet}>
                    <td>
                      <AddressLink address={r.wallet} />
                    </td>
                    <td>{r.trading}</td>
                    <td>{r.holding}</td>
                    <td>{r.creator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Eligible finalized activity will appear here.</p>
        )}
      </section>
      <section className="analytics-panel">
        <h2>Published distributions</h2>
        {distributions.data?.distributions.length ? (
          <table className="market-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Type</th>
                <th>Pool</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {distributions.data.distributions.map((d) => (
                <tr key={d.id}>
                  <td>{d.epoch}</td>
                  <td>{d.kind}</td>
                  <td>{formatUnits(d.amount)} SOL</td>
                  <td>{d.status}</td>
                  <td>
                    <a
                      href={`/v1/assets/${d.snapshot_key}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Snapshot and proofs
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No distributions published yet.</p>
        )}
        <details>
          <summary>Weekly raffle history</summary>
          {history.data?.epochs.map((e) => (
            <p key={e.epoch}>
              Week {e.epoch} · {e.status} · {formatUnits(e.pool_sol)} SOL{" "}
              {e.snapshot_key && (
                <a href={`/v1/assets/${e.snapshot_key}`}>Snapshot</a>
              )}
            </p>
          ))}
        </details>
        <p className="market-footnote">
          The operator calculates eligibility and winners. Frozen snapshots,
          future Drand randomness, and proofs make published draws replayable;
          the program enforces funding and claims.
        </p>
      </section>
    </div>
  );
}
