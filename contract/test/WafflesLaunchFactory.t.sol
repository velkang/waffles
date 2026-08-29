// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockMigrator} from "../src/mocks/MockMigrator.sol";
import {WafflesMemeToken} from "../src/WafflesMemeToken.sol";
import {WafflesBondingCurve} from "../src/WafflesBondingCurve.sol";
import {WafflesLaunchFactory} from "../src/WafflesLaunchFactory.sol";

contract WafflesLaunchFactoryTest is Test {
    MockUSDC usdc;
    MockMigrator migrator;
    WafflesLaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");

    uint256 constant CREATION_FEE = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        migrator = new MockMigrator(address(usdc));
        factory = new WafflesLaunchFactory(
            address(usdc), treasury, address(migrator), CREATION_FEE, 5_000e6, 2e26, 50_000e6, 100, 7_500
        );
        usdc.mint(creator, 1_000e6);
        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
    }

    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol,
        string description,
        string imageUri,
        string website,
        string twitter,
        string telegram,
        uint256 feeBps,
        uint256 creationFeePaid
    );

    function test_CreateToken() public {
        address expectedToken = vm.computeCreateAddress(address(factory), 1);
        address expectedCurve = vm.computeCreateAddress(address(factory), 2);
        vm.expectEmit(true, true, true, true, address(factory));
        emit TokenCreated(
            expectedToken,
            expectedCurve,
            creator,
            "Ghost",
            "GHOST",
            "spooky",
            "ipfs://img",
            "https://x",
            "@x",
            "t.me/x",
            100,
            CREATION_FEE
        );
        vm.prank(creator);
        (address token, address curve) =
            factory.createToken("Ghost", "GHOST", "spooky", "ipfs://img", "https://x", "@x", "t.me/x");

        assertTrue(token != address(0) && curve != address(0));

        (
            address launchToken,
            address launchCurve,
            address launchCreator,
            string memory desc,
            string memory img,
            string memory site,
            string memory tw,
            string memory tg,
            uint64 createdAt
        ) = factory.launchOfToken(token);

        assertEq(launchToken, token);
        assertEq(launchCurve, curve);
        assertEq(launchCreator, creator);
        assertEq(desc, "spooky");
        assertEq(img, "ipfs://img");
        assertEq(site, "https://x");
        assertEq(tw, "@x");
        assertEq(tg, "t.me/x");
        assertGt(createdAt, 0);

        assertEq(usdc.balanceOf(treasury), CREATION_FEE);
        assertEq(WafflesMemeToken(token).balanceOf(curve), 1_000_000_000 ether);
        assertEq(factory.tokenOfCurve(curve), token);
    }

    function test_CreateTokenWithoutFee() public {
        factory.setCreationFee(0);
        vm.prank(creator);
        (address token,) = factory.createToken("Free", "FREE", "", "", "", "", "");
        assertTrue(token != address(0));
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_CreateTokenRequiresFeeAllowance() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        vm.expectRevert();
        factory.createToken("Broke", "BROKE", "", "", "", "", "");
    }

    function test_InvalidFeeConfigurationReverts() public {
        vm.expectRevert(WafflesLaunchFactory.InvalidParameters.selector);
        new WafflesLaunchFactory(
            address(usdc), treasury, address(migrator), CREATION_FEE, 5_000e6, 2e26, 50_000e6, 10_000, 7_500
        );
    }

    function test_TwoStepOwnershipTransfer() public {
        address alice = makeAddr("alice");
        factory.transferOwnership(alice);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), alice);

        vm.prank(alice);
        factory.acceptOwnership();
        assertEq(factory.owner(), alice);
        assertEq(factory.pendingOwner(), address(0));
    }
}
