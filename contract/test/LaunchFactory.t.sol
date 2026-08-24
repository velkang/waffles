// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockMigrator} from "../src/mocks/MockMigrator.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";

contract LaunchFactoryTest is Test {
    MockUSDC usdc;
    MockMigrator migrator;
    LaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");

    uint256 constant CREATION_FEE = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        migrator = new MockMigrator(address(usdc));
        factory = new LaunchFactory(
            address(usdc), treasury, address(migrator), CREATION_FEE, 5_000e6, 2e26, 50_000e6, 100, 7_500
        );
        usdc.mint(creator, 1_000e6);
        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
    }

    function test_CreateToken() public {
        vm.prank(creator);
        (address token, address curve) =
            factory.createToken("Ghost", "GHOST", "spooky", "ipfs://img", "https://x", "@x", "t.me/x");

        assertTrue(token != address(0) && curve != address(0));

        (
            address launchToken,
            address launchCurve,
            address launchCreator,
            string memory description,
            string memory imageUri,,,,
            uint64 createdAt
        ) = factory.launchOfToken(token);
        assertEq(launchToken, token);
        assertEq(launchCurve, curve);
        assertEq(launchCreator, creator);
        assertEq(description, "spooky");
        assertEq(imageUri, "ipfs://img");
        assertGt(createdAt, 0);

        assertEq(MemeToken(token).name(), "Ghost");
        assertEq(MemeToken(token).symbol(), "GHOST");
        // Entire supply funds the curve; 200M of it is the migration reserve.
        assertEq(MemeToken(token).balanceOf(curve), 1_000_000_000 ether);
        assertEq(MemeToken(token).balanceOf(address(factory)), 0);
        assertEq(BondingCurve(curve).reserveTokens(), 200_000_000 ether);
        assertEq(usdc.balanceOf(treasury), CREATION_FEE);
        assertEq(factory.allTokensLength(), 1);
        assertEq(BondingCurve(curve).creator(), creator);
    }

    function test_CreateTokenWithoutFee() public {
        factory.setCreationFee(0);
        uint256 balanceBefore = usdc.balanceOf(creator);
        vm.prank(creator);
        (address token,) = factory.createToken("A", "A", "", "", "", "", "");
        assertEq(usdc.balanceOf(creator), balanceBefore);
        assertTrue(token != address(0));
    }

    function test_CreateTokenRequiresFeeAllowance() public {
        vm.prank(makeAddr("noAllowance"));
        vm.expectRevert();
        factory.createToken("A", "A", "", "", "", "", "");
    }

    function test_SetMigrator() public {
        address newMigrator = makeAddr("newMigrator");
        factory.setMigrator(newMigrator);
        assertEq(factory.migrator(), newMigrator);

        vm.prank(creator);
        vm.expectRevert();
        factory.setMigrator(newMigrator);
    }

    function test_TwoStepOwnershipTransfer() public {
        factory.transferOwnership(creator);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), creator);

        vm.prank(creator);
        factory.acceptOwnership();
        assertEq(factory.owner(), creator);
        assertEq(factory.pendingOwner(), address(0));
    }

    function test_InvalidFeeConfigurationReverts() public {
        vm.expectRevert(LaunchFactory.InvalidParameters.selector);
        new LaunchFactory(
            address(usdc), treasury, address(migrator), CREATION_FEE, 5_000e6, 2e26, 50_000e6, 10_000, 7_500
        );
    }
}
