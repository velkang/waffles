// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockMigrator} from "../src/mocks/MockMigrator.sol";
import {WafflesMemeToken} from "../src/WafflesMemeToken.sol";
import {WafflesBondingCurve} from "../src/WafflesBondingCurve.sol";
import {WafflesLaunchFactory} from "../src/WafflesLaunchFactory.sol";

contract WafflesBondingCurveTest is Test {
    MockUSDC usdc;
    MockMigrator migrator;
    WafflesLaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");

    uint256 constant INITIAL_VIRTUAL_USDC = 2_986e6;
    uint256 constant INITIAL_VIRTUAL_TOKENS = 1_060_569_000 ether;
    uint256 constant MIN_VIRTUAL_TOKENS = 251_660_441 ether;
    uint256 constant SELLABLE = INITIAL_VIRTUAL_TOKENS - MIN_VIRTUAL_TOKENS; // 808_908_559 ether
    uint256 constant LIQUIDITY_RESERVE = 1_000_000_000 ether - SELLABLE; // 191_091_441 ether
    uint256 constant FEE_BPS = 100; // 1%
    uint256 constant PROTOCOL_FEE_BPS = 7_500; // 75% of fee (0.75% total)

    WafflesMemeToken token;
    WafflesBondingCurve curve;

    function setUp() public {
        usdc = new MockUSDC();
        migrator = new MockMigrator(address(usdc));
        factory = new WafflesLaunchFactory(
            address(usdc),
            treasury,
            address(migrator),
            0,
            INITIAL_VIRTUAL_USDC,
            INITIAL_VIRTUAL_TOKENS,
            MIN_VIRTUAL_TOKENS,
            FEE_BPS,
            PROTOCOL_FEE_BPS
        );

        vm.prank(creator);
        (address tokenAddr, address curveAddr) = factory.createToken(
            "Ghost",
            "GHOST",
            "desc",
            "uri",
            "site",
            "tw",
            "tg"
        );
        token = WafflesMemeToken(tokenAddr);
        curve = WafflesBondingCurve(curveAddr);

        usdc.mint(trader, 1_000_000e6);
        vm.prank(trader);
        usdc.approve(address(curve), type(uint256).max);
        vm.prank(trader);
        token.approve(address(curve), type(uint256).max);
    }

    // ========== DEPLOYMENT ==========

    function test_Deployment() public view {
        assertEq(token.balanceOf(address(curve)), 1_000_000_000 ether);
        assertEq(curve.sellableTokens(), SELLABLE);
        assertEq(curve.graduationProgressBps(), 0);
        assertFalse(curve.graduated());
        assertGt(curve.currentPrice(), 0);
        assertGt(curve.marketCap(), 0);
        assertEq(curve.virtualUsdcReserve(), INITIAL_VIRTUAL_USDC);
        assertEq(curve.virtualTokenReserve(), INITIAL_VIRTUAL_TOKENS);
        assertEq(curve.liquidityTokenReserve(), LIQUIDITY_RESERVE);
        assertEq(curve.PRICE_SCALE(), 1e18);
    }

    // ========== PRICE & MARKET CAP ==========

    function test_ExactInitialPriceAndMarketCap() public view {
        uint256 mcap = curve.marketCap();
        assertApproxEqAbs(mcap, 2_816e6, 5e6, "initial mcap should be ~$2,816");

        uint256 price = curve.currentPrice();
        assertEq(
            price,
            2_815_469_809_130,
            "initial price should retain 18-decimal USD precision"
        );
        assertEq(curve.graduationMarketCapTarget(), 50_003_318_268);
    }

    function test_ExactCompletionMarketCap() public {
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertTrue(curve.graduated(), "should have graduated");
        assertApproxEqAbs(
            curve.graduationMarketCap(),
            50_000e6,
            500e6,
            "graduation mcap should be ~$50,000"
        );
    }

    // ========== BUY ==========

    function test_Buy() public {
        vm.prank(trader);
        uint256 bought = curve.buy(100e6, 0);

        assertGt(bought, 0);
        assertEq(token.balanceOf(trader), bought);
        assertEq(curve.sellableTokens(), SELLABLE - bought);
        assertGt(curve.graduationProgressBps(), 0);

        uint256 fee = (100e6 * FEE_BPS) / 10_000;
        uint256 protoFee = (fee * PROTOCOL_FEE_BPS) / 10_000;
        assertEq(usdc.balanceOf(treasury), protoFee);
        assertEq(curve.creatorEarnings(creator), fee - protoFee);
    }

    function test_PriceRisesAfterBuy() public {
        uint256 p0 = curve.currentPrice();
        vm.prank(trader);
        curve.buy(500e6, 0);
        uint256 p1 = curve.currentPrice();
        assertGt(p1, p0);
    }

    function test_PriceFallsAfterSell() public {
        vm.prank(trader);
        uint256 bought = curve.buy(500e6, 0);
        uint256 pricePeak = curve.currentPrice();

        vm.prank(trader);
        curve.sell(bought / 2, 0);
        uint256 priceAfter = curve.currentPrice();

        assertLt(priceAfter, pricePeak, "price should fall after sell");
    }

    // ========== BUY/SELL ROUND-TRIP ==========

    function test_BuySellRoundTrip() public {
        uint256 traderUsdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 bought = curve.buy(1_000e6, 0);

        vm.prank(trader);
        uint256 received = curve.sell(bought, 0);

        uint256 traderUsdcAfter = usdc.balanceOf(trader);
        assertLt(traderUsdcAfter, traderUsdcBefore);
        assertGt(received, 900e6);
    }

    // ========== INVARIANT PRESERVATION ==========

    function test_BuySellInvariantPreservation() public {
        uint256 k0 = curve.virtualUsdcReserve() * curve.virtualTokenReserve();

        vm.prank(trader);
        uint256 bought = curve.buy(2_000e6, 0);

        uint256 kAfterBuy = curve.virtualUsdcReserve() *
            curve.virtualTokenReserve();
        // k should stay >= k0 due to ceiling rounding
        assertGe(kAfterBuy, k0, "k should not decrease after buy");

        vm.prank(trader);
        curve.sell(bought / 2, 0);

        uint256 kAfterSell = curve.virtualUsdcReserve() *
            curve.virtualTokenReserve();
        assertGe(kAfterSell, k0, "k should not decrease after sell");
    }

    // ========== DRAINING BUY ==========

    function test_FinalBuyCappingAndRefund() public {
        uint256 balBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 bought = curve.buy(100_000e6, 0);

        assertEq(
            bought,
            SELLABLE,
            "draining buy should output exactly sellable tokens"
        );
        assertTrue(curve.graduated(), "should have graduated");

        uint256 consumed = balBefore - usdc.balanceOf(trader);
        assertLt(consumed, 100_000e6, "should have refunded excess USDC");
    }

    function test_QuoteBuyCappedAtSellable() public view {
        uint256 out = curve.quoteBuy(1_000_000e6);
        assertEq(out, SELLABLE);
    }

    // ========== PROGRESS ==========

    function test_ProgressFromVirtualReserves() public {
        assertEq(
            curve.graduationProgressBps(),
            0,
            "initial progress should be 0"
        );

        vm.prank(trader);
        curve.buy(500e6, 0);
        uint256 prog = curve.graduationProgressBps();
        assertGt(prog, 0, "progress should increase after buy");
        assertLt(prog, 10_000, "progress should be less than 100%");

        uint256 sold = INITIAL_VIRTUAL_TOKENS - curve.virtualTokenReserve();
        uint256 total = INITIAL_VIRTUAL_TOKENS - MIN_VIRTUAL_TOKENS;
        uint256 expected = Math.mulDiv(sold, 10_000, total);
        assertEq(prog, expected, "progress should match formula");
    }

    // ========== GRADUATION ==========

    function test_GraduationOnlyAtMinReserve() public {
        // Before graduation
        assertFalse(curve.canGraduate());
        vm.expectRevert(WafflesBondingCurve.ThresholdNotReached.selector);
        curve.graduate();

        vm.prank(trader);
        curve.buy(1_000e6, 0);
        assertFalse(
            curve.canGraduate(),
            "should not graduate after partial buy"
        );

        vm.prank(trader);
        curve.buy(100_000e6, 0);
        assertTrue(curve.graduated());
        assertEq(
            curve.virtualTokenReserve(),
            MIN_VIRTUAL_TOKENS,
            "should be at min reserve"
        );
    }

    function test_GraduationOnCrossingBuy() public {
        vm.recordLogs();
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertTrue(curve.graduated());
        assertGt(curve.graduationPrice(), 0);
        assertGt(curve.graduationMarketCap(), 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 signature = keccak256(
            "Graduated(address,address,uint256,uint256)"
        );
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length == 3 && logs[i].topics[0] == signature) {
                assertEq(logs[i].emitter, address(curve));
                assertEq(
                    logs[i].topics[2],
                    bytes32(uint256(uint160(address(token))))
                );
                (uint256 price, uint256 mcap) = abi.decode(
                    logs[i].data,
                    (uint256, uint256)
                );
                assertEq(price, curve.graduationPrice());
                assertEq(mcap, curve.graduationMarketCap());
                found = true;
                break;
            }
        }
        assertTrue(found, "enriched Graduated event not emitted");
    }

    // ========== DONATION IMMUNITY ==========

    function test_DonatedTokensNoEffect() public {
        vm.prank(trader);
        uint256 bought = curve.buy(100e6, 0);

        uint256 priceAfterBuy = curve.currentPrice();
        uint256 mcapAfterBuy = curve.marketCap();
        uint256 progressAfterBuy = curve.graduationProgressBps();

        vm.prank(trader);
        token.transfer(address(curve), bought / 2);

        assertEq(
            curve.currentPrice(),
            priceAfterBuy,
            "price should not change from donation"
        );
        assertEq(
            curve.marketCap(),
            mcapAfterBuy,
            "mcap should not change from donation"
        );
        assertEq(
            curve.graduationProgressBps(),
            progressAfterBuy,
            "progress should not change from donation"
        );
    }

    function test_DonatedUsdcNoEffect() public {
        vm.prank(trader);
        curve.buy(100e6, 0);

        uint256 priceBefore = curve.currentPrice();
        uint256 mcapBefore = curve.marketCap();

        usdc.mint(address(curve), 10_000e6);

        assertEq(
            curve.currentPrice(),
            priceBefore,
            "price should not change from USDC donation"
        );
        assertEq(
            curve.marketCap(),
            mcapBefore,
            "mcap should not change from USDC donation"
        );
    }

    function test_DonatedTokensNotInMigration() public {
        vm.prank(trader);
        uint256 bought = curve.buy(100e6, 0);
        vm.prank(trader);
        token.transfer(address(curve), bought / 2);

        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertTrue(curve.graduated());

        uint256 migratedTokens = migrator.totalMigratedTokens();
        assertEq(
            migratedTokens,
            LIQUIDITY_RESERVE,
            "migrated tokens should be exactly liquidityTokenReserve"
        );

        uint256 lockedTokens = token.balanceOf(address(curve));
        assertEq(
            lockedTokens,
            bought / 2,
            "donated tokens should remain locked in curve"
        );
    }

    // ========== EXCESSIVE SELL ==========

    function test_SellCannotExceedInitialReserve() public {
        vm.prank(trader);
        uint256 bought = curve.buy(100e6, 0);
        vm.expectRevert(WafflesBondingCurve.ExcessiveSell.selector);
        curve.quoteSell(bought + 1 ether);
    }

    // ========== FEES ==========

    function test_ClaimCreatorFees() public {
        vm.prank(trader);
        curve.buy(1_000e6, 0);

        uint256 earned = curve.creatorEarnings(creator);
        assertGt(earned, 0);

        vm.prank(creator);
        curve.claimCreatorFees();

        assertEq(usdc.balanceOf(creator), earned);
        assertEq(curve.creatorEarnings(creator), 0);
    }

    // ========== SLIPPAGE ==========

    function test_BuySlippageReverts() public {
        uint256 quote = curve.quoteBuy(100e6);
        vm.prank(trader);
        vm.expectRevert(WafflesBondingCurve.Slippage.selector);
        curve.buy(100e6, quote + 1);
    }

    // ========== FUZZ ==========

    function testFuzz_BuySellInvariant(uint128 usdcIn) public {
        vm.assume(usdcIn >= 1e6 && usdcIn <= 10_000e6);
        usdc.mint(trader, usdcIn);

        vm.startPrank(trader);
        uint256 bought = curve.buy(usdcIn, 0);
        assertGt(bought, 0);
        assertLe(bought, SELLABLE);

        if (!curve.graduated()) {
            uint256 back = curve.sell(bought, 0);
            assertLt(back, usdcIn);
        }
        vm.stopPrank();
    }
}
