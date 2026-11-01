import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import {
  DiscoveryIcon,
  TokenPreview,
  WeeklyRewardPreview,
  useDiscoveryTime,
} from "../discovery";
import "../discovery.css";

export const Route = createFileRoute("/")({ component: Explore });

const views = [
  ["new", "New launches"],
  ["trending", "Trending · 1h"],
  ["graduating", "Near graduation"],
  ["graduated", "Graduated"],
  ["volume", "Total volume"],
] as const;

function Explore() {
  const [sort, setSort] = useState("new");
  const [committed, setCommitted] = useState(false);
  const [search, setSearch] = useState("");
  const now = useDiscoveryTime();
  const query = useQuery({
    queryKey: ["markets", sort, committed],
    queryFn: () => api.markets(sort, committed),
    refetchInterval: 30_000,
  });
  const term = search.trim().toLowerCase();
  const markets =
    query.data?.launches.filter((market) =>
      [market.name, market.symbol, market.mint].some((value) =>
        value.toLowerCase().includes(term),
      ),
    ) ?? [];

  return (
    <div className="discover-page">
      <section className="discover-intro" aria-labelledby="explore-title">
        <div className="discover-welcome">
          <h1 id="explore-title">
            <span className="waffle-heading-long">
              Fresh out of
              <br />
              <span>the waffle iron.</span>
            </span>
            <span className="waffle-heading-compact">
              Fresh off
              <br />
              <span>the iron.</span>
            </span>
          </h1>
          <p>
            Discover Solana launches, inspect creator commitments, and earn
            entries into weekly raffles through eligible activity.
          </p>
          <div className="discover-intro-actions">
            <Link to="/create" className="market-primary">
              Launch a coin <DiscoveryIcon name="arrow" />
            </Link>
            <Link to="/rewards" className="discover-text-link">
              How rewards work <DiscoveryIcon name="arrow" />
            </Link>
          </div>
          <p className="discover-network-note">
            <DiscoveryIcon name="layers" /> Your trades stay on Waffles. From
            bonding curve to pool.
          </p>
        </div>
        <div className="waffle-hero-art">
          <img
            src="/art/waffle-mascot-cartoon.png"
            alt="A happy golden waffle mascot waving"
            width="360"
            height="360"
            fetchPriority="high"
          />
          <span className="waffle-art-caption">
            A little meme. A lot of personality.
          </span>
        </div>
        <WeeklyRewardPreview now={now} />
      </section>

      <section className="discover-markets" aria-labelledby="markets-title">
        <div className="discover-section-heading">
          <div className="discover-title-row">
            <h2 id="markets-title">What’s cooking?</h2>
            <span className="discover-update">
              <span aria-hidden="true" /> Updates every 30s
            </span>
          </div>
          <label className="discover-search">
            <DiscoveryIcon name="search" />
            <span className="discover-sr-only">Search tokens in this view</span>
            <input
              type="search"
              placeholder="Search this view…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="discover-controls">
          <div className="discover-tabs" role="group" aria-label="Market view">
            {views.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={sort === id}
                onClick={() => setSort(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label
            className={`discover-filter${committed ? " is-selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={committed}
              onChange={(event) => setCommitted(event.target.checked)}
            />
            <DiscoveryIcon name="lock" /> Active commitments
          </label>
        </div>
        <div className="discover-results-meta" role="status" aria-live="polite">
          <span>
            {query.isPending
              ? "Loading markets…"
              : query.isError
                ? "Market data unavailable"
                : `${markets.length} ${markets.length === 1 ? "market" : "markets"}${term ? " matching your search" : " in this view"}`}
          </span>
          <span>All values in SOL · Finalized activity</span>
        </div>

        {query.isError ? (
          <div className="discover-empty" role="alert">
            <DiscoveryIcon name="layers" />
            <h3>Markets couldn’t be loaded</h3>
            <p>We couldn’t reach the latest market data. Please try again.</p>
            <button
              className="market-primary"
              type="button"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </div>
        ) : query.isPending ? (
          <div
            className="discover-grid"
            aria-busy="true"
            aria-label="Loading markets"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <div className="discover-skeleton" key={index} aria-hidden="true">
                <div />
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : !markets.length ? (
          <div className="discover-empty">
            <DiscoveryIcon name={term ? "search" : "layers"} />
            <h3>
              {term
                ? "No matching tokens in this view"
                : committed
                  ? "No active commitments in this view"
                  : "No markets in this view yet"}
            </h3>
            <p>
              {term
                ? "Try a token name, ticker, or mint address, or choose another market view."
                : committed
                  ? "Try another view or remove the filter to discover more launches."
                  : "Try another market view, or return when more devnet activity has finalized."}
            </p>
            {term || committed ? (
              <button
                className="market-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  setCommitted(false);
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link to="/create" className="market-primary">
                Launch a coin <DiscoveryIcon name="arrow" />
              </Link>
            )}
          </div>
        ) : (
          <div className="discover-grid">
            {markets.map((market) => (
              <TokenPreview key={market.mint} market={market} now={now} />
            ))}
          </div>
        )}
        <div className="discover-market-note">
          <DiscoveryIcon name="info" />
          <p>
            Commitments show what a creator has committed. They don’t guarantee
            a token’s value. Activity rankings are not quality ratings.
          </p>
        </div>
      </section>

      <section
        className="discover-explainer"
        aria-label="Participating in Waffles"
      >
        <div>
          <DiscoveryIcon name="layers" />
          <p>
            <strong>Discover & trade</strong>
            <span>New launches and graduated pools, in one place.</span>
          </p>
        </div>
        <div>
          <DiscoveryIcon name="lock" />
          <p>
            <strong>Look closer</strong>
            <span>Inspect funded locks and future fee commitments.</span>
          </p>
        </div>
        <Link to="/rewards">
          <DiscoveryIcon name="ticket" />
          <p>
            <strong>Make participation count</strong>
            <span>Explore trading, holding, and creator tickets.</span>
          </p>
          <DiscoveryIcon name="arrow" />
        </Link>
      </section>
    </div>
  );
}
