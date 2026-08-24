// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockMigrator} from "../src/mocks/MockMigrator.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";

contract BondingCurveTest is Test {
    MockUSDC usdc;
    MockMigrator migrator;
    LaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");

    // Matches deploy defaults. Full supply (1B) sits on the curve; 200M is a
    // non-sellable reserve. Completion (balance = reserve) reads
    // 7.5x v_u ~= $50k mcap, which crosses the $50k threshold exactly at
    // completion; the seeded pool then opens at 2x v_u / 20% supply ~= $66.7k.
    uint256 constant VIRTUAL_USDC = 6_667e6; // ~$6,667 virtual USDC
    uint256 constant VIRTUAL_TOKENS = 2e26;
    uint256 constant RESERVE = 200_000_000 ether;
    uint256 constant SELLABLE = 800_000_000 ether;
    uint256 constant GRADUATION_MCAP = 50_000e6; // $50k
    uint256 constant FEE_BPS = 100; // 1%
    uint256 constant PROTOCOL_FEE_BPS = 7_500; // 0.75% of volume
    uint256 constant CREATION_FEE = 1e6; // $1

    MemeToken token;
    BondingCurve curve;

    function setUp() public {
        usdc = new MockUSDC();
        migrator = new MockMigrator(address(usdc));
        factory = new LaunchFactory(
            address(usdc),
            treasury,
            address(migrator),
            CREATION_FEE,
            VIRTUAL_USDC,
            VIRTUAL_TOKENS,
            GRADUATION_MCAP,
            FEE_BPS,
            PROTOCOL_FEE_BPS
        );
        usdc.mint(trader, 10_000_000e6);
        usdc.mint(creator, 1_000e6);
        vm.startPrank(trader);
        usdc.approve(address(factory), type(uint256).max);
        usdc.approve(address(this), type(uint256).max);
        vm.stopPrank();

        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);

        (address t, address c) = _createToken();
        token = MemeToken(t);
        curve = BondingCurve(c);

        vm.prank(trader);
        usdc.approve(address(curve), type(uint256).max);
    }

    function _createToken() internal returns (address, address) {
        vm.prank(creator);
        (address t, address c) = factory.createToken("Ghost", "GHOST", "d", "img", "", "", "");
        return (t, c);
    }

    // ---------- deployment ----------

    function test_Deployment() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
        // Entire supply is held by the curve; 200M of it is the reserve.
        assertEq(token.balanceOf(address(curve)), 1_000_000_000 ether);
        assertEq(curve.reserveTokens(), RESERVE);
        assertEq(curve.sellableTokens(), SELLABLE);
        assertEq(address(curve.token()), address(token));
        assertEq(curve.creator(), creator);
        assertEq(curve.graduated(), false);
        // initial mcap = v_u * totalSupply / (v_t + supply) ~= $5,556
        assertApproxEqRel(curve.marketCap(), 5_556e6, 1e15);
        assertEq(curve.currentPrice(), 5);
        assertEq(curve.graduationProgressBps(), 0);
    }

    // ---------- buy ----------

    function test_Buy() public {
        uint256 quoted = curve.quoteBuy(100e6);
        assertGt(quoted, 0);

        vm.prank(trader);
        uint256 got = curve.buy(100e6, quoted);

        assertEq(got, quoted);
        assertEq(token.balanceOf(trader), quoted);
        assertEq(usdc.balanceOf(treasury), CREATION_FEE + 75e4); // $0.75 fee
        assertEq(curve.creatorEarnings(creator), 25e4); // $0.25 fee
        assertEq(curve.reserveUsdc(), 99e6);
    }

    function test_BuySlippageReverts() public {
        vm.prank(trader);
        vm.expectRevert(BondingCurve.Slippage.selector);
        curve.buy(100e6, type(uint256).max);
    }

    function test_PriceRisesAfterBuy() public {
        uint256 p0 = curve.currentPrice();
        vm.prank(trader);
        curve.buy(1_000e6, 0);
        assertGt(curve.currentPrice(), p0);
        assertGt(curve.marketCap(), 5_556e6);
    }

    function test_QuoteBuyCappedAtSellable() public view {
        // A huge buy quotes only the sellable balance, never the reserve.
        assertEq(curve.quoteBuy(1_000_000e6), SELLABLE);
    }

    function test_BuyCannotDrainReserve() public {
        uint256 before = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 got = curve.buy(1_000_000e6, 0); // far more than needed

        // Drained exactly the sellable supply; the reserve migrated intact.
        assertEq(got, SELLABLE);
        assertEq(token.balanceOf(address(migrator)), RESERVE);
        assertEq(curve.sellableTokens(), 0);
        assertTrue(curve.graduated());
        assertApproxEqRel(curve.graduationMarketCap(), GRADUATION_MCAP, 1e14);
        assertEq(curve.graduationPrice(), 50);

        // Only the USDC needed to complete the curve is consumed; the rest is
        // refunded. Completing costs netIn = 2x v_u, grossed up by the fee.
        uint256 expectedConsumed = Math.mulDiv(2 * VIRTUAL_USDC, 10_000, 9_900, Math.Rounding.Ceil);
        assertEq(usdc.balanceOf(trader), before - expectedConsumed);

        // Curve closed after graduation.
        vm.prank(trader);
        vm.expectRevert(BondingCurve.CurveClosed.selector);
        curve.buy(1e6, 0);
    }

    // ---------- sell ----------

    function test_BuySellRoundTrip() public {
        vm.startPrank(trader);
        uint256 got = curve.buy(1_000e6, 0);
        token.approve(address(curve), type(uint256).max);

        uint256 quotedBack = curve.quoteSell(got);
        assertGt(quotedBack, 0);
        uint256 received = curve.sell(got, quotedBack);
        vm.stopPrank();

        assertEq(received, quotedBack);
        // Full round trip must lose money to fees + spread
        assertLt(received, 1_000e6);
        // Selling the full position drains nearly all reserves
        assertLe(curve.reserveUsdc(), 990e6 - received);
    }

    function test_PriceFallsAfterSell() public {
        vm.startPrank(trader);
        uint256 got = curve.buy(1_000e6, 0);
        token.approve(address(curve), type(uint256).max);
        uint256 mcapBefore = curve.marketCap();
        curve.sell(got / 2, 0);
        vm.stopPrank();
        assertLt(curve.marketCap(), mcapBefore);
    }

    // ---------- graduation ----------

    function test_GraduationOnCrossingBuy() public {
        // Buy repeatedly until the threshold is crossed
        uint256 spent;
        bool graduatedViaBuy = false;
        while (!curve.graduated() && spent < 2_000_000e6) {
            vm.prank(trader);
            curve.buy(10_000e6, 0);
            spent += 10_000e6;
            if (curve.graduated()) graduatedViaBuy = true;
        }
        assertTrue(graduatedViaBuy, "should graduate during a buy");
        assertTrue(curve.graduated());

        // The migrator receives the entire remaining balance: the 200M
        // reserve plus anything unsold, together with all raised USDC.
        assertEq(token.balanceOf(address(migrator)), 1_000_000_000 ether - token.balanceOf(trader));
        assertGe(token.balanceOf(address(migrator)), RESERVE);
        assertGt(usdc.balanceOf(address(migrator)), 0);
        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(curve.reserveUsdc(), 0);

        // Curve closed
        vm.prank(trader);
        vm.expectRevert(BondingCurve.CurveClosed.selector);
        curve.buy(1e6, 0);
    }

    function test_GraduationProgressTracksDrain() public {
        assertEq(curve.graduationProgressBps(), 0);

        vm.prank(trader);
        uint256 got = curve.buy(1_000e6, 0);
        assertEq(curve.graduationProgressBps(), Math.mulDiv(got, 10_000, SELLABLE));

        // Selling pushes progress back down (balance returns to the curve).
        vm.startPrank(trader);
        token.approve(address(curve), type(uint256).max);
        curve.sell(got, 0);
        vm.stopPrank();
        assertEq(curve.graduationProgressBps(), 0);
    }

    function test_GraduateBeforeThresholdReverts() public {
        vm.expectRevert(BondingCurve.ThresholdNotReached.selector);
        curve.graduate();
    }

    // ---------- fees ----------

    function test_ClaimCreatorFees() public {
        vm.prank(trader);
        curve.buy(1_000e6, 0); // creator earns 0.25% of $1000 = $2.50

        uint256 before = usdc.balanceOf(creator);
        vm.prank(creator);
        curve.claimCreatorFees();
        assertEq(usdc.balanceOf(creator) - before, 2.5e6);
        assertEq(curve.creatorEarnings(creator), 0);

        // Non-creator cannot claim
        vm.expectRevert(BondingCurve.NotCreator.selector);
        curve.claimCreatorFees();
    }

    // ---------- invariants ----------

    function testFuzz_BuySellInvariant(uint128 amountIn) public {
        amountIn = uint128(bound(amountIn, 1e6, 10_000e6));
        vm.startPrank(trader);
        token.approve(address(curve), type(uint256).max);
        uint256 got = curve.buy(amountIn, 0);
        // Full round trip must lose money to fees + spread
        uint256 back = curve.sell(got, 0);
        vm.stopPrank();
        assertLt(back, amountIn);
        // product of real+virtual reserves never drops below k
        (uint256 x, uint256 y) =
            (curve.virtualUsdc() + curve.reserveUsdc(), curve.virtualTokens() + token.balanceOf(address(curve)));
        assertGe(x * y, curve.k());
    }
}
