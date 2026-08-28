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

Run from `contract/`:

```shell
forge fmt --check
forge build
forge test
```

## Deploy

The full script recognizes Arc Testnet and local Anvil; it rejects other chains.
Arc Testnet deployments use a named Foundry keystore, which Forge unlocks
interactively. List the configured accounts and select one:

```shell
cast wallet list
FOUNDRY_ACCOUNT=your-account-name
export ARC_TESTNET_RPC=https://rpc.testnet.arc.network
```

Optionally set `TREASURY_ADDRESS`; it defaults to the selected deployer:

```shell
export TREASURY_ADDRESS=0xYourTreasuryAddress
```

Dry-run Arc Testnet deployment:

```shell
forge script script/Deploy.s.sol:Deploy --rpc-url "$ARC_TESTNET_RPC" --account "$FOUNDRY_ACCOUNT"
```

Broadcast after the dry run succeeds:

```shell
forge script script/Deploy.s.sol:Deploy --rpc-url "$ARC_TESTNET_RPC" --account "$FOUNDRY_ACCOUNT" --broadcast
```

For a local deployment, start Anvil and use its unlocked default account without
providing a private key:

```shell
anvil
```

In another terminal:

```shell
ANVIL_SENDER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://127.0.0.1:8545 \
  --unlocked \
  --sender "$ANVIL_SENDER" \
  --broadcast
```

Arc Testnet uses chain ID `5042002`, RPC
`https://rpc.testnet.arc.network`, and USDC
`0x3600000000000000000000000000000000000000`. Local Anvil uses chain ID
`31337` and deploys `MockUSDC`.
