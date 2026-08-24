// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MemeToken} from "../src/MemeToken.sol";
import {AmmFactory} from "../src/amm/AmmFactory.sol";
import {AmmPair} from "../src/amm/AmmPair.sol";
import {AmmMigrator} from "../src/amm/AmmMigrator.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {LaunchFactory} from "../src/LaunchFactory.sol";

/// @notice End-to-end: create -> trade to completion on the curve -> the
///         reserve + raised USDC seed a real pool with the LP burned.
contract GraduationTest is Test {
    MockUSDC usdc;
    AmmFactory ammFactory;
    AmmMigrator migrator;
    LaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant VIRTUAL_USDC = 6_667e6;
    uint256 constant VIRTUAL_TOKENS = 2e26;
    uint256 constant GRADUATION_MCAP = 50_000e6;

    MemeToken token;
    BondingCurve curve;
    AmmPair pool;

    function setUp() public {
        usdc = new MockUSDC();
        ammFactory = new AmmFactory();
        migrator = new AmmMigrator(ammFactory, IERC20(usdc));
        factory = new LaunchFactory(
            address(usdc),
            treasury,
            address(migrator),
            1e6, // $1 creation fee
            VIRTUAL_USDC,
            VIRTUAL_TOKENS,
            GRADUATION_MCAP,
            100, // 1% trade fee
            7_500 // 75% of fees to protocol
        );

        usdc.mint(trader, 10_000_000e6);
        usdc.mint(creator, 1_000e6);
        vm.prank(creator);
        usdc.approve(address(factory), type(uint256).max);
        vm.startPrank(trader);
        usdc.approve(address(factory), type(uint256).max);
        usdc.approve(address(this), type(uint256).max);
        vm.stopPrank();

        vm.prank(creator);
        (address t, address c) = factory.createToken("Ghost", "GHOST", "d", "img", "", "", "");
        token = MemeToken(t);
        curve = BondingCurve(c);

        vm.prank(trader);
        usdc.approve(address(curve), type(uint256).max);

        // A single oversized buy drains the sellable supply, gets refunded the
        // excess USDC, and auto-graduates.
        vm.prank(trader);
        uint256 got = curve.buy(1_000_000e6, 0);
        assertEq(got, 800_000_000 ether);
        assertTrue(curve.graduated());

        pool = AmmPair(ammFactory.getPair(address(token), address(usdc)));
        assertTrue(address(pool) != address(0));
    }

    function _poolBalances() internal view returns (uint256 tokens, uint256 usdcAmount) {
        if (address(token) == pool.token0()) {
            (tokens, usdcAmount) = pool.getReserves();
        } else {
            (usdcAmount, tokens) = pool.getReserves();
        }
    }

    function test_PoolSeededWithReserveAndRaisedUsdc() public {
        (uint256 tokens, uint256 usdcAmount) = _poolBalances();

        // Token side = the 200M reserve exactly (curve sold out).
        assertEq(tokens, 200_000_000 ether);
        // USDC side = 2x v_u raised on the curve, net of the 1% fee.
        uint256 consumed = Math.mulDiv(2 * VIRTUAL_USDC, 10_000, 9_900, Math.Rounding.Ceil);
        assertEq(usdcAmount, consumed - consumed / 100);

        // Curve is emptied and closed.
        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(curve.reserveUsdc(), 0);
        vm.prank(trader);
        vm.expectRevert(BondingCurve.CurveClosed.selector);
        curve.buy(1e6, 0);

        // Pool opens at ~= $66.7k mcap (above the $50k graduation reading,
        // mirroring pump.fun's post-migration step-up).
        assertApproxEqRel(Math.mulDiv(usdcAmount, 1_000_000_000 ether, tokens), 66_670e6, 1e15);
    }

    function test_LiquidityPermanentlyBurned() public view {
        (uint256 tokens, uint256 usdcAmount) = _poolBalances();
        assertEq(pool.totalSupply(), Math.sqrt(tokens * usdcAmount));
        // Every LP token ever minted sits at the dead address.
        assertEq(pool.balanceOf(DEAD), pool.totalSupply());
        assertEq(pool.balanceOf(address(migrator)), 0);
    }

    function _poolSwapTokensForUsdc(address from, uint256 amountIn) internal returns (uint256 out) {
        (uint256 tokens, uint256 usdcAmount) = _poolBalances();
        out = (amountIn * 9_975 * usdcAmount) / (tokens * 10_000 + amountIn * 9_975);
        bool tokenIsToken0 = address(token) == pool.token0();
        vm.prank(from);
        assertTrue(token.transfer(address(pool), amountIn));
        pool.swap(tokenIsToken0 ? 0 : out, tokenIsToken0 ? out : 0, from);
    }

    function test_TradingContinuesOnPoolAfterGraduation() public {
        vm.prank(trader);
        token.approve(address(pool), type(uint256).max);

        (uint256 tokensBefore, uint256 usdcBefore) = _poolBalances();
        uint256 usdcBalanceBefore = usdc.balanceOf(trader);

        // Sell 1% of the token side for USDC; the fee grows the pool.
        uint256 out = _poolSwapTokensForUsdc(trader, tokensBefore / 100);
        assertGt(out, 0);
        assertEq(usdc.balanceOf(trader) - usdcBalanceBefore, out);

        (uint256 tokensAfter, uint256 usdcAfter) = _poolBalances();
        assertGt(tokensAfter * usdcAfter, tokensBefore * usdcBefore);
    }

    function test_MigratorReusesExistingPair() public {
        address pool1 = migrator.migrate(address(token), 0, 0);
        assertEq(pool1, address(pool));
        (uint256 tokens, uint256 usdcAmount) = _poolBalances();
        assertEq(tokens, 200_000_000 ether);
        assertGt(usdcAmount, 0);
    }
}
