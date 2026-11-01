import { Link } from "@tanstack/react-router";

export function WaffleMark() {
  return (
    <svg
      className="waffle-mark"
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="32"
        height="32"
        rx="10"
        fill="#ffc65b"
        stroke="#633a21"
        strokeWidth="2.4"
      />
      <path
        d="M14 8v24M25 8v24M8 14h24M8 25h24"
        stroke="#b96927"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="14"
        width="11"
        height="11"
        rx="2"
        fill="#ffe998"
        stroke="#b96927"
        strokeWidth="2"
      />
    </svg>
  );
}

export function WalletWelcome() {
  return (
    <section
      className="wallet-welcome"
      aria-labelledby="portfolio-welcome-title"
    >
      <div className="wallet-welcome-art">
        <img
          src="/art/waffle-mascot-cartoon.png"
          alt="A cheerful waffle character waving hello"
          width="260"
          height="260"
        />
      </div>
      <div className="wallet-welcome-copy">
        <h1 id="portfolio-welcome-title">
          Your own little
          <br />
          <span>stack of Waffles.</span>
        </h1>
        <p>
          Your coins, creator earnings, and commitments, all in one place.
          Connect your Solana devnet wallet to see what’s cooking.
        </p>
        <button
          className="market-primary"
          type="button"
          onClick={() =>
            window.dispatchEvent(new Event("waffles:connect-wallet"))
          }
        >
          Connect wallet
        </button>
        <Link className="wallet-explore-link" to="/">
          Explore coins first
        </Link>
        <p className="wallet-welcome-note">Solana devnet · Test tokens only</p>
      </div>
    </section>
  );
}
