import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, request } from "../api";
import { TICKET_CAP, formatUnits } from "@waffles/shared/solana";
import { unhex } from "@waffles/shared/rewards";
import { useWallet } from "../wallet";
import { useDiscoveryTime, DiscoveryIcon } from "../discovery";
import { weekRemaining } from "../ux";
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
  const now = useDiscoveryTime();
  const user = current.data?.user;
  const total = current.data
    ? BigInt(user?.trading ?? "0") +
      BigInt(user?.holding ?? "0") +
      BigInt(user?.creator ?? "0")
    : null;
  const unclaimed = claims.data?.claims.filter((claim) => !claim.claimed);
  const claimable = unclaimed?.reduce(
    (sum, claim) => sum + BigInt(claim.amount),
    0n,
  );
  return (
    <div className="market-page rewards-page">
      <div className="market-heading">
        <div>
          <h1>A little extra on top.</h1>
          <p>
            Your weekly Waffle rewards. Trade, hold, or commit to earn eligible
            tickets.
          </p>
        </div>
        <img
          className="rewards-mascot"
          src="/art/waffle-mascot-cartoon.png"
          alt=""
          width="112"
          height="112"
        />
      </div>
      <nav className="reward-shortcuts" aria-label="Rewards sections">
        <a href="#your-tickets-title">Your tickets</a>
        <a href="#reward-claims">Claim prizes</a>
        <a href="#draw-evidence">Past draws & proof</a>
      </nav>
      <div className={`reward-overview${wallet.account ? " has-wallet" : ""}`}>
        <section
          className="analytics-panel reward-pool-panel"
          aria-labelledby="weekly-pool-title"
        >
          <div className="ux-panel-heading">
            <h2 id="weekly-pool-title">This week’s raffle</h2>
            <span className="ux-network-chip">SOL · Devnet</span>
          </div>
          {current.isError ? (
            <div role="alert">
              <p>The weekly pool couldn’t be loaded.</p>
              <button
                className="market-button"
                onClick={() => void current.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="reward-pool-amount">
                {current.data ? formatUnits(current.data.poolSol) : "—"}
                <span>SOL in the pool</span>
              </div>
              <div className="reward-clock">
                <div>
                  <span>Week closes in</span>
                  <strong>
                    {current.data
                      ? weekRemaining(current.data.end, now)
                      : "Loading…"}
                  </strong>
                </div>
                <div>
                  <span>Weekly cutoff</span>
                  <strong>
                    {current.data ? dateTime(current.data.end) : "—"}
                  </strong>
                </div>
              </div>
              <p className="reward-pool-rule">
                20% of trading fees fund the pool. A raffle requires a pool of
                at least $1,000; otherwise the SOL goes to the incentives vault
                and tickets expire.
              </p>
              <details className="reward-prize-details">
                <summary>Prize structure & estimates</summary>
                <p>
                  Estimated winning tickets:{" "}
                  <strong>
                    {current.isPending
                      ? "Loading…"
                      : (current.data?.winningTickets ?? "Awaiting price")}
                  </strong>
                  . Approximately $1,000 per winning ticket, paid in SOL. One
                  wallet can hold several winning tickets. Dollar value may
                  change after the cutoff.
                </p>
              </details>
            </>
          )}
        </section>
        <section
          className="analytics-panel reward-tickets-panel"
          aria-labelledby="your-tickets-title"
        >
          <div className="ux-panel-heading">
            <h2 id="your-tickets-title">Your tickets</h2>
            <DiscoveryIcon name="ticket" />
          </div>
          <div className="reward-ticket-total">
            {wallet.account
              ? current.isError
                ? "Unavailable"
                : total === null
                  ? "—"
                  : total.toLocaleString("en")
              : "Join the weekly mix."}
            {wallet.account && <span>tickets so far this week</span>}
          </div>
          {!wallet.account && (
            <button
              className="market-primary"
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event("waffles:connect-wallet"))
              }
            >
              Connect wallet
            </button>
          )}
          <dl className="ticket-categories">
            {(["trading", "holding", "creator"] as const).map((kind) => (
              <div key={kind}>
                <dt>
                  {
                    {
                      trading: "Trading",
                      holding: "First-day holding",
                      creator: "Creator locks",
                    }[kind]
                  }
                </dt>
                <dd>
                  {wallet.account && !current.isError && current.data
                    ? (user?.[kind] ?? "0")
                    : "—"}
                  <span> / {TICKET_CAP.toLocaleString("en")}</span>
                </dd>
                {wallet.account && !current.isError && current.data ? (
                  <progress
                    max={Number(TICKET_CAP)}
                    value={Number(user?.[kind] ?? "0")}
                    aria-label={`${kind} tickets toward weekly cap`}
                  />
                ) : (
                  <div className="ticket-track" aria-hidden="true" />
                )}
              </div>
            ))}
          </dl>
          <p className="ux-muted-note">
            Holding tickets appear after the 24-hour checkpoint. Creator tickets
            require each funded deposit to complete a full week. Totals remain
            provisional until settlement.
          </p>
          {Boolean(current.data?.missingPrices) && (
            <p role="status" className="launch-warning">
              {current.data!.missingPrices} trades are awaiting historical
              prices. Ticket totals remain provisional.
            </p>
          )}
        </section>
      </div>
      <section id="reward-claims" className="analytics-panel reward-claims">
        <div className="ux-panel-heading">
          <h2>Ready to claim</h2>
          {wallet.account && (
            <span className="claimable-total">
              {claims.isError
                ? "Unavailable"
                : claimable === undefined
                  ? "Loading…"
                  : `${formatUnits(claimable)} SOL`}
            </span>
          )}
        </div>
        {!wallet.account ? (
          <p>Connect your wallet to check for prizes and distributions.</p>
        ) : claims.isPending ? (
          <div className="ux-inline-loading" role="status">
            Checking your claimable rewards…
          </div>
        ) : claims.isError ? (
          <div role="alert">
            <p>Claims couldn’t be loaded.</p>
            <button
              className="market-button"
              onClick={() => void claims.refetch()}
            >
              Retry claims
            </button>
          </div>
        ) : unclaimed?.length ? (
          unclaimed.map((claim) => (
            <div className="claim-row" key={claim.id}>
              <span>
                <strong>
                  {claim.kind === "raffle"
                    ? "Raffle prize"
                    : claim.kind === "holders"
                      ? "Holder distribution"
                      : "Protocol reward"}
                </strong>{" "}
                · Week {claim.epoch}
              </span>
              <button
                className="market-primary"
                disabled={tx.pending}
                onClick={() =>
                  void tx
                    .send({
                      action: "claim",
                      distribution: claim.distribution,
                      amount: claim.amount,
                      proof: claim.proof.map((proof) =>
                        Array.from(unhex(proof)),
                      ),
                    })
                    .then(() => void claims.refetch())
                }
              >
                {tx.pending
                  ? tx.label
                  : `Claim ${formatUnits(claim.amount)} SOL`}
              </button>
            </div>
          ))
        ) : (
          <p>
            No finalized rewards are waiting to be claimed. Published draws and
            evidence appear below.
          </p>
        )}
        <TransactionNotice
          error={tx.error}
          signature={tx.signature}
          phase={tx.phase}
        />
      </section>
      <section className="analytics-panel">
        <h2>How tickets are earned</h2>
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
        <h2 id="draw-evidence">Published distributions</h2>
        {distributions.isPending ? (
          <p role="status">Loading published distributions…</p>
        ) : distributions.isError ? (
          <p role="alert">
            Published distributions are unavailable.{" "}
            <button
              className="market-button"
              onClick={() => void distributions.refetch()}
            >
              Retry
            </button>
          </p>
        ) : distributions.data?.distributions.length ? (
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
          {history.isPending && <p role="status">Loading previous weeks…</p>}
          {history.isError && (
            <p role="alert">Previous weeks could not be loaded.</p>
          )}
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
