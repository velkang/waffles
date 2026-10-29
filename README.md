# waffles.meme

A Solana devnet launchpad built around visible creator commitments, measured
holding behavior, configurable creator earnings, and weekly fee-funded rewards.

Tokens trade in SOL on Waffles' bonding curve and graduate into its permanent
pool. Creators publish their earnings allocations and funded token/fee locks.
Weekly raffle prize counts vary with the funded pool; there is no 20-winner cap.

**Status:** The program is deployed and initialized on public Solana devnet.
Contracts are unaudited. The web, API, and jobs are deployed to Cloudflare; deployed-pilot
acceptance checks remain outstanding. Mainnet and real-funds readiness are separate.

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

## Cloudflare deployment

The public site is https://waffles-web.velikanghost.workers.dev.
Deploy the API, jobs, and web Workers using their existing Wrangler configurations.
Supply RPC and signing credentials through Worker secrets, never plaintext variables.

With GitHub integration enabled, pushes to the configured production branch
trigger builds for each connected Worker. Check all three Workers' Builds pages
to confirm the commit was deployed successfully.

The jobs coordinator uses a recurring Durable Object alarm for ingestion and
minute-level maintenance; it does not require a cron slot. After the first jobs
deployment (or to restart scheduling), send an authenticated `POST /start` to the
jobs Worker with its `OPERATIONS_TOKEN` as a Bearer token. The same operation
starts local ingestion after `pnpm dev`. Preserve indexing checkpoints on restart.
RPC reads and submissions from the API and jobs share the jobs Worker's `RPC`
Durable Object. `RPC_CU_PER_SECOND` is set to 320 against the deployment's reported
400 CU/s allowance; background work gets half of the configured refill rate so
interactive calls retain capacity. Set this below the provider's account allowance,
including any other apps sharing that account. Provider cooldowns and network
validation survive restarts. Changing the jobs RPC URL or expected genesis hash
invalidates cached validation automatically. SDK rate-limit retries are disabled.

The `fetch_jobs` D1 table retains retry deadlines independently of Queue retention.
Discovery repairs the earliest gap, reuses archived blocks, and repairs known gaps
ahead of an old queue backlog. Queued fetches acknowledge only after archive state
is recorded (or a durable retry is recorded); ordered application runs separately.
No completion checkpoint advances across missing history. Apply all D1 migrations
before deploying jobs, and deploy jobs before the API when adding an RPC binding.

Workers Free quotas and CPU limits still apply. The full-block ingestion source
has not been shown to sustain live Solana traffic within those quotas; RPC pacing
alone does not establish deployed-pilot readiness. The deployment's Pyth key is
stored as a Worker secret; historical requests and live R2/D1 archival have been
verified. Missing
trade prices are backfilled in batches of 20 during maintenance and still block
affected ticket accounting and settlement. `/health/ready` remains 503 until
finalized history catches up. Empty market lists do not prove no launches exist.

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
