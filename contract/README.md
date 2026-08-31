# waffles.meme Contracts

Foundry workspace for the waffles.meme launch factory, bonding curve, graduation AMM,
router, deployment scripts, and Solidity tests.

## Dependencies

Dependencies are pinned Git submodules. Initialize them from the repository root:

```shell
git submodule update --init --recursive
```

- `lib/forge-std` — `v1.16.2`
- `lib/openzeppelin-contracts` — `v5.7.0`

## Build and test

Run from the repository root:

```shell
pnpm exec forge fmt --root contract --check
pnpm exec forge build --root contract
pnpm exec forge test --root contract
```

## Deploy

The full script recognizes Arc Testnet and local Anvil; it rejects other chains.
Arc Testnet deployments use a named Foundry keystore, which Forge unlocks
interactively. Create the ignored local environment file from the committed
template, fill in the two custody addresses, and load it into the shell. These
are the only deployment values kept in `.env`:

```shell
cp contract/.env.example contract/.env
```

`TREASURY_ADDRESS` optionally defaults to the selected deployer.
`REWARDS_TREASURY_ADDRESS` is required for Arc deployments and must be a
different address so the 5% rewards allocation cannot be mixed with platform
revenue.

Every curve and graduated AMM trade charges 1% in USDC. The fee is allocated
70% to the token creator, 25% to `TREASURY_ADDRESS`, and 5% to
`REWARDS_TREASURY_ADDRESS`. Weekly winner selection and distribution are not
implemented by these contracts.

Dry-run Arc Testnet deployment:

```shell
pnpm exec forge script contract/script/Deploy.s.sol:Deploy --root contract \
  --rpc-url arc_testnet \
  --account your-foundry-keystore-account
```

Broadcast after the dry run succeeds:

```shell
pnpm exec forge script contract/script/Deploy.s.sol:Deploy --root contract \
  --rpc-url arc_testnet \
  --account your-foundry-keystore-account \
  --broadcast
```

For a local deployment, start Anvil and use its unlocked default account without
providing a private key:

```shell
anvil
```

In another terminal:

```shell
ANVIL_SENDER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
pnpm exec forge script contract/script/Deploy.s.sol:Deploy --root contract \
  --rpc-url http://127.0.0.1:8545 \
  --unlocked \
  --sender "$ANVIL_SENDER" \
  --broadcast
```

Arc Testnet uses chain ID `5042002`, RPC
`https://rpc.testnet.arc.network`, and USDC
`0x3600000000000000000000000000000000000000`. Local Anvil uses chain ID
`31337` and deploys `MockUSDC`.
