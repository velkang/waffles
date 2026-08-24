// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {AmmFactory} from "../src/amm/AmmFactory.sol";
import {AmmPair} from "../src/amm/AmmPair.sol";
import {AmmRouter} from "../src/amm/AmmRouter.sol";

contract AmmRouterTest is Test {
    MockUSDC usdc;
    MemeToken token;
    AmmFactory factory;
    AmmPair pair;
    AmmRouter router;
    address trader = makeAddr("trader");

    function setUp() public {
        usdc = new MockUSDC();
        token = new MemeToken("Arc", "ARC", 1_000_000_000 ether, address(this));
        factory = new AmmFactory();
        pair = AmmPair(factory.createPair(address(token), address(usdc)));
        router = new AmmRouter(factory);

        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(0xdead));

        usdc.mint(trader, 1_000e6);
        assertTrue(token.transfer(trader, 1_000_000 ether));
        vm.startPrank(trader);
        usdc.approve(address(router), type(uint256).max);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function test_SwapUsdcForTokenAtomically() public {
        uint256 quote = router.quoteExactInput(address(pair), address(usdc), 100e6);
        uint256 before = token.balanceOf(trader);

        vm.prank(trader);
        uint256 out =
            router.swapExactTokensForTokens(address(pair), address(usdc), 100e6, quote, trader, block.timestamp);

        assertEq(out, quote);
        assertEq(token.balanceOf(trader) - before, quote);
    }

    function test_SwapTokenForUsdcAtomically() public {
        uint256 amountIn = 100_000 ether;
        uint256 quote = router.quoteExactInput(address(pair), address(token), amountIn);
        uint256 before = usdc.balanceOf(trader);

        vm.prank(trader);
        router.swapExactTokensForTokens(address(pair), address(token), amountIn, quote, trader, block.timestamp);

        assertEq(usdc.balanceOf(trader) - before, quote);
    }

    function test_FailedSwapRollsBackInputTransfer() public {
        uint256 beforeTrader = usdc.balanceOf(trader);
        uint256 beforePair = usdc.balanceOf(address(pair));

        vm.prank(trader);
        vm.expectRevert(AmmRouter.Slippage.selector);
        router.swapExactTokensForTokens(address(pair), address(usdc), 100e6, type(uint256).max, trader, block.timestamp);

        assertEq(usdc.balanceOf(trader), beforeTrader);
        assertEq(usdc.balanceOf(address(pair)), beforePair);
    }

    function test_ExpiredSwapReverts() public {
        vm.warp(2);
        vm.prank(trader);
        vm.expectRevert(AmmRouter.Expired.selector);
        router.swapExactTokensForTokens(address(pair), address(usdc), 100e6, 0, trader, 1);
    }
}
