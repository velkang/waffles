# waffles.meme

A Solana devnet launchpad built around visible creator commitments, measured
holding behavior, configurable creator earnings, and weekly fee-funded rewards.

Tokens trade in SOL on Waffles' bonding curve and graduate into its permanent
pool. Creators publish their earnings allocations and funded token/fee locks.
Weekly raffle prize counts vary with the funded pool; there is no 20-winner cap.

**Status:** The program is deployed and initialized on public Solana devnet.
Contracts are unaudited. Cloudflare deployment and deployed-pilot acceptance
checks remain outstanding; mainnet and real-funds readiness are separate.

## Workspace

| Directory | Purpose |
| --- | --- |
| `web/` | React, Vite, TanStack Router/Query, Tailwind, and Static Assets Worker |
| `api/` | Hono API, D1 migrations, R2 uploads, and live-update Durable Object |
| `jobs/` | Finalized ingestion, Queues, coordination, Workflows, and scheduled operations |
| `shared/` | Solana transaction client, IDL, integer accounting, and reward calculations |
| `solana/` | Rust/Anchor program and tests |

## Development

Use Node 22+, pnpm 10.15.1, Rust 1.93 and Anchor 0.31.1.

```sh
pnpm install --frozen-lockfile
cp api/.dev.vars.example api/.dev.vars
cp jobs/.dev.vars.example jobs/.dev.vars
pnpm db:local
pnpm dev
```

Configure a devnet RPC and matching runtime settings in the ignored `.dev.vars`
files before starting ingestion. Never commit RPC credentials or signing keys.
Keep wallets on public Solana devnet.

The default frontend is `http://localhost:5173`, with the API on port 8787.
Use `pnpm dev:web` or `pnpm dev:api` to start either package separately.

## Verification

```sh
pnpm check
pnpm test
pnpm test:program
pnpm build
```

Use the built-in browser for manual checks of the running app. See
[SOLANA.md](SOLANA.md) for custom
ports, program deployment details, Cloudflare dashboard setup, operational
secrets, distribution replay, recovery, and outstanding acceptance checks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately.

## License

[MIT](LICENSE)
