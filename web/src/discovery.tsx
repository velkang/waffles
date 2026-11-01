import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CURVE_TOKENS,
  INITIAL_TOKENS,
  formatUnits,
  type Market,
} from "@waffles/shared/solana";
import { api } from "./api";
import { useWallet } from "./wallet";

type IconName = "arrow" | "search" | "lock" | "ticket" | "layers" | "info";
const iconPaths: Record<IconName, string> = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  search: "m16 16 4 4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3",
  ticket: "M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4ZM15 5v2m0 3v2m0 3v4",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  info: "M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
};

export function DiscoveryIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function useDiscoveryTime() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function remainingTime(end: number, now: number) {
  const minutes = Math.max(0, Math.ceil((end * 1000 - now) / 60_000));
  if (!minutes) return "Week closed";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days
    ? `${days}d ${hours}h remaining`
    : `${hours}h ${minutes % 60}m remaining`;
}

export function WeeklyRewardPreview({ now }: { now: number }) {
  const wallet = useWallet();
  const rewards = useQuery({
    queryKey: ["rewards", wallet.account?.address],
    queryFn: () => api.rewards(wallet.account?.address),
    refetchInterval: 30_000,
  });
  const data = rewards.data;
  const total = data
    ? data.user
      ? (
          BigInt(data.user.trading) +
          BigInt(data.user.holding) +
          BigInt(data.user.creator)
        ).toLocaleString("en")
      : "0"
    : null;
  return (
    <aside
      className={`discover-reward${wallet.account ? " has-wallet" : ""}`}
      aria-labelledby="reward-preview-title"
    >
      <div className="discover-reward-heading">
        <span className="discover-ticket-mark">
          <DiscoveryIcon name="ticket" />
        </span>
        <h2 id="reward-preview-title">This week’s raffle</h2>
        <Link to="/rewards" aria-label="View weekly rewards">
          <DiscoveryIcon name="arrow" />
        </Link>
      </div>
      {rewards.isError ? (
        <div className="discover-reward-unavailable">
          <p>Weekly pool unavailable.</p>
          <button type="button" onClick={() => void rewards.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="discover-pool">
            <span>{data ? formatUnits(data.poolSol) : "—"}</span>{" "}
            <span>SOL</span>
          </div>
          <div className="discover-reward-timing">
            <span>Current prize pool</span>
            <time
              dateTime={
                data ? new Date(data.end * 1000).toISOString() : undefined
              }
              title={
                data
                  ? `Week closes ${new Date(data.end * 1000).toLocaleString()}`
                  : undefined
              }
            >
              {data ? remainingTime(data.end, now) : "Loading week…"}
            </time>
          </div>
        </>
      )}
      <div className="discover-reward-bottom">
        <p>
          {wallet.account ? (
            rewards.isPending ? (
              "Loading your tickets…"
            ) : !rewards.isError && total !== null ? (
              <>
                <strong>{total}</strong> tickets so far this week
              </>
            ) : (
              "Your tickets are unavailable"
            )
          ) : (
            "Trade. Hold. Commit. Earn eligible tickets."
          )}
        </p>
        <Link to="/rewards">
          {wallet.account ? "Your rewards" : "View rewards"}{" "}
          <DiscoveryIcon name="arrow" />
        </Link>
      </div>
      <p className="discover-reward-disclosure">
        Fee-funded. Eligibility and pool minimums apply.
      </p>
    </aside>
  );
}

export function TokenPreview({ market, now }: { market: Market; now: number }) {
  const [failedImage, setFailedImage] = useState("");
  const progress =
    market.state !== "curve"
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            Number(
              ((INITIAL_TOKENS - BigInt(market.tokenReserve)) * 10000n) /
                CURVE_TOKENS,
            ) / 100,
          ),
        );
  const reserve = BigInt(market.tokenReserve);
  const cap =
    reserve > 0n
      ? formatUnits(
          (BigInt(market.solReserve) * BigInt(market.supply)) / reserve,
        )
      : "—";
  const activeAllocation =
    market.routing.locked > 0 && market.feeCliff * 1000 > now;
  const status =
    market.state === "pool"
      ? "Trading in pool"
      : market.state === "complete"
        ? "Graduation pending"
        : "Bonding curve";
  return (
    <Link
      to="/token/$mint"
      params={{ mint: market.mint }}
      className="discover-token"
    >
      <div className="discover-token-heading">
        <div className="discover-token-art">
          {market.imageUri && failedImage !== market.imageUri ? (
            <img
              src={market.imageUri}
              alt=""
              loading="lazy"
              width="64"
              height="64"
              onError={() => setFailedImage(market.imageUri)}
            />
          ) : (
            <span>{market.symbol.slice(0, 3)}</span>
          )}
        </div>
        <div className="discover-token-identity">
          <h3 title={market.name}>{market.name}</h3>
          <span title={market.symbol}>${market.symbol}</span>
          <span className="discover-token-address" title={market.mint}>
            {market.mint.slice(0, 5)}…{market.mint.slice(-5)}
          </span>
        </div>
        <span className="discover-open">
          <DiscoveryIcon name="arrow" />
        </span>
      </div>
      <dl className="discover-token-values">
        <div>
          <dt>
            Market cap <span>SOL</span>
          </dt>
          <dd>{cap}</dd>
        </div>
        <div>
          <dt>
            Total volume <span>SOL</span>
          </dt>
          <dd>{formatUnits(market.volumeSol)}</dd>
        </div>
      </dl>
      <div className="discover-curve">
        <div>
          <span>{status}</span>
          <strong>
            {market.state === "pool" ? "Graduated" : `${progress.toFixed(1)}%`}
          </strong>
        </div>
        <progress
          max="100"
          value={progress}
          aria-label={`${market.name} bonding curve progress`}
        />
      </div>
      <div
        className={`discover-commitment${activeAllocation ? " is-active" : ""}`}
      >
        <DiscoveryIcon name="lock" />
        <span>
          {activeAllocation
            ? `${market.routing.locked / 100}% of creator fees committed`
            : market.routing.locked > 0
              ? "Future fee commitment ended"
              : "Inspect creator commitments"}
        </span>
      </div>
      <div className="discover-token-footer">
        <span title={market.creator}>
          Creator {market.creator.slice(0, 4)}…{market.creator.slice(-4)}
        </span>
        <span>
          View market <DiscoveryIcon name="arrow" />
        </span>
      </div>
    </Link>
  );
}
