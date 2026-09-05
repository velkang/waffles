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

    address treasury;
    address rewardsTreasury;
    address creator;

    uint256 constant CREATION_FEE = 1e6;
    uint256 constant CREATION_FEE_NATIVE = CREATION_FEE * 1e12;
    uint256 constant INITIAL_VIRTUAL_USDC = 2_986e6;
    uint256 constant INITIAL_VIRTUAL_TOKENS = 1_060_569_000 ether;
    uint256 constant MIN_VIRTUAL_TOKENS = 251_660_441 ether;
    uint256 constant FEE_BPS = 100;

    function setUp() public {
        treasury = makeAddr("treasury");
        rewardsTreasury = makeAddr("rewardsTreasury");
        creator = makeAddr("creator");
        usdc = new MockUSDC();
        migrator = new MockMigrator(address(usdc));
        factory = new WafflesLaunchFactory(
            address(usdc),
            treasury,
            rewardsTreasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            FEE_BPS
        );
        vm.deal(creator, 1_000 ether);
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
            FEE_BPS,
            CREATION_FEE
        );
        vm.prank(creator);
        (address token, address curve) = factory.createToken{value: CREATION_FEE_NATIVE}(
            "Ghost", "GHOST", "spooky", "ipfs://img", "https://x", "@x", "t.me/x"
        );

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

        assertEq(treasury.balance, CREATION_FEE_NATIVE);
        assertEq(WafflesMemeToken(token).balanceOf(curve), 1_000_000_000 ether);
        assertEq(factory.tokenOfCurve(curve), token);

        // Verify stored-reserve parameters
        WafflesBondingCurve c = WafflesBondingCurve(curve);
        assertEq(c.initialVirtualUsdcReserve(), INITIAL_VIRTUAL_USDC);
        assertEq(c.initialVirtualTokenReserve(), INITIAL_VIRTUAL_TOKENS);
        assertEq(c.minVirtualTokenReserve(), MIN_VIRTUAL_TOKENS);
        assertEq(c.rewardsTreasury(), rewardsTreasury);
        assertEq(factory.creatorOfToken(token), creator);
    }

    function test_CreateTokenWithoutFee() public {
        factory.setCreationFee(0);
        vm.prank(creator);
        (address token, address curve) = factory.createToken("Free", "FREE", "", "", "", "", "");
        assertTrue(token != address(0));
        assertTrue(curve != address(0));
        assertEq(treasury.balance, 0);
    }

    function test_CreateTokenRequiresExactNativeFee() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        vm.expectRevert(WafflesLaunchFactory.InvalidNativeUsdcAmount.selector);
        (address token, address curve) = factory.createToken("Broke", "BROKE", "", "", "", "", "");
        assertEq(token, address(0));
        assertEq(curve, address(0));
    }

    function test_CreateTokenAndBuyInOneTransaction() public {
        vm.prank(creator);
        (address token, address curve, uint256 bought) = factory.createTokenAndBuy{value: 101 ether}(
            "Ghost", "GHOST", "spooky", "ipfs://img", "https://x", "@x", "t.me/x", 100e6, 0
        );

        assertGt(bought, 0);
        assertEq(WafflesMemeToken(token).balanceOf(creator), bought);
        assertEq(treasury.balance, CREATION_FEE_NATIVE + 250_000 * 1e12);
        assertEq(WafflesBondingCurve(curve).creator(), creator);
    }

    function test_NonOnePercentFeeConfigurationReverts() public {
        vm.expectRevert(WafflesLaunchFactory.InvalidParameters.selector);
        new WafflesLaunchFactory(
            address(usdc),
            treasury,
            rewardsTreasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            99
        );
    }

    function test_ZeroRewardsTreasuryReverts() public {
        vm.expectRevert(WafflesLaunchFactory.InvalidAddress.selector);
        new WafflesLaunchFactory(
            address(usdc),
            treasury,
            address(0),
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            FEE_BPS
        );
    }

    function test_RewardsTreasuryMustDifferFromPlatformTreasury() public {
        vm.expectRevert(WafflesLaunchFactory.InvalidAddress.selector);
        new WafflesLaunchFactory(
            address(usdc),
            treasury,
            treasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            FEE_BPS
        );
    }

    function test_InvalidReserveConfigurationReverts() public {
        // minVirtualTokenReserve >= initialVirtualTokenReserve → invalid
        vm.expectRevert(WafflesLaunchFactory.InvalidParameters.selector);
        new WafflesLaunchFactory(
            address(usdc),
            treasury,
            rewardsTreasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            INITIAL_VIRTUAL_TOKENS, // min == initial → invalid
            FEE_BPS
        );
    }

    function test_SellableSupplyCannotExceedMintedSupply() public {
        vm.expectRevert(WafflesLaunchFactory.InvalidParameters.selector);
        new WafflesLaunchFactory(
            address(usdc),
            treasury,
            rewardsTreasury,
            address(migrator),
            CREATION_FEE,
            INITIAL_VIRTUAL_USDC,
            1_500_000_001 ether,
            500_000_000 ether,
            FEE_BPS
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
