import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  formatUnits,
  type Market,
  type Commitment,
} from "@waffles/shared/solana";
import { AddressLink, CreatorEarnings, dateTime } from "./components";

export interface PortfolioData {
  positions: { mint: string; balance: string }[];
  created: Market[];
  commitments: Commitment[];
}

export function commitmentStatus(commitment: Commitment, now: number) {
  return commitment.withdrawn
    ? "Withdrawn"
    : commitment.unlockAt > now
      ? "Locked"
      : "Ready to withdraw";
}

export function PortfolioDashboard({
  data,
  pending,
  onWithdraw,
  onClaim,
}: {
  data: PortfolioData;
  pending: boolean;
  onWithdraw: (commitment: Commitment) => void;
  onClaim: (market: Market, locked: boolean) => void;
}) {
  const [filter, setFilter] = useState("All");
  const now = Date.now() / 1000;
  const funded = data.commitments.filter(
    (c) => !c.withdrawn && BigInt(c.amount) > 0n,
  );
  const ready = funded.filter((c) => c.unlockAt <= now);
  const upcoming = funded
    .filter((c) => c.unlockAt > now)
    .sort((a, b) => a.unlockAt - b.unlockAt)[0];
  const markets = new Map(data.created.map((m) => [m.mint, m]));
  const visible = data.commitments.filter(
    (c) => filter === "All" || commitmentStatus(c, now) === filter,
  );
  return (
    <>
      <nav className="dashboard-shortcuts" aria-label="Portfolio sections">
        <a href="#holdings">
          Holdings <span>{data.positions.length}</span>
        </a>
        <a href="#creator-hub">
          Your launches <span>{data.created.length}</span>
        </a>
        <a href="#public-commitments">
          Commitments <span>{data.commitments.length}</span>
        </a>
        <Link to="/rewards">Your rewards</Link>
      </nav>
      <div className="portfolio-holdings-layout">
        <section className="analytics-panel portfolio-holdings" id="holdings">
          <div className="ux-panel-heading">
            <h2>Your coins</h2>
            <span className="ux-network-chip">Indexed holdings</span>
          </div>
          {data.positions.length ? (
            <ul className="holdings-list">
              {data.positions.map((p) => {
                const market = markets.get(p.mint);
                return (
                  <li key={p.mint}>
                    <div className="holding-identity">
                      <span className="coin-initial" aria-hidden="true">
                        {market?.symbol.slice(0, 2) || (
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="8" />
                            <path d="M9 8v8m6-8v8M8 10h8M8 14h8" />
                          </svg>
                        )}
                      </span>
                      <div>
                        {market && <strong>{market.name}</strong>}
                        <AddressLink address={p.mint} />
                      </div>
                    </div>
                    <div className="holding-balance">
                      <strong>{formatUnits(p.balance, 6, 6)}</strong>
                      <span>{market ? `$${market.symbol}` : "tokens"}</span>
                    </div>
                    <Link
                      className="holding-market"
                      to="/token/$mint"
                      params={{ mint: p.mint }}
                    >
                      Open market<span aria-hidden="true"> →</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="dashboard-empty">
              <h3>Your stack starts here.</h3>
              <p>No finalized holdings indexed for this wallet yet.</p>
              <Link className="market-button" to="/">
                Explore coins
              </Link>
            </div>
          )}
          <p className="ux-muted-note">
            Includes recognized vested beneficial ownership, which may be
            locked. These are indexed holdings, not spendable balances, and can
            lag wallet activity.
          </p>
        </section>
        <aside className="portfolio-unlock" aria-labelledby="unlock-title">
          <h2 id="unlock-title">On your plate</h2>
          <div className="unlock-count">
            <strong>{ready.length}</strong>
            <span>
              {ready.length === 1 ? "commitment ready" : "commitments ready"}
              <br />
              to withdraw
            </span>
          </div>
          {ready.length > 0 ? (
            <a
              className="market-button"
              href="#public-commitments"
              onClick={() => setFilter("Ready to withdraw")}
            >
              Review withdrawals
            </a>
          ) : (
            <p>
              Unlocks appear here when a funded commitment reaches its chosen
              date.
            </p>
          )}
          <div className="next-unlock">
            <span>Next scheduled unlock</span>
            <strong>
              {upcoming ? dateTime(upcoming.unlockAt) : "No upcoming unlocks"}
            </strong>
            {upcoming && <AddressLink address={upcoming.mint} />}
          </div>
          <p className="ux-muted-note">
            Creator fee earnings are listed separately below.
          </p>
        </aside>
      </div>
      <section className="analytics-panel creator-hub" id="creator-hub">
        <div className="ux-panel-heading">
          <div>
            <h2>Made by you</h2>
            <p className="dashboard-description">
              Your launches and funded creator earnings.
            </p>
          </div>
          <Link to="/create">Create a coin</Link>
        </div>
        {data.created.length ? (
          data.created.map((m) => (
            <article className="creator-launch" key={m.mint}>
              <div className="creator-launch-heading">
                <div>
                  <Link to="/token/$mint" params={{ mint: m.mint }}>
                    <strong>{m.name}</strong> <span>${m.symbol}</span>
                  </Link>
                  <AddressLink address={m.mint} />
                </div>
                <span className="ux-network-chip">
                  {m.state === "curve"
                    ? "Bonding curve"
                    : m.state === "pool"
                      ? "Graduated"
                      : "Curve complete"}
                </span>
              </div>
              <CreatorEarnings mint={m.mint} />
              <div className="button-row">
                <button
                  className="market-primary"
                  disabled={pending}
                  onClick={() => onClaim(m, false)}
                >
                  Claim direct earnings
                </button>
                {m.routing.locked > 0 && (
                  <button
                    className="market-button"
                    disabled={pending || m.feeCliff > now}
                    onClick={() => onClaim(m, true)}
                  >
                    Withdraw unlocked fee earnings
                  </button>
                )}
              </div>
              {m.routing.locked > 0 && m.feeCliff > now && (
                <p className="ux-muted-note">
                  Locked fee earnings unlock {dateTime(m.feeCliff)}.
                </p>
              )}
            </article>
          ))
        ) : (
          <div className="dashboard-empty">
            <h3>Something of your own?</h3>
            <p>
              No launches created by this wallet. When you launch a coin, its
              earnings and claim controls will live here.
            </p>
            <Link className="market-button" to="/create">
              Create your first coin
            </Link>
          </div>
        )}
      </section>
      <section
        className="analytics-panel commitments-panel"
        id="public-commitments"
      >
        <div className="ux-panel-heading">
          <div>
            <h2>Public commitments</h2>
            <p className="dashboard-description">
              Funded locks and their withdrawal status.
            </p>
          </div>
          <a href="#additional-lock">Add a lock</a>
        </div>
        {data.commitments.length > 0 && (
          <div
            className="market-tabs commitment-filters"
            role="group"
            aria-label="Filter commitments"
          >
            {["All", "Locked", "Ready to withdraw", "Withdrawn"].map(
              (value) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              ),
            )}
          </div>
        )}
        {visible.length ? (
          <div
            className="market-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Public commitments, scroll horizontally if needed"
          >
            <table className="market-table portfolio-commitment-table">
              <thead>
                <tr>
                  <th scope="col">Asset / market</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Unlock date</th>
                  <th scope="col">Status / action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const status = commitmentStatus(c, now);
                  return (
                    <tr key={c.id}>
                      <td data-label="Asset / market">
                        <strong>
                          {c.asset === "sol"
                            ? "SOL earnings"
                            : "Purchased tokens"}
                        </strong>
                        <AddressLink address={c.mint} />
                      </td>
                      <td data-label="Amount">
                        {formatUnits(c.amount, c.asset === "sol" ? 9 : 6)}{" "}
                        <span>{c.asset === "sol" ? "SOL" : "tokens"}</span>
                      </td>
                      <td data-label="Unlock date">{dateTime(c.unlockAt)}</td>
                      <td data-label="Status / action">
                        {status === "Ready to withdraw" ? (
                          <button
                            className="market-button"
                            disabled={pending}
                            onClick={() => onWithdraw(c)}
                          >
                            Withdraw
                          </button>
                        ) : (
                          <span
                            className={`commitment-status ${c.withdrawn ? "" : "is-locked"}`}
                          >
                            {status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-empty">
            <h3>
              {data.commitments.length
                ? "Nothing in this filter."
                : "No funded commitments yet."}
            </h3>
            <p>
              {data.commitments.length
                ? "Choose another status to see the rest of your commitments."
                : "Locks you fund will appear here with their amounts and unlock dates."}
            </p>
            {data.commitments.length > 0 && (
              <button
                className="market-button"
                onClick={() => setFilter("All")}
              >
                Show all commitments
              </button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
