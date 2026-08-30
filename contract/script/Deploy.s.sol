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
    address internal constant ARC_TESTNET_USDC =
        0x3600000000000000000000000000000000000000;

    uint256 internal constant CREATION_FEE = 1e6; // $1
    uint256 internal constant INITIAL_VIRTUAL_USDC_RESERVE = 2_986e6;
    uint256 internal constant INITIAL_VIRTUAL_TOKEN_RESERVE =
        1_060_569_000 ether;
    uint256 internal constant MIN_VIRTUAL_TOKEN_RESERVE = 251_660_441 ether;
    uint256 internal constant FEE_BPS = 100;
    uint256 internal constant PROTOCOL_FEE_BPS = 7_500;

    struct NetworkConfig {
        string networkName;
        address usdcAddress;
        bool deployMockUsdc;
    }

    error UnsupportedChain(uint256 chainId);

    function setUp() public {}

    function getDeploymentConfig()
        internal
        view
        returns (NetworkConfig memory config)
    {
        if (block.chainid == ARC_TESTNET_CHAIN_ID) {
            return
                NetworkConfig({
                    networkName: "Arc Testnet",
                    usdcAddress: ARC_TESTNET_USDC,
                    deployMockUsdc: false
                });
        }
        if (block.chainid == ANVIL_CHAIN_ID) {
            return
                NetworkConfig({
                    networkName: "Local Anvil",
                    usdcAddress: address(0),
                    deployMockUsdc: true
                });
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
        WafflesAmmMigrator migrator = new WafflesAmmMigrator(
            ammFactory,
            IERC20(usdc)
        );
        WafflesAmmRouter router = new WafflesAmmRouter(ammFactory);
        WafflesLaunchFactory factory = new WafflesLaunchFactory(
            usdc,
            treasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC_RESERVE,
            INITIAL_VIRTUAL_TOKEN_RESERVE,
            MIN_VIRTUAL_TOKEN_RESERVE,
            FEE_BPS,
            PROTOCOL_FEE_BPS
        );
        ammFactory.setPairCreator(address(migrator));
        migrator.setLaunchFactory(address(factory));
        vm.stopBroadcast();

        logDeployment(
            address(factory),
            address(ammFactory),
            address(migrator),
            address(router),
            usdc,
            deployer,
            treasury,
            config
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
        console2.log("\n--- Launch Configuration (Stored-Reserve) ---");
        console2.log("Creation Fee (USDC units):", CREATION_FEE);
        console2.log(
            "Initial Virtual USDC Reserve:",
            INITIAL_VIRTUAL_USDC_RESERVE
        );
        console2.log(
            "Initial Virtual Token Reserve:",
            INITIAL_VIRTUAL_TOKEN_RESERVE
        );
        console2.log("Min Virtual Token Reserve:", MIN_VIRTUAL_TOKEN_RESERVE);
        console2.log("Trade Fee (bps):", FEE_BPS);
        console2.log("Protocol Fee Share (bps):", PROTOCOL_FEE_BPS);
        console2.log("\n=== Deployment Complete ===");
    }
}
