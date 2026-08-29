# Waffles event indexer

The indexer receives Circle Smart Contract Platform `contracts.eventLog`
webhooks and keeps a rate-limited RPC poller as a durability safety net.

## Configuration

Copy `.env.example` to `.env` and configure MongoDB, the deployed factory,
USDC, and RPC endpoint. Production webhook ingestion also requires
`CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`.

Webhook signatures are verified by default using Circle's
`X-Circle-Key-Id` and `X-Circle-Signature` headers. Set
`VERIFY_WEBHOOK_SIGNATURES=false` only for local payload testing.

In the Circle Developer Console, create a public HTTPS webhook subscription
for `contracts.eventLog` notifications pointing to `/webhook` on this service.

## Event monitors

The running indexer periodically reconciles event monitors for the factory,
all discovered bonding curves, and all graduated AMM pools. Contracts are
imported before monitors are created, and every mutating Circle request uses a
stable operation-specific UUID idempotency key.

To run reconciliation once:

```bash
pnpm --filter indexer circle:monitors
```

The configured Circle account must be able to import the deployed contracts.
If an address cannot be imported, verify its deployment/source metadata in the
Arc explorer; the safety-net poller continues ingesting while reconciliation
retries.

## Development

```bash
pnpm --filter indexer test
pnpm --filter indexer exec tsc --noEmit
pnpm --filter indexer dev
```

The default poll interval is 60 seconds, and all RPC methods are serialized to
at most five request starts per second. `POLL_INTERVAL_MS` can be increased,
and `RPC_MAX_REQUESTS_PER_SECOND` can be lowered but never raised above five.
