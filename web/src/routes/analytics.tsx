import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, api } from "../api";
import { formatUnits } from "@waffles/shared/solana";
import { dateTime, AddressLink } from "../components";
import { protocolDetails } from "../analytics-data";
export const Route = createFileRoute("/analytics")({ component: Analytics });
const ranges = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};
function Analytics() {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const balances = useQuery({
    queryKey: ["protocol-balances"],
    queryFn: () =>
      request<{
        incentivesSol: string;
        distributionAuthority: string;
        buybackAuthority: string;
      }>("/v1/protocol/balances"),
    refetchInterval: 30_000,
    retry: false,
  });
  const [range, setRange] = useState<keyof typeof ranges>("7d");
  const query = useQuery({
    queryKey: ["analytics", range],
    queryFn: () =>
      request<{
        asOf: number;
        volumeSol: string;
        feesSol: string;
        wallets: number;
        launches: number;
        commitments: number;
      }>(`/v1/analytics?range=${range}`),
    refetchInterval: 60_000,
  });
  const protocol = useQuery({
    queryKey: ["protocol-actions"],
    queryFn: () =>
      request<{
        actions: {
          id: string;
          kind: string;
          mint: string | null;
          amount: string;
          time: number;
          data: string;
        }[];
      }>("/v1/protocol/actions"),
    refetchInterval: 60_000,
  });
  return (
    <div className="market-page analytics-page">
      <div className="market-heading dashboard-heading">
        <div>
          <h1>Waffles, by the numbers.</h1>
          <p>Finalized Waffles activity and protocol allocations.</p>
        </div>
        <img
          className="dashboard-mascot"
          src="/art/waffle-mascot-cartoon.png"
          width="116"
          height="116"
          alt=""
        />
      </div>
      <section
        className="analytics-panel activity-panel"
        aria-labelledby="activity-title"
      >
        <div className="activity-toolbar">
          <h2 id="activity-title">Market activity</h2>
          <div
            className="market-tabs"
            role="group"
            aria-label="Market activity period"
          >
            {(Object.keys(ranges) as (keyof typeof ranges)[]).map((r) => (
              <button
                key={r}
                aria-label={ranges[r]}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {r === "all" ? "All time" : r}
              </button>
            ))}
          </div>
        </div>
        <div className="activity-period">
          <strong>{ranges[range]}</strong>
          <span role="status">
            {query.isPending
              ? "Loading finalized activity…"
              : query.isFetching
                ? "Refreshing snapshot…"
                : query.data
                  ? `Snapshot ${dateTime(query.data.asOf)}`
                  : "Snapshot unavailable"}
          </span>
        </div>
        {query.isError && (
          <div className="dashboard-message" role="alert">
            <strong>Activity couldn’t refresh.</strong>
            <p>{query.error.message}</p>
            <button
              className="market-button"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
            {query.data && (
              <p>Showing the last loaded snapshot for this period.</p>
            )}
          </div>
        )}
        <div aria-busy={query.isPending} className="activity-totals">
          <dl>
            <div>
              <dt>Trading volume</dt>
              <dd>
                {query.data ? formatUnits(query.data.volumeSol) : "—"}
                <span>SOL</span>
              </dd>
              <dd className="activity-metric-note">
                Buys and sells in this period
              </dd>
            </div>
            <div>
              <dt>Allocated trading fees</dt>
              <dd>
                {query.data ? formatUnits(query.data.feesSol) : "—"}
                <span>SOL</span>
              </dd>
              <dd className="activity-metric-note">
                Fee allocations, not platform withdrawals
              </dd>
            </div>
          </dl>
        </div>
        <dl className="activity-counts">
          <div>
            <dt>Trading wallets</dt>
            <dd>{query.data?.wallets.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>Launches</dt>
            <dd>{query.data?.launches.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>Funded commitments</dt>
            <dd>{query.data?.commitments.toLocaleString() ?? "—"}</dd>
          </div>
        </dl>
        {query.data &&
          query.data.volumeSol === "0" &&
          query.data.launches === 0 &&
          query.data.commitments === 0 && (
            <p className="activity-zero">
              No finalized market activity in this period yet. Try a wider
              period or <Link to="/">explore the launchpad</Link>.
            </p>
          )}
        <p className="ux-muted-note">
          Wallets are addresses, not people. Indexed data may lag recent
          transactions.
        </p>
      </section>
      <div className="analytics-allocation-layout">
        <section
          className="analytics-panel fee-allocation"
          aria-labelledby="fee-allocation-title"
        >
          <h2 id="fee-allocation-title">Where the trading fees go.</h2>
          <p>Every trading fee is split across three destinations.</p>
          <div className="fee-split-bar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <dl className="fee-split-list">
            <div>
              <dt>
                <i className="split-creator" />
                Creator share
              </dt>
              <dd>40%</dd>
            </div>
            <div>
              <dt>
                <i className="split-raffle" />
                Weekly raffle
              </dt>
              <dd>20%</dd>
            </div>
            <div>
              <dt>
                <i className="split-platform" />
                Platform share
              </dt>
              <dd>40%</dd>
            </div>
          </dl>
          <p className="ux-muted-note">
            Creators choose how their share is routed. Buy fees start at 40% and
            decline to 1% in the first 60 seconds to discourage sniper bots. The
            fee split above applies to the fee collected.
          </p>
          <Link className="dashboard-text-link" to="/rewards">
            See weekly rewards <span aria-hidden="true">→</span>
          </Link>
        </section>
        <section
          className="analytics-panel incentives-panel"
          aria-labelledby="incentives-title"
        >
          <div className="ux-panel-heading">
            <h2 id="incentives-title">Incentives in the pantry.</h2>
            <span className="ux-network-chip">Current balance</span>
          </div>
          <dl className="incentives-balance">
            <dt>Unallocated incentives</dt>
            <dd>
              {balances.data ? formatUnits(balances.data.incentivesSol) : "—"}{" "}
              <span>SOL</span>
            </dd>
          </dl>
          <p>
            Allocated claims are held separately. This balance is independent of
            the activity period above.
          </p>
          {balances.isPending ? (
            <p role="status">Loading the incentives balance…</p>
          ) : balances.isError ? (
            <div className="dashboard-message" role="alert">
              <p>
                {balances.data
                  ? "Balance refresh failed. Showing the last loaded amount."
                  : "The incentives balance is unavailable."}
              </p>
              <button
                className="market-button"
                onClick={() => void balances.refetch()}
              >
                Retry balance
              </button>
            </div>
          ) : null}
          <details className="protocol-addresses">
            <summary>Vault &amp; operator addresses</summary>
            <dl>
              <div>
                <dt>Incentives vault</dt>
                <dd>
                  {config.data ? (
                    <AddressLink address={config.data.incentivesVault} />
                  ) : config.isError ? (
                    <button
                      className="dashboard-inline-button"
                      onClick={() => void config.refetch()}
                    >
                      Retry vault address
                    </button>
                  ) : (
                    "Loading…"
                  )}
                </dd>
              </div>
              <div>
                <dt>Distribution authority</dt>
                <dd>
                  {balances.data ? (
                    balances.data.distributionAuthority ? (
                      <AddressLink
                        address={balances.data.distributionAuthority}
                      />
                    ) : (
                      "Not configured"
                    )
                  ) : balances.isPending ? (
                    "Loading…"
                  ) : (
                    "Unavailable"
                  )}
                </dd>
              </div>
              <div>
                <dt>Buyback authority</dt>
                <dd>
                  {balances.data ? (
                    balances.data.buybackAuthority ? (
                      <AddressLink address={balances.data.buybackAuthority} />
                    ) : (
                      "Not configured"
                    )
                  ) : balances.isPending ? (
                    "Loading…"
                  ) : (
                    "Unavailable"
                  )}
                </dd>
              </div>
            </dl>
          </details>
        </section>
      </div>
      <section
        className="analytics-panel protocol-history"
        aria-labelledby="protocol-history-title"
      >
        <div className="ux-panel-heading">
          <div>
            <h2 id="protocol-history-title">
              Buybacks &amp; incentives activity
            </h2>
            <p className="dashboard-description">
              Latest indexed protocol actions · up to 100 · all time
            </p>
          </div>
          <button
            className="market-button"
            disabled={protocol.isFetching}
            onClick={() => void protocol.refetch()}
          >
            {protocol.isFetching ? "Refreshing…" : "Refresh activity"}
          </button>
        </div>
        {protocol.isError && (
          <div className="dashboard-message" role="alert">
            <p>
              {protocol.data
                ? "Latest actions could not refresh. Showing the last loaded entries."
                : "Protocol actions couldn’t load."}
            </p>
            <button
              className="market-button"
              onClick={() => void protocol.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {protocol.isPending ? (
          <div className="dashboard-loading" role="status">
            <p>Loading finalized protocol actions…</p>
            <div className="loading-lines" aria-hidden="true">
              <span />
              <span />
            </div>
          </div>
        ) : protocol.data?.actions.length ? (
          <div
            className="market-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Protocol actions, scroll horizontally for all columns"
          >
            <table className="market-table protocol-table">
              <thead>
                <tr>
                  <th scope="col">Action / time</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Burned tokens</th>
                  <th scope="col">Current allocation</th>
                </tr>
              </thead>
              <tbody>
                {protocol.data.actions.map((a) => {
                  const details = protocolDetails(a.data);
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>
                          {a.kind === "buyback"
                            ? "Buyback & burn"
                            : a.kind === "fund-move"
                              ? "Incentives transfer"
                              : a.kind}
                        </strong>
                        <time dateTime={new Date(a.time * 1000).toISOString()}>
                          {dateTime(a.time)}
                        </time>
                      </td>
                      <td>{formatUnits(a.amount)} SOL</td>
                      <td>
                        {a.kind === "buyback"
                          ? details?.tokens
                            ? formatUnits(details.tokens, 6)
                            : "Unavailable"
                          : "—"}
                      </td>
                      <td>
                        {a.kind === "buyback" &&
                        a.mint &&
                        details?.incentives === false ? (
                          <Link to="/token/$mint" params={{ mint: a.mint }}>
                            Funded balance
                          </Link>
                        ) : a.kind === "fund-move" ? (
                          details?.destination ? (
                            <AddressLink address={details.destination} />
                          ) : (
                            "Unavailable"
                          )
                        ) : details?.incentives === true ? (
                          "Incentives vault"
                        ) : (
                          "Unavailable"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : protocol.data ? (
          <div className="dashboard-empty">
            <svg
              className="empty-pan-icon"
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <rect x="7" y="12" width="28" height="25" rx="8" />
              <path d="M35 20h8v9h-8M16 17v15M25 17v15M12 21h18M12 28h18" />
            </svg>
            <h3>Nothing on the griddle yet.</h3>
            <p>
              No protocol buybacks or incentives allocations indexed. Finalized
              actions will appear here when available.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
