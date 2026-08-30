# Waffles event indexer

The indexer receives Circle Smart Contract Platform `contracts.eventLog`
webhooks for the live path, persists the decoded events in MongoDB, and lets
the Nest backend stream MongoDB changes to browsers over SSE. It periodically
reads Circle event logs to recover webhook delivery gaps. Normal operation does
not scan Arc blocks or call `eth_getLogs`.

## Configuration

Copy `.env.example` to `.env` and configure MongoDB, the deployed factory,
USDC, `CIRCLE_API_KEY`, and `CIRCLE_ENTITY_SECRET`. The running indexer does
not require an Arc RPC URL or block-scanning configuration.

Webhook signatures are verified by default using Circle's
`X-Circle-Key-Id` and `X-Circle-Signature` headers. Set
`VERIFY_WEBHOOK_SIGNATURES=false` only for local payload testing.

In the Circle Developer Console, create a public HTTPS webhook subscription
for `contracts.eventLog` notifications pointing to `/webhook` on this service.
For localhost development, the subscription must point to a public HTTPS
forwarder (for example Webhook.site CLI or a tunnel) that forwards to
`http://localhost:3001/webhook`. Circle cannot call localhost directly.

## Event monitors

The running indexer periodically reconciles event monitors for the factory,
all discovered bonding curves, and all graduated AMM pools. Contracts are
imported before monitors are created. Reconciliation lists and reuses existing
monitors first; every new Circle mutation receives a fresh UUID idempotency key.

Reconciliation runs automatically with the indexer. To run only monitor setup
once for diagnostics:

```bash
pnpm --filter indexer circle:monitors
```

The configured Circle account must be able to import the deployed contracts.
If an address cannot be imported, verify its deployment/source metadata in the
Arc explorer. Monitor and event-log reconciliation will keep retrying.

Circle webhook payloads do not include `logIndex`. The receiver resolves the
canonical index from Circle's event-log API before storing the event. If the log
is not queryable yet, it returns `503` so Circle retries instead of acknowledging
and losing the event.

## Development

```bash
pnpm --filter indexer test
pnpm --filter indexer exec tsc --noEmit
pnpm --filter indexer dev
```

The live delivery path is Circle webhook → MongoDB → Nest SSE → browser. Circle
event-log reconciliation runs every `CIRCLE_EVENT_LOG_INTERVAL_MS` (60 seconds
by default) only as a durability path. `circle:monitors` is not a second service
you need to keep running.
