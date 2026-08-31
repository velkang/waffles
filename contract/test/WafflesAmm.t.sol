// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesMemeToken} from "../src/WafflesMemeToken.sol";
import {WafflesAmmFactory} from "../src/amm/WafflesAmmFactory.sol";
import {WafflesAmmPair} from "../src/amm/WafflesAmmPair.sol";

contract WafflesAmmTest is Test {
    MockUSDC usdc;
    WafflesMemeToken token;
    WafflesAmmFactory factory;
    WafflesAmmPair pair;

    address alice = makeAddr("alice");
    address creator = makeAddr("creator");
    address treasury = makeAddr("treasury");
    address rewardsTreasury = makeAddr("rewardsTreasury");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant FEE_DENOM = 10_000;
    uint256 constant FEE_NUM = 9_900; // 1% fee

    function setUp() public {
        usdc = new MockUSDC();
        token = new WafflesMemeToken("A", "A", 1_000_000_000 ether, address(this));
        factory = new WafflesAmmFactory(address(usdc), treasury, rewardsTreasury);
        factory.setPairCreator(address(this));
        pair = WafflesAmmPair(factory.createPair(address(token), address(usdc), creator));

        assertTrue(token.transfer(alice, 50_000_000 ether));
        usdc.mint(alice, 10_000e6);
        vm.startPrank(alice);
        token.approve(address(pair), type(uint256).max);
        usdc.approve(address(pair), type(uint256).max);
        vm.stopPrank();
    }

    function test_CreatePair() public view {
        assertEq(factory.getPair(address(token), address(usdc)), address(pair));
        assertEq(factory.getPair(address(usdc), address(token)), address(pair));
        assertEq(factory.allPairsLength(), 1);
        assertEq(pair.factory(), address(factory));
        assertEq(pair.creator(), creator);
        assertEq(pair.treasury(), treasury);
        assertEq(pair.rewardsTreasury(), rewardsTreasury);
    }

    function test_RewardsTreasuryMustDifferFromPlatformTreasury() public {
        vm.expectRevert(WafflesAmmFactory.ZeroAddress.selector);
        new WafflesAmmFactory(address(usdc), treasury, treasury);
    }

    function test_MintFirstLiquidity() public {
        uint256 tokenAmount = 200_000_000 ether;
        uint256 usdcAmount = 20_000e6;

        assertTrue(token.transfer(address(pair), tokenAmount));
        usdc.mint(address(pair), usdcAmount);

        uint256 liquidity = pair.mint(address(this));
        uint256 expectedLiquidity = Math.sqrt(tokenAmount * usdcAmount) - pair.MINIMUM_LIQUIDITY();

        assertEq(liquidity, expectedLiquidity);
        assertEq(pair.balanceOf(address(this)), expectedLiquidity);
        assertEq(pair.balanceOf(DEAD), pair.MINIMUM_LIQUIDITY());

        (uint256 r0, uint256 r1) = pair.getReserves();
        assertEq(r0 + r1, tokenAmount + usdcAmount);
    }

    function test_MintProportional() public {
        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(this));

        vm.startPrank(alice);
        assertTrue(token.transfer(address(pair), 20_000_000 ether));
        assertTrue(usdc.transfer(address(pair), 2_000e6));
        uint256 aliceLp = pair.mint(alice);
        vm.stopPrank();

        assertGt(aliceLp, 0);
    }

    function test_BurnRedeemsProRata() public {
        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        uint256 lp = pair.mint(address(this));

        assertTrue(pair.transfer(address(pair), lp));
        (uint256 a0, uint256 a1) = pair.burn(address(this));

        assertGt(a0, 0);
        assertGt(a1, 0);
    }

    function test_SwapExactIn() public {
        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(this));

        address t0 = pair.token0();
        bool usdcIsToken0 = t0 == address(usdc);

        uint256 usdcIn = 100e6;
        usdc.mint(address(pair), usdcIn);

        (uint256 r0, uint256 r1) = pair.getReserves();
        (uint256 rIn, uint256 rOut) = usdcIsToken0 ? (r0, r1) : (r1, r0);

        uint256 expectedOut = (usdcIn * FEE_NUM * rOut) / (rIn * FEE_DENOM + usdcIn * FEE_NUM);

        if (usdcIsToken0) {
            pair.swap(0, expectedOut, alice);
        } else {
            pair.swap(expectedOut, 0, alice);
        }

        assertEq(token.balanceOf(alice), 50_000_000 ether + expectedOut);
        uint256 fee = (usdcIn * pair.FEE_BPS()) / FEE_DENOM;
        uint256 creatorFee = (fee * pair.CREATOR_FEE_SHARE_BPS()) / FEE_DENOM;
        uint256 platformFee = (fee * pair.PLATFORM_FEE_SHARE_BPS()) / FEE_DENOM;
        assertEq(usdc.balanceOf(creator), creatorFee);
        assertEq(usdc.balanceOf(treasury), platformFee);
        assertEq(usdc.balanceOf(rewardsTreasury), fee - creatorFee - platformFee);
    }

    function test_SwapGreedyOutputReverts() public {
        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(this));

        usdc.mint(address(pair), 100e6);
        bool usdcIsToken0 = pair.token0() == address(usdc);

        (uint256 r0, uint256 r1) = pair.getReserves();
        uint256 rOut = usdcIsToken0 ? r1 : r0;

        vm.expectRevert(WafflesAmmPair.K.selector);
        if (usdcIsToken0) {
            pair.swap(0, rOut - 1, alice);
        } else {
            pair.swap(rOut - 1, 0, alice);
        }
    }

    function testFuzz_SwapPreservesInvariant(uint128 usdcIn) public {
        vm.assume(usdcIn >= 1e6 && usdcIn <= 5_000e6);

        assertTrue(token.transfer(address(pair), 200_000_000 ether));
        usdc.mint(address(pair), 20_000e6);
        pair.mint(address(this));

        (uint256 r0Before, uint256 r1Before) = pair.getReserves();
        uint256 kBefore = r0Before * r1Before;

        bool usdcIsToken0 = pair.token0() == address(usdc);
        (uint256 rIn, uint256 rOut) = usdcIsToken0 ? (r0Before, r1Before) : (r1Before, r0Before);

        usdc.mint(address(pair), usdcIn);
        uint256 amountOut = (uint256(usdcIn) * FEE_NUM * rOut) / (rIn * FEE_DENOM + uint256(usdcIn) * FEE_NUM);

        if (usdcIsToken0) {
            pair.swap(0, amountOut, alice);
        } else {
            pair.swap(amountOut, 0, alice);
        }

        (uint256 r0After, uint256 r1After) = pair.getReserves();
        uint256 kAfter = r0After * r1After;
        assertGe(kAfter, kBefore);
    }
}
