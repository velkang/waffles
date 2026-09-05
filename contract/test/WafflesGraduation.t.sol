// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesMemeToken} from "../src/WafflesMemeToken.sol";
import {WafflesAmmFactory} from "../src/amm/WafflesAmmFactory.sol";
import {WafflesAmmPair} from "../src/amm/WafflesAmmPair.sol";
import {WafflesAmmMigrator} from "../src/amm/WafflesAmmMigrator.sol";
import {WafflesBondingCurve} from "../src/WafflesBondingCurve.sol";
import {WafflesLaunchFactory} from "../src/WafflesLaunchFactory.sol";

/// @notice End-to-end test
contract WafflesGraduationTest is Test {
    MockUSDC usdc;
    WafflesAmmFactory ammFactory;
    WafflesAmmMigrator migrator;
    WafflesLaunchFactory factory;

    address treasury;
    address rewardsTreasury;
    address creator;
    address trader;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant INITIAL_VIRTUAL_USDC = 2_986e6;
    uint256 constant INITIAL_VIRTUAL_TOKENS = 1_060_569_000 ether;
    uint256 constant MIN_VIRTUAL_TOKENS = 251_660_441 ether;
    uint256 constant BPS_DENOM = 10_000;
    uint256 constant FEE_BPS = 100;
    uint256 constant CREATOR_FEE_SHARE_BPS = 7_000;
    uint256 constant PLATFORM_FEE_SHARE_BPS = 2_500;
    uint256 constant LIQUIDITY_RESERVE = 1_000_000_000 ether - (INITIAL_VIRTUAL_TOKENS - MIN_VIRTUAL_TOKENS);

    WafflesMemeToken token;
    WafflesBondingCurve curve;

    function setUp() public {
        treasury = makeAddr("treasury");
        rewardsTreasury = makeAddr("rewardsTreasury");
        creator = makeAddr("creator");
        trader = makeAddr("trader");
        usdc = new MockUSDC();
        ammFactory = new WafflesAmmFactory(address(usdc), treasury, rewardsTreasury);
        migrator = new WafflesAmmMigrator(ammFactory, IERC20(usdc));
        factory = new WafflesLaunchFactory(
            address(usdc),
            treasury,
            rewardsTreasury,
            address(migrator),
            0,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            FEE_BPS
        );
        ammFactory.setPairCreator(address(migrator));
        migrator.setLaunchFactory(address(factory));

        vm.prank(creator);
        (address tokenAddr, address curveAddr) = factory.createToken("Grad", "GRAD", "grad", "uri", "site", "tw", "tg");
        token = WafflesMemeToken(tokenAddr);
        curve = WafflesBondingCurve(curveAddr);

        vm.deal(trader, 1_000_000 ether);
        vm.prank(trader);
        assertTrue(token.approve(address(curve), type(uint256).max));
    }

    function test_PoolSeededWithReserveAndRaisedUsdc() public {
        vm.prank(trader);
        assertGt(curve.buy{value: 100_000e18}(0, trader), 0);

        assertTrue(curve.graduated());
        address pool = curve.graduationPool();
        assertTrue(pool != address(0));

        assertEq(ammFactory.getPair(address(token), address(usdc)), pool);

        uint256 poolTokenBalance = token.balanceOf(pool);
        assertEq(poolTokenBalance, LIQUIDITY_RESERVE, "pool should have liquidityTokenReserve tokens");

        assertEq(token.balanceOf(address(curve)), 0, "curve should have 0 tokens post-graduation");

        assertEq(address(curve).balance / 1e12, curve.creatorEarnings(creator));
    }

    function test_LiquidityPermanentlyBurned() public {
        vm.prank(trader);
        assertGt(curve.buy{value: 100_000e18}(0, trader), 0);

        address pool = curve.graduationPool();
        WafflesAmmPair pair = WafflesAmmPair(pool);

        assertGt(pair.balanceOf(DEAD), 0);
        assertEq(pair.balanceOf(address(migrator)), 0);
        assertEq(pair.balanceOf(address(curve)), 0);
        assertEq(pair.balanceOf(address(this)), 0);
    }

    function test_TradingContinuesOnPoolAfterGraduation() public {
        vm.prank(trader);
        assertGt(curve.buy{value: 100_000e18}(0, trader), 0);

        address pool = curve.graduationPool();
        WafflesAmmPair pair = WafflesAmmPair(pool);

        vm.prank(trader);
        vm.expectRevert(WafflesBondingCurve.CurveClosed.selector);
        uint256 boughtAfterGraduation = curve.buy{value: 100e18}(0, trader);
        assertEq(boughtAfterGraduation, 0);

        address alice = makeAddr("alice");
        vm.deal(alice, 100 ether);
        uint256 creatorFeesBefore = creator.balance;
        uint256 platformFeesBefore = treasury.balance;
        uint256 rewardsFeesBefore = rewardsTreasury.balance;

        vm.startPrank(alice);
        uint256 usdcIn = 100e6;
        pair.depositUsdc{value: usdcIn * 1e12}();

        (uint256 r0, uint256 r1) = pair.getReserves();
        bool usdcIs0 = pair.token0() == address(usdc);
        (uint256 rIn, uint256 rOut) = usdcIs0 ? (r0, r1) : (r1, r0);

        uint256 fee = (usdcIn * FEE_BPS) / BPS_DENOM;
        uint256 netUsdcIn = usdcIn - fee;
        uint256 expectedOut = (netUsdcIn * rOut) / (rIn + netUsdcIn);
        if (usdcIs0) {
            pair.swap(0, expectedOut, alice);
        } else {
            pair.swap(expectedOut, 0, alice);
        }
        vm.stopPrank();

        uint256 expectedCreatorFee = Math.mulDiv(fee, CREATOR_FEE_SHARE_BPS, BPS_DENOM);
        uint256 expectedPlatformFee = Math.mulDiv(fee, PLATFORM_FEE_SHARE_BPS, BPS_DENOM);
        uint256 expectedRewardsFee = fee - expectedCreatorFee - expectedPlatformFee;
        assertEq(token.balanceOf(alice), expectedOut);
        assertEq((creator.balance - creatorFeesBefore) / 1e12, expectedCreatorFee);
        assertEq((treasury.balance - platformFeesBefore) / 1e12, expectedPlatformFee);
        assertEq((rewardsTreasury.balance - rewardsFeesBefore) / 1e12, expectedRewardsFee);
    }

    function test_PoolOpeningPriceCloseToFinalCurvePrice() public {
        vm.prank(trader);
        assertGt(curve.buy{value: 100_000e18}(0, trader), 0);

        assertTrue(curve.graduated());
        uint256 curveGradPrice = curve.graduationPrice();

        address pool = curve.graduationPool();
        WafflesAmmPair pair = WafflesAmmPair(pool);
        (uint256 r0, uint256 r1) = pair.getReserves();
        bool usdcIs0 = pair.token0() == address(usdc);
        (uint256 usdcR, uint256 tokenR) = usdcIs0 ? (r0, r1) : (r1, r0);

        uint256 poolPrice = Math.mulDiv(usdcR, 1e30, tokenR);

        uint256 diff = poolPrice > curveGradPrice ? poolPrice - curveGradPrice : curveGradPrice - poolPrice;
        uint256 tolerance = curveGradPrice / 20;
        assertLe(diff, tolerance, "pool opening price should be within 5% of curve graduation price");
    }

    function test_DonatedTokensExcludedFromMigration() public {
        vm.prank(trader);
        uint256 bought = curve.buy{value: 100e18}(0, trader);
        vm.prank(trader);
        assertTrue(token.transfer(address(curve), bought / 2));
        vm.prank(trader);
        assertGt(curve.buy{value: 100_000e18}(0, trader), 0);

        assertTrue(curve.graduated());
        address pool = curve.graduationPool();

        uint256 poolTokens = token.balanceOf(pool);
        assertEq(poolTokens, LIQUIDITY_RESERVE, "pool should have exactly liquidityTokenReserve");

        uint256 lockedInCurve = token.balanceOf(address(curve));
        assertEq(lockedInCurve, bought / 2, "donated tokens should remain locked");
    }

    function test_AttackerCannotPrecreateGraduationPair() public {
        vm.prank(trader);
        vm.expectRevert(WafflesAmmFactory.Unauthorized.selector);
        address pool = ammFactory.createPair(address(token), address(usdc), creator);
        assertEq(pool, address(0));
    }

    function test_AttackerCannotCallMigrator() public {
        vm.prank(trader);
        vm.expectRevert(WafflesAmmMigrator.Unauthorized.selector);
        address pool = migrator.migrate(address(token), 1, 1);
        assertEq(pool, address(0));
    }
}
