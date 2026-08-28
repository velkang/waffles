// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesAmmFactory} from "../src/amm/WafflesAmmFactory.sol";
import {WafflesAmmMigrator} from "../src/amm/WafflesAmmMigrator.sol";
import {WafflesAmmRouter} from "../src/amm/WafflesAmmRouter.sol";
import {WafflesLaunchFactory} from "../src/WafflesLaunchFactory.sol";

contract BroadcasterFinder {
    address public immutable BROADCASTER;

    constructor() {
        BROADCASTER = msg.sender;
    }
}

/// @notice Deploys the complete waffles.meme launchpad on a supported network.
contract Deploy is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    uint256 internal constant ANVIL_CHAIN_ID = 31_337;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    // Curve economics (full supply on the curve, 20% non-sellable reserve):
    //   - initial mcap ~= $5.6k (v_u / 1.2B * 1B)
    //   - curve completes at a $50k mcap reading (7.5x v_u / threshold parity)
    //   - the seeded pool opens at ~= $66.7k mcap (2x v_u USDC / 200M reserve)
    //   - 1% trade fee (0.75% protocol / 0.25% creator), $1 creation fee
    uint256 internal constant CREATION_FEE = 1e6; // $1
    uint256 internal constant VIRTUAL_USDC = 6_667e6;
    uint256 internal constant VIRTUAL_TOKENS = 2e26;
    uint256 internal constant GRADUATION_MCAP = 50_000e6;
    uint256 internal constant FEE_BPS = 100;
    uint256 internal constant PROTOCOL_FEE_BPS = 7_500;

    struct NetworkConfig {
        string networkName;
        address usdcAddress;
        bool deployMockUsdc;
    }

    error UnsupportedChain(uint256 chainId);

    function setUp() public {}

    function getDeploymentConfig() internal view returns (NetworkConfig memory config) {
        if (block.chainid == ARC_TESTNET_CHAIN_ID) {
            return NetworkConfig({networkName: "Arc Testnet", usdcAddress: ARC_TESTNET_USDC, deployMockUsdc: false});
        }
        if (block.chainid == ANVIL_CHAIN_ID) {
            return NetworkConfig({networkName: "Local Anvil", usdcAddress: address(0), deployMockUsdc: true});
        }

        revert UnsupportedChain(block.chainid);
    }

    function run() external {
        NetworkConfig memory config = getDeploymentConfig();

        console2.log("=== waffles.meme Deployment ===");
        console2.log("Network:", config.networkName);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast();
        BroadcasterFinder finder = new BroadcasterFinder();
        address deployer = finder.BROADCASTER();
        vm.stopBroadcast();

        vm.startBroadcast(deployer);

        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address usdc = config.usdcAddress;
        if (config.deployMockUsdc) {
            console2.log("Deploying MockUSDC...");
            usdc = address(new MockUSDC());
        }

        WafflesAmmFactory ammFactory = new WafflesAmmFactory();
        WafflesAmmMigrator migrator = new WafflesAmmMigrator(ammFactory, IERC20(usdc));
        WafflesAmmRouter router = new WafflesAmmRouter(ammFactory);
        WafflesLaunchFactory factory = new WafflesLaunchFactory(
            usdc,
            treasury,
            address(migrator),
            CREATION_FEE,
            VIRTUAL_USDC,
            VIRTUAL_TOKENS,
            GRADUATION_MCAP,
            FEE_BPS,
            PROTOCOL_FEE_BPS
        );
        ammFactory.setPairCreator(address(migrator));
        migrator.setLaunchFactory(address(factory));
        vm.stopBroadcast();

        logDeployment(
            address(factory), address(ammFactory), address(migrator), address(router), usdc, deployer, treasury, config
        );
    }

    function logDeployment(
        address launchFactory,
        address ammFactory,
        address migrator,
        address router,
        address usdc,
        address deployer,
        address treasury,
        NetworkConfig memory config
    ) internal pure {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:", config.networkName);
        console2.log("Deployer / Owner:", deployer);
        console2.log("Treasury:", treasury);
        console2.log("\n--- Contract Addresses ---");
        console2.log("USDC:", usdc);
        console2.log("AMM Factory:", ammFactory);
        console2.log("Migrator:", migrator);
        console2.log("Router:", router);
        console2.log("Launch Factory:", launchFactory);
        console2.log("\n--- Launch Configuration ---");
        console2.log("Creation Fee (USDC units):", CREATION_FEE);
        console2.log("Virtual USDC:", VIRTUAL_USDC);
        console2.log("Virtual Tokens:", VIRTUAL_TOKENS);
        console2.log("Graduation Market Cap:", GRADUATION_MCAP);
        console2.log("Trade Fee (bps):", FEE_BPS);
        console2.log("Protocol Fee Share (bps):", PROTOCOL_FEE_BPS);
        console2.log("\n=== Deployment Complete ===");
    }
}
