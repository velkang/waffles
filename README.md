# waffles.meme

Permissionless token launchpad on Arc, Circle's USDC-native L1.

## Layout

- `contract/` — Foundry workspace: `LaunchFactory`, `BondingCurve`, `MemeToken`,
  tests, and the deploy script.
- `frontend/` — Next.js App Router dApp (wagmi v2 + Reown AppKit).
- `indexer/` — TypeScript event indexer (viem → MongoDB).

## Commands

```shell
# Initialize pinned Foundry dependencies after cloning
git submodule update --init --recursive

# Contracts (from contract/)
forge build
forge test
cast wallet list               # choose a configured Foundry keystore
FOUNDRY_ACCOUNT=your-account-name
export ARC_TESTNET_RPC=https://rpc.testnet.arc.network
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ARC_TESTNET_RPC" \
  --account "$FOUNDRY_ACCOUNT" \
  --broadcast

# JS packages (pnpm workspace, from repo root)
pnpm install
pnpm --filter frontend dev      # Next.js dev server
pnpm --filter frontend wagmi    # regenerate contract hooks after forge build
pnpm --filter indexer dev       # indexer (needs .env: RPC_URL, FACTORY_ADDRESS, MONGODB_URI)
pnpm --filter indexer backfill -- --from=0 --to=10000
```

The full deploy script supports Arc Testnet (chain ID `5042002`) and local Anvil
(chain ID `31337`). It uses Arc Testnet USDC at
`0x3600000000000000000000000000000000000000` and deploys `MockUSDC` only on
Anvil. Unknown chains are rejected.

The deploy script prints the deployer, treasury, `LaunchFactory`, `Migrator`,
`Router`, and AMM addresses. `TREASURY_ADDRESS` defaults to the CLI deployer.
Forge unlocks the named keystore interactively; deployment does not require a
raw private key in the command or environment.
Set both `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_ROUTER_ADDRESS` in the
frontend environment. Post-graduation trading stays paused when the atomic
router is not configured.
