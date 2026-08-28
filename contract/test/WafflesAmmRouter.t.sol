// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
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
    address trader = makeAddr("trader");

    function setUp() public {
        usdc = new MockUSDC();
        token = new WafflesMemeToken("Arc", "ARC", 1_000_000_000 ether, address(this));
        factory = new WafflesAmmFactory();
        factory.setPairCreator(address(this));
        pair = WafflesAmmPair(factory.createPair(address(token), address(usdc)));
        router = new WafflesAmmRouter(factory);

        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(0xdead));

        usdc.mint(trader, 10_000e6);
        assertTrue(token.transfer(trader, 10_000_000 ether));

        vm.startPrank(trader);
        usdc.approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function test_SwapUsdcForTokenAtomically() public {
        uint256 usdcIn = 100e6;
        uint256 quote = router.quoteExactInput(address(pair), address(usdc), usdcIn);
        assertGt(quote, 0);

        uint256 tokenBefore = token.balanceOf(trader);
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 out =
            router.swapExactTokensForTokens(address(pair), address(usdc), usdcIn, quote, trader, block.timestamp + 10);

        assertEq(out, quote);
        assertEq(token.balanceOf(trader) - tokenBefore, quote);
        assertEq(usdcBefore - usdc.balanceOf(trader), usdcIn);
    }

    function test_SwapTokenForUsdcAtomically() public {
        uint256 tokenIn = 1_000_000 ether;
        uint256 quote = router.quoteExactInput(address(pair), address(token), tokenIn);
        assertGt(quote, 0);

        uint256 tokenBefore = token.balanceOf(trader);
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256 out = router.swapExactTokensForTokens(
            address(pair), address(token), tokenIn, quote, trader, block.timestamp + 10
        );

        assertEq(out, quote);
        assertEq(tokenBefore - token.balanceOf(trader), tokenIn);
        assertEq(usdc.balanceOf(trader) - usdcBefore, quote);
    }

    function test_ExpiredSwapReverts() public {
        vm.warp(100);
        vm.prank(trader);
        vm.expectRevert(WafflesAmmRouter.Expired.selector);
        router.swapExactTokensForTokens(address(pair), address(usdc), 10e6, 0, trader, 99);
    }

    function test_FailedSwapRollsBackInputTransfer() public {
        uint256 usdcBefore = usdc.balanceOf(trader);
        vm.prank(trader);
        vm.expectRevert(WafflesAmmRouter.Slippage.selector);
        router.swapExactTokensForTokens(
            address(pair), address(usdc), 100e6, type(uint256).max, trader, block.timestamp + 10
        );
        assertEq(usdc.balanceOf(trader), usdcBefore);
    }
}
