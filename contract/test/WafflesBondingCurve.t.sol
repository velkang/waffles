// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
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

    uint256 constant VIRTUAL_USDC = 6_667e6; // ~$6,667 virtual USDC
    uint256 constant VIRTUAL_TOKENS = 2e26;
    uint256 constant RESERVE = 200_000_000 ether;
    uint256 constant SELLABLE = 800_000_000 ether;
    uint256 constant GRADUATION_MCAP = 50_000e6; // $50k
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
            VIRTUAL_USDC,
            VIRTUAL_TOKENS,
            GRADUATION_MCAP,
            FEE_BPS,
            PROTOCOL_FEE_BPS
        );

        vm.prank(creator);
        (address tokenAddr, address curveAddr) =
            factory.createToken("Ghost", "GHOST", "desc", "uri", "site", "tw", "tg");
        token = WafflesMemeToken(tokenAddr);
        curve = WafflesBondingCurve(curveAddr);

        usdc.mint(trader, 1_000_000e6);
        vm.prank(trader);
        usdc.approve(address(curve), type(uint256).max);
        vm.prank(trader);
        token.approve(address(curve), type(uint256).max);
    }

    function test_Deployment() public view {
        assertEq(token.balanceOf(address(curve)), 1_000_000_000 ether);
        assertEq(curve.sellableTokens(), SELLABLE);
        assertEq(curve.graduationProgressBps(), 0);
        assertFalse(curve.graduated());
        assertGt(curve.currentPrice(), 0);
        assertGt(curve.marketCap(), 0);
    }

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
        uint256 pPeak = curve.currentPrice();

        vm.prank(trader);
        curve.sell(bought / 2, 0);
        uint256 pAfter = curve.currentPrice();

        assertLt(pAfter, pPeak);
    }

    function test_BuySellRoundTrip() public {
        uint256 traderUsdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 bought = curve.buy(1_000e6, 0);

        vm.prank(trader);
        uint256 received = curve.sell(bought, 0);

        uint256 traderUsdcAfter = usdc.balanceOf(trader);
        assertLt(traderUsdcAfter, traderUsdcBefore);
        assertGt(received, 900e6);
        assertEq(token.balanceOf(address(curve)), 1_000_000_000 ether);
    }

    function test_QuoteBuyCappedAtSellable() public view {
        uint256 out = curve.quoteBuy(1_000_000e6);
        assertEq(out, SELLABLE);
    }

    function test_BuyCannotDrainReserve() public {
        vm.prank(trader);
        uint256 bought = curve.buy(100_000e6, 0);

        assertEq(bought, SELLABLE);
        assertEq(token.balanceOf(address(curve)), 0);
        assertTrue(curve.graduated());
    }

    function test_GraduationProgressTracksDrain() public {
        assertEq(curve.graduationProgressBps(), 0);

        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertEq(curve.graduationProgressBps(), 10_000);
    }

    function test_GraduateBeforeThresholdReverts() public {
        vm.expectRevert(WafflesBondingCurve.ThresholdNotReached.selector);
        curve.graduate();
    }

    function test_GraduationOnCrossingBuy() public {
        vm.recordLogs();
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertTrue(curve.graduated());
        assertEq(curve.graduationPool(), address(0));
        assertGt(curve.graduationPrice(), 0);
        assertGt(curve.graduationMarketCap(), 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 signature = keccak256("Graduated(address,address,uint256,uint256)");
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length == 3 && logs[i].topics[0] == signature) {
                assertEq(logs[i].emitter, address(curve));
                assertEq(logs[i].topics[1], bytes32(0));
                assertEq(logs[i].topics[2], bytes32(uint256(uint160(address(token)))));
                (uint256 price, uint256 marketCap) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(price, curve.graduationPrice());
                assertEq(marketCap, curve.graduationMarketCap());
                found = true;
                break;
            }
        }
        assertTrue(found, "enriched Graduated event not emitted");
    }

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

    function test_BuySlippageReverts() public {
        uint256 quote = curve.quoteBuy(100e6);
        vm.prank(trader);
        vm.expectRevert(WafflesBondingCurve.Slippage.selector);
        curve.buy(100e6, quote + 1);
    }

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
