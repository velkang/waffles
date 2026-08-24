// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {AmmFactory} from "../src/amm/AmmFactory.sol";
import {AmmPair} from "../src/amm/AmmPair.sol";

contract AmmTest is Test {
    MockUSDC usdc;
    MemeToken token;
    AmmFactory factory;
    AmmPair pair;

    address alice = makeAddr("alice");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant FEE_DENOM = 10_000;
    uint256 constant FEE_NUM = 9_975; // 0.25% swap fee

    function setUp() public {
        usdc = new MockUSDC();
        token = new MemeToken("A", "A", 1_000_000_000 ether, address(this));
        factory = new AmmFactory();
        pair = AmmPair(factory.createPair(address(token), address(usdc)));

        assertTrue(token.transfer(alice, 10_000_000 ether));
        usdc.mint(alice, 1_000_000e6);

        vm.startPrank(alice);
        token.approve(address(pair), type(uint256).max);
        usdc.approve(address(pair), type(uint256).max);
        vm.stopPrank();
    }

    function _seed(uint256 tokenAmount, uint256 usdcAmount) internal returns (uint256 liquidity) {
        vm.startPrank(alice);
        assertTrue(token.transfer(address(pair), tokenAmount));
        assertTrue(usdc.transfer(address(pair), usdcAmount));
        liquidity = pair.mint(alice);
        vm.stopPrank();
    }

    /// @notice Fee-adjusted amountOut for an exact-in swap (V2 formula).
    function _quote(IERC20 tokenIn, uint256 amountIn) internal view returns (uint256) {
        (uint256 r0, uint256 r1) = pair.getReserves();
        if (address(tokenIn) == pair.token0()) {
            return (amountIn * FEE_NUM * r1) / (r0 * FEE_DENOM + amountIn * FEE_NUM);
        }
        return (amountIn * FEE_NUM * r0) / (r1 * FEE_DENOM + amountIn * FEE_NUM);
    }

    function _swap(IERC20 tokenIn, uint256 amountIn, address to) internal returns (uint256 out) {
        out = _quote(tokenIn, amountIn);
        bool zeroForOne = address(tokenIn) == pair.token0();
        vm.prank(to);
        assertTrue(tokenIn.transfer(address(pair), amountIn));
        pair.swap(zeroForOne ? 0 : out, zeroForOne ? out : 0, to);
    }

    // ---------- factory ----------

    function test_CreatePair() public {
        (address t0, address t1) = (pair.token0(), pair.token1());
        assertTrue(t0 < t1);
        assertEq(factory.getPair(t0, t1), address(pair));
        assertEq(factory.getPair(t1, t0), address(pair));
        assertEq(factory.allPairsLength(), 1);

        vm.expectRevert(AmmFactory.IdenticalAddresses.selector);
        factory.createPair(address(token), address(token));

        vm.expectRevert(AmmFactory.PairExists.selector);
        factory.createPair(address(token), address(usdc));

        vm.expectRevert(AmmFactory.ZeroAddress.selector);
        factory.createPair(address(0), address(token));
    }

    // ---------- liquidity ----------

    function test_MintFirstLiquidity() public {
        uint256 liq = _seed(1_000_000 ether, 100_000e6);
        uint256 expected = Math.sqrt(1_000_000 ether * 100_000e6) - 1000;
        assertEq(liq, expected);
        assertEq(pair.totalSupply(), expected + 1000);
        // MINIMUM_LIQUIDITY locked forever at the dead address
        assertEq(pair.balanceOf(DEAD), 1000);
        assertEq(pair.balanceOf(alice), expected);
    }

    function test_MintProportional() public {
        _seed(1_000_000 ether, 100_000e6);
        uint256 ts = pair.totalSupply();

        vm.startPrank(alice);
        assertTrue(token.transfer(address(pair), 500_000 ether)); // same ratio as seed
        assertTrue(usdc.transfer(address(pair), 50_000e6));
        uint256 liq = pair.mint(alice);
        vm.stopPrank();

        // Half the existing supply is minted for half the liquidity.
        assertEq(liq, ts / 2);
        assertEq(pair.totalSupply(), ts + liq);
    }

    function test_BurnRedeemsProRata() public {
        uint256 liq = _seed(1_000_000 ether, 100_000e6);

        uint256 tokensBefore = token.balanceOf(alice);
        uint256 usdcBefore = usdc.balanceOf(alice);

        vm.startPrank(alice);
        assertTrue(pair.transfer(address(pair), liq));
        pair.burn(alice);
        vm.stopPrank();

        // Dead keeps only its dust share; alice redeems essentially everything.
        assertApproxEqRel(token.balanceOf(alice) - tokensBefore, 1_000_000 ether, 1e14);
        assertApproxEqRel(usdc.balanceOf(alice) - usdcBefore, 100_000e6, 1e14);
        assertEq(pair.totalSupply(), 1000); // only the locked minimum remains
    }

    // ---------- swapping ----------

    function test_SwapExactIn() public {
        _seed(1_000_000 ether, 100_000e6);

        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 out = _swap(token, 10_000 ether, alice);

        assertGt(out, 0);
        assertEq(usdc.balanceOf(alice) - usdcBefore, out);

        // The fee leaves the product of reserves strictly larger.
        (uint256 r0, uint256 r1) = pair.getReserves();
        assertGt(r0 * r1, 1_000_000 ether * 100_000e6);
    }

    function test_SwapGreedyOutputReverts() public {
        _seed(1_000_000 ether, 100_000e6);

        vm.startPrank(alice);
        assertTrue(token.transfer(address(pair), 10_000 ether));
        vm.stopPrank();

        // One unit more than the fair quote must violate the invariant.
        uint256 greedy = _quote(token, 10_000 ether) + 1;
        bool zeroForOne = address(token) == pair.token0();
        vm.expectRevert(AmmPair.K.selector);
        pair.swap(zeroForOne ? 0 : greedy, zeroForOne ? greedy : 0, alice);
    }

    function testFuzz_SwapPreservesInvariant(uint128 tokenIn) public {
        tokenIn = uint128(bound(tokenIn, 1e18, 50_000 ether));
        _seed(1_000_000 ether, 100_000e6);

        uint256 out = _swap(token, uint256(tokenIn), alice);
        assertGt(out, 0);

        (uint256 r0, uint256 r1) = pair.getReserves();
        assertGe(r0 * r1, 1_000_000 ether * 100_000e6);
    }
}
