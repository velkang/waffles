import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  formatUnits,
  INITIAL_TOKENS,
  CURVE_TOKENS,
} from "@waffles/shared/solana";
export const Route = createFileRoute("/")({ component: Explore });
function Explore() {
  const [sort, setSort] = useState("new"),
    [committed, setCommitted] = useState(false);
  const query = useQuery({
    queryKey: ["markets", sort, committed],
    queryFn: () => api.markets(sort, committed),
    refetchInterval: 30_000,
  });
  return (
    <div className="market-page">
      <div className="market-heading">
        <div>
          <h1>Explore</h1>
          <p>Find your next coin. Every market, in SOL.</p>
        </div>
        <Link to="/create" className="market-primary">
          Create a coin
        </Link>
      </div>
      <div className="market-toolbar">
        <div className="market-tabs" aria-label="Discover tokens">
          {[
            ["new", "New launches"],
            ["trending", "Trending · 1h"],
            ["graduating", "Near graduation"],
            ["graduated", "Graduated"],
            ["volume", "Total volume"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="commitment-filter">
          <input
            type="checkbox"
            checked={committed}
            onChange={(e) => setCommitted(e.target.checked)}
          />{" "}
          Active creator commitment
        </label>
      </div>
      <p className="market-caption">
        Finalized on-chain activity. Discovery updates every 30 seconds.
      </p>
      {query.isError ? (
        <div className="market-empty" role="alert">
          <h2>Markets couldn’t be loaded</h2>
          <p>{query.error.message}</p>
          <button
            className="market-button"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : query.isPending ? (
        <div className="market-empty" aria-busy="true">
          Loading markets…
        </div>
      ) : !query.data.launches.length ? (
        <div className="market-empty">
          <h2>No coins here yet</h2>
          <p>This view fills as devnet tokens launch and trade.</p>
          <Link to="/create" className="market-primary">
            Create a coin
          </Link>
        </div>
      ) : (
        <div className="token-grid">
          {query.data.launches.map((m) => {
            const progress =
              m.state !== "curve"
                ? 100
                : Number(
                    ((INITIAL_TOKENS - BigInt(m.tokenReserve)) * 10000n) /
                      CURVE_TOKENS,
                  ) / 100;
            return (
              <Link
                to="/token/$mint"
                params={{ mint: m.mint }}
                className="token-card"
                key={m.mint}
              >
                <div className="token-art">
                  {m.imageUri ? (
                    <img src={m.imageUri} alt="" loading="lazy" />
                  ) : (
                    <span className="token-image-fallback">
                      {m.symbol.slice(0, 3)}
                    </span>
                  )}
                  {m.state === "pool" && (
                    <span className="token-state">Graduated</span>
                  )}
                </div>
                <div className="token-card-body">
                  <div className="token-name">
                    <h2>{m.name}</h2>
                    <span>${m.symbol}</span>
                  </div>
                  <div className="token-value">
                    {formatUnits(
                      (BigInt(m.solReserve) * BigInt(m.supply)) /
                        BigInt(m.tokenReserve),
                    )}{" "}
                    SOL<span>market cap</span>
                  </div>
                  <div className="token-activity">
                    <span>
                      <strong>{formatUnits(m.volumeSol)}</strong> SOL volume
                    </span>
                    <span>
                      {m.routing.locked > 0 ? "Fee commitment" : "Open market"}
                    </span>
                  </div>
                  <div className="token-progress">
                    <label htmlFor={`progress-${m.mint}`}>
                      Curve progress · {progress.toFixed(1)}%
                    </label>
                    <progress
                      id={`progress-${m.mint}`}
                      max={100}
                      value={progress}
                    />
                  </div>
                  <div className="token-meta">
                    <span>
                      {m.creator.slice(0, 4)}…{m.creator.slice(-4)}
                    </span>
                    <span>
                      {m.state === "complete"
                        ? "Graduation pending"
                        : m.state === "pool"
                          ? "Trading in pool"
                          : "Bonding curve"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="market-footnote">
        Activity ranks are not quality ratings. Wallet counts represent
        addresses, not people.
      </p>
    </div>
  );
}
