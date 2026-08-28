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

/// @notice End-to-end: create -> trade to completion on the curve -> the
///         reserve + raised USDC seed a real pool with the LP burned.
contract WafflesGraduationTest is Test {
    MockUSDC usdc;
    WafflesAmmFactory ammFactory;
    WafflesAmmMigrator migrator;
    WafflesLaunchFactory factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 constant VIRTUAL_USDC = 6_667e6;
    uint256 constant VIRTUAL_TOKENS = 2e26;
    uint256 constant GRADUATION_MCAP = 50_000e6;
    uint256 constant FEE_BPS = 100;
    uint256 constant PROTOCOL_FEE_BPS = 7_500;

    WafflesMemeToken token;
    WafflesBondingCurve curve;

    function setUp() public {
        usdc = new MockUSDC();
        ammFactory = new WafflesAmmFactory();
        migrator = new WafflesAmmMigrator(ammFactory, IERC20(usdc));
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
        ammFactory.setPairCreator(address(migrator));
        migrator.setLaunchFactory(address(factory));

        vm.prank(creator);
        (address tokenAddr, address curveAddr) = factory.createToken("Grad", "GRAD", "grad", "uri", "site", "tw", "tg");
        token = WafflesMemeToken(tokenAddr);
        curve = WafflesBondingCurve(curveAddr);

        usdc.mint(trader, 1_000_000e6);
        vm.prank(trader);
        usdc.approve(address(curve), type(uint256).max);
        vm.prank(trader);
        token.approve(address(curve), type(uint256).max);
    }

    function test_PoolSeededWithReserveAndRaisedUsdc() public {
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        assertTrue(curve.graduated());
        address pool = curve.graduationPool();
        assertTrue(pool != address(0));

        assertEq(ammFactory.getPair(address(token), address(usdc)), pool);

        (uint256 r0, uint256 r1) = WafflesAmmPair(pool).getReserves();
        assertEq(r0 + r1, 200_000_000 ether + usdc.balanceOf(pool));
        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(usdc.balanceOf(address(curve)), curve.creatorEarnings(creator));
    }

    function test_LiquidityPermanentlyBurned() public {
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        address pool = curve.graduationPool();
        WafflesAmmPair pair = WafflesAmmPair(pool);

        assertGt(pair.balanceOf(DEAD), 0);
        assertEq(pair.balanceOf(address(migrator)), 0);
        assertEq(pair.balanceOf(address(curve)), 0);
        assertEq(pair.balanceOf(address(this)), 0);
    }

    function test_TradingContinuesOnPoolAfterGraduation() public {
        vm.prank(trader);
        curve.buy(100_000e6, 0);

        address pool = curve.graduationPool();
        WafflesAmmPair pair = WafflesAmmPair(pool);

        vm.prank(trader);
        vm.expectRevert(WafflesBondingCurve.CurveClosed.selector);
        curve.buy(100e6, 0);

        address alice = makeAddr("alice");
        usdc.mint(alice, 100e6);

        vm.startPrank(alice);
        usdc.approve(pool, type(uint256).max);
        assertTrue(usdc.transfer(pool, 100e6));

        (uint256 r0, uint256 r1) = pair.getReserves();
        bool usdcIs0 = pair.token0() == address(usdc);
        (uint256 rIn, uint256 rOut) = usdcIs0 ? (r0, r1) : (r1, r0);

        uint256 expectedOut = (100e6 * 9_975 * rOut) / (rIn * 10_000 + 100e6 * 9_975);
        if (usdcIs0) {
            pair.swap(0, expectedOut, alice);
        } else {
            pair.swap(expectedOut, 0, alice);
        }
        vm.stopPrank();

        assertEq(token.balanceOf(alice), expectedOut);
    }

    function test_AttackerCannotPrecreateGraduationPair() public {
        vm.prank(trader);
        vm.expectRevert(WafflesAmmFactory.Unauthorized.selector);
        ammFactory.createPair(address(token), address(usdc));
    }

    function test_AttackerCannotCallMigrator() public {
        vm.prank(trader);
        vm.expectRevert(WafflesAmmMigrator.Unauthorized.selector);
        migrator.migrate(address(token), 1, 1);
    }
}
