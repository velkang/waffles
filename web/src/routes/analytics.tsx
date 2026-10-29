import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, api } from "../api";
import { formatUnits } from "@waffles/shared/solana";
import { dateTime, AddressLink } from "../components";
export const Route = createFileRoute("/analytics")({ component: Analytics });
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
  const [range, setRange] = useState("7d");
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
  });
  return (
    <div className="market-page">
      <div className="market-heading">
        <div>
          <h1>Analytics</h1>
          <p>Finalized Waffles activity and protocol allocations.</p>
        </div>
        <div className="market-tabs">
          {["24h", "7d", "30d", "all"].map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All time" : r}
            </button>
          ))}
        </div>
      </div>
      {query.isError ? (
        <div className="market-empty" role="alert">
          <p>{query.error.message}</p>
          <button
            className="market-button"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <section className="analytics-panel">
          <h2>Market activity</h2>
          <dl className="analytics-fees">
            <div>
              <dt>Trading volume</dt>
              <dd>
                {query.data ? formatUnits(query.data.volumeSol) : "—"} SOL
              </dd>
            </div>
            <div>
              <dt>Allocated trading fees</dt>
              <dd>{query.data ? formatUnits(query.data.feesSol) : "—"} SOL</dd>
            </div>
            <div>
              <dt>Trading wallets</dt>
              <dd>{query.data?.wallets ?? "—"}</dd>
            </div>
            <div>
              <dt>Launches</dt>
              <dd>{query.data?.launches ?? "—"}</dd>
            </div>
            <div>
              <dt>Funded commitments</dt>
              <dd>{query.data?.commitments ?? "—"}</dd>
            </div>
          </dl>
          <p className="market-footnote">
            Wallets are addresses, not people. Volume includes buys and sells.
            Fee allocations are not platform withdrawals.{" "}
            {query.data && `Snapshot ${dateTime(query.data.asOf)}.`}
          </p>
        </section>
      )}
      <section className="analytics-panel">
        <h2>Buybacks and incentives</h2>
        {config.data && (
          <p>
            Incentives vault:{" "}
            <AddressLink address={config.data.incentivesVault} /> · Distribution
            authority:{" "}
            {balances.data?.distributionAuthority ? (
              <AddressLink address={balances.data?.distributionAuthority} />
            ) : (
              "Not configured"
            )}{" "}
            · Buyback authority:{" "}
            {balances.data?.buybackAuthority ? (
              <AddressLink address={balances.data?.buybackAuthority} />
            ) : (
              "Not configured"
            )}
          </p>
        )}
        <p>
          Unallocated incentives:{" "}
          {balances.data
            ? `${formatUnits(balances.data.incentivesSol)} SOL`
            : "Unavailable"}
          . Allocated claims are held separately.
        </p>
        {protocol.data?.actions.length ? (
          <div className="market-table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>Time</th>
                  <th>Burned tokens</th>
                  <th>Current allocation</th>
                </tr>
              </thead>
              <tbody>
                {protocol.data.actions.map((a) => (
                  <tr key={a.id}>
                    <td>{a.kind}</td>
                    <td>{formatUnits(a.amount)} SOL</td>
                    <td>{dateTime(a.time)}</td>
                    <td>
                      {a.kind === "buyback"
                        ? formatUnits(JSON.parse(a.data).tokens, 6)
                        : "—"}
                    </td>
                    <td>
                      {a.kind === "buyback" &&
                      a.mint &&
                      !JSON.parse(a.data).incentives ? (
                        <a href={`/token/${a.mint}`}>Funded balance</a>
                      ) : a.kind === "fund-move" ? (
                        <AddressLink address={JSON.parse(a.data).destination} />
                      ) : (
                        "Incentives vault above"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No protocol buybacks or incentives allocations indexed.</p>
        )}
      </section>
    </div>
  );
}
