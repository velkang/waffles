# waffles.meme

Permissionless token launchpad on Arc, Circle's USDC-native L1.

## Layout

- `contract/` — Foundry workspace: `LaunchFactory`, `BondingCurve`, `MemeToken`,
  tests, and the deploy script.
- `frontend/` — Next.js App Router dApp (wagmi v2 + Reown AppKit).
- `indexer/` — TypeScript event indexer (viem → MongoDB).
