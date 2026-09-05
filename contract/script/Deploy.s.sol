// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesAmmFactory} from "../src/amm/WafflesAmmFactory.sol";
import {WafflesAmmMigrator} from "../src/amm/WafflesAmmMigrator.sol";
import {WafflesAmmRouter} from "../src/amm/WafflesAmmRouter.sol";
import {WafflesLaunchFactory} from "../src/WafflesLaunchFactory.sol";
import {WafflesRewardsDistributor} from "../src/WafflesRewardsDistributor.sol";

/// @notice Deploys the complete waffles.meme launchpad on a supported network.
contract Deploy is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    uint256 internal constant ANVIL_CHAIN_ID = 31_337;
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    uint256 internal constant CREATION_FEE = 1e6; // $1
    uint256 internal constant INITIAL_VIRTUAL_USDC_RESERVE = 2_986e6;
    uint256 internal constant INITIAL_VIRTUAL_TOKEN_RESERVE = 1_060_569_000 ether;
    uint256 internal constant MIN_VIRTUAL_TOKEN_RESERVE = 251_660_441 ether;
    uint256 internal constant FEE_BPS = 100;
    uint256 internal constant CREATOR_FEE_SHARE_BPS = 7_000;
    uint256 internal constant PLATFORM_FEE_SHARE_BPS = 2_500;
    uint256 internal constant REWARDS_FEE_SHARE_BPS = 500;

    struct NetworkConfig {
        string networkName;
        address usdcAddress;
        bool deployMockUsdc;
    }

    error UnsupportedChain(uint256 chainId);
    error InvalidBroadcastContext();

    function run() external {
        NetworkConfig memory config;
        if (block.chainid == ARC_TESTNET_CHAIN_ID) {
            config = NetworkConfig({networkName: "Arc Testnet", usdcAddress: ARC_TESTNET_USDC, deployMockUsdc: false});
        } else if (block.chainid == ANVIL_CHAIN_ID) {
            config = NetworkConfig({networkName: "Local Anvil", usdcAddress: address(0), deployMockUsdc: true});
        } else {
            revert UnsupportedChain(block.chainid);
        }

        console2.log("=== waffles.meme Deployment ===");
        console2.log("Network:", config.networkName);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast();
        (VmSafe.CallerMode callerMode, address deployer, address origin) = vm.readCallers();
        if (callerMode != VmSafe.CallerMode.RecurrentBroadcast || origin == address(0)) {
            revert InvalidBroadcastContext();
        }

        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        address usdc = config.usdcAddress;
        if (config.deployMockUsdc) {
            console2.log("Deploying MockUSDC...");
            usdc = address(new MockUSDC());
        }

        address rewardsFinalizer = vm.envOr("REWARDS_FINALIZER_ADDRESS", deployer);
        WafflesRewardsDistributor rewardsDistributor =
            new WafflesRewardsDistributor(IERC20(usdc), deployer, rewardsFinalizer);
        address rewardsTreasury = address(rewardsDistributor);

        WafflesAmmFactory ammFactory = new WafflesAmmFactory(usdc, treasury, rewardsTreasury);
        WafflesAmmMigrator migrator = new WafflesAmmMigrator(ammFactory, IERC20(usdc));
        WafflesAmmRouter router = new WafflesAmmRouter(ammFactory);
        uint256 initialVirtualUsdcReserve = vm.envOr("INITIAL_VIRTUAL_USDC_RESERVE", INITIAL_VIRTUAL_USDC_RESERVE);
        uint256 initialVirtualTokenReserve = vm.envOr("INITIAL_VIRTUAL_TOKEN_RESERVE", INITIAL_VIRTUAL_TOKEN_RESERVE);
        uint256 minVirtualTokenReserve = vm.envOr("MIN_VIRTUAL_TOKEN_RESERVE", MIN_VIRTUAL_TOKEN_RESERVE);

        WafflesLaunchFactory factory = new WafflesLaunchFactory(
            usdc,
            treasury,
            rewardsTreasury,
            address(migrator),
            CREATION_FEE,
            initialVirtualUsdcReserve,
            initialVirtualTokenReserve,
            minVirtualTokenReserve,
            FEE_BPS
        );
        ammFactory.setPairCreator(address(migrator));
        migrator.setLaunchFactory(address(factory));
        vm.stopBroadcast();

        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:", config.networkName);
        console2.log("Deployer / Owner:", deployer);
        console2.log("Treasury:", treasury);
        console2.log("Rewards Treasury:", rewardsTreasury);
        console2.log("\n--- Contract Addresses ---");
        console2.log("USDC:", usdc);
        console2.log("AMM Factory:", address(ammFactory));
        console2.log("Migrator:", address(migrator));
        console2.log("Router:", address(router));
        console2.log("Launch Factory:", address(factory));
        console2.log("Rewards Distributor:", address(rewardsDistributor));
        console2.log("\n--- Launch Configuration (Stored-Reserve) ---");
        console2.log("Creation Fee (USDC units):", factory.creationFee());
        console2.log("Initial Virtual USDC Reserve:", factory.initialVirtualUsdcReserve());
        console2.log("Initial Virtual Token Reserve:", factory.initialVirtualTokenReserve());
        console2.log("Min Virtual Token Reserve:", factory.minVirtualTokenReserve());
        console2.log("Trade Fee (bps):", factory.feeBps());
        console2.log("Creator Fee Share (bps):", CREATOR_FEE_SHARE_BPS);
        console2.log("Platform Fee Share (bps):", PLATFORM_FEE_SHARE_BPS);
        console2.log("Rewards Fee Share (bps):", REWARDS_FEE_SHARE_BPS);
        console2.log("\n=== Deployment Complete ===");
    }
}
