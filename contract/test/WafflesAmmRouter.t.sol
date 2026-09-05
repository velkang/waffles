// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesMemeToken} from "../src/WafflesMemeToken.sol";
import {WafflesAmmFactory} from "../src/amm/WafflesAmmFactory.sol";
import {WafflesAmmPair} from "../src/amm/WafflesAmmPair.sol";
import {WafflesAmmRouter} from "../src/amm/WafflesAmmRouter.sol";

contract WafflesAmmRouterTest is Test {
    MockUSDC usdc;
    WafflesMemeToken token;
    WafflesAmmFactory factory;
    WafflesAmmPair pair;
    WafflesAmmRouter router;
    address trader;
    address creator;
    address treasury;
    address rewardsTreasury;

    function setUp() public {
        trader = makeAddr("trader");
        creator = makeAddr("creator");
        treasury = makeAddr("treasury");
        rewardsTreasury = makeAddr("rewardsTreasury");
        usdc = new MockUSDC();
        token = new WafflesMemeToken("Arc", "ARC", 1_000_000_000 ether, address(this));
        factory = new WafflesAmmFactory(address(usdc), treasury, rewardsTreasury);
        factory.setPairCreator(address(this));
        pair = WafflesAmmPair(factory.createPair(address(token), address(usdc), creator));
        router = new WafflesAmmRouter(factory);

        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        vm.deal(address(this), 20_000 ether);
        pair.depositUsdc{value: 20_000e18}();
        assertGt(pair.mint(address(0xdead)), 0);

        vm.deal(trader, 10_000 ether);
        assertTrue(token.transfer(trader, 10_000_000 ether));

        vm.startPrank(trader);
        assertTrue(token.approve(address(router), type(uint256).max));
        vm.stopPrank();
    }

    function test_SwapUsdcForTokenAtomically() public {
        uint256 usdcIn = 100e6;
        uint256 quote = router.quoteExactInput(address(pair), address(usdc), usdcIn);
        assertGt(quote, 0);

        uint256 tokenBefore = token.balanceOf(trader);
        uint256 usdcBefore = trader.balance;

        vm.prank(trader);
        uint256 out =
            router.swapExactUsdcForTokens{value: usdcIn * 1e12}(address(pair), quote, trader, block.timestamp + 10);

        assertEq(out, quote);
        assertEq(token.balanceOf(trader) - tokenBefore, quote);
        assertEq((usdcBefore - trader.balance) / 1e12, usdcIn);
        assertEq(creator.balance, 700_000 * 1e12);
        assertEq(treasury.balance, 250_000 * 1e12);
        assertEq(rewardsTreasury.balance, 50_000 * 1e12);
    }

    function test_SwapUsdcRejectsNativeAmountBelowUsdcPrecision() public {
        vm.prank(trader);
        vm.expectRevert(WafflesAmmRouter.InvalidNativeUsdcAmount.selector);
        uint256 output = router.swapExactUsdcForTokens{value: 1}(address(pair), 0, trader, block.timestamp + 10);
        assertEq(output, 0);
    }

    function test_SwapTokenForUsdcAtomically() public {
        uint256 tokenIn = 1_000_000 ether;
        uint256 quote = router.quoteExactInput(address(pair), address(token), tokenIn);
        assertGt(quote, 0);

        uint256 tokenBefore = token.balanceOf(trader);
        uint256 usdcBefore = trader.balance;

        vm.prank(trader);
        uint256 out = router.swapExactTokensForTokens(
            address(pair), address(token), tokenIn, quote, trader, block.timestamp + 10
        );

        assertEq(out, quote);
        assertEq(tokenBefore - token.balanceOf(trader), tokenIn);
        assertEq((trader.balance - usdcBefore) / 1e12, quote);
        uint256 totalFee = (creator.balance + treasury.balance + rewardsTreasury.balance) / 1e12;
        assertGt(totalFee, 0);
        assertEq(creator.balance / 1e12, Math.mulDiv(totalFee, 7_000, 10_000));
        assertEq(treasury.balance / 1e12, Math.mulDiv(totalFee, 2_500, 10_000));
        assertEq(rewardsTreasury.balance / 1e12, totalFee - creator.balance / 1e12 - treasury.balance / 1e12);
    }

    function test_ExpiredSwapReverts() public {
        vm.warp(100);
        vm.prank(trader);
        vm.expectRevert(WafflesAmmRouter.Expired.selector);
        uint256 output = router.swapExactUsdcForTokens{value: 10e18}(address(pair), 0, trader, 99);
        assertEq(output, 0);
    }

    function test_FailedSwapRollsBackInputTransfer() public {
        uint256 usdcBefore = trader.balance;
        vm.prank(trader);
        vm.expectRevert(WafflesAmmRouter.Slippage.selector);
        uint256 output = router.swapExactUsdcForTokens{value: 100e18}(
            address(pair), type(uint256).max, trader, block.timestamp + 10
        );
        assertEq(output, 0);
        assertEq(trader.balance, usdcBefore);
    }
}
