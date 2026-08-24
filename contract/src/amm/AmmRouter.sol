// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AmmFactory} from "./AmmFactory.sol";
import {AmmPair} from "./AmmPair.sol";

/// @notice Atomic exact-input router for ArcFun AMM pairs. The input transfer
///         and swap happen in one transaction, so a failed swap cannot leave
///         user funds stranded in a pair awaiting a separate call.
contract AmmRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant FEE_NUM = 9_975; // 0.25% pair fee

    AmmFactory public immutable factory;

    event SwapExactIn(
        address indexed sender,
        address indexed pair,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        address to
    );

    error Expired();
    error InvalidAddress();
    error InvalidPair();
    error InvalidToken();
    error Slippage();
    error ZeroInput();

    constructor(AmmFactory factory_) {
        if (address(factory_) == address(0)) revert InvalidAddress();
        factory = factory_;
    }

    function quoteExactInput(address pair, address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        AmmPair ammPair = AmmPair(pair);
        address token0 = ammPair.token0();
        address token1 = ammPair.token1();
        if (factory.getPair(token0, token1) != pair) revert InvalidPair();
        if (tokenIn != token0 && tokenIn != token1) revert InvalidToken();

        (uint256 reserve0, uint256 reserve1) = ammPair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = tokenIn == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        if (reserveIn == 0 || reserveOut == 0) return 0;
        amountOut = (amountIn * FEE_NUM * reserveOut) / (reserveIn * BPS_DENOM + amountIn * FEE_NUM);
    }

    function swapExactTokensForTokens(
        address pair,
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        // A swap deadline intentionally follows the chain timestamp convention
        // used by AMM routers; small validator timestamp variance is acceptable.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        if (to == address(0)) revert InvalidAddress();
        if (amountIn == 0) revert ZeroInput();

        AmmPair ammPair = AmmPair(pair);
        address token0 = ammPair.token0();
        address token1 = ammPair.token1();
        if (factory.getPair(token0, token1) != pair) revert InvalidPair();
        if (tokenIn != token0 && tokenIn != token1) revert InvalidToken();

        (uint256 reserve0, uint256 reserve1) = ammPair.getReserves();
        IERC20(tokenIn).safeTransferFrom(msg.sender, pair, amountIn);

        bool zeroForOne = tokenIn == token0;
        uint256 balanceIn = IERC20(tokenIn).balanceOf(pair);
        uint256 reserveIn = zeroForOne ? reserve0 : reserve1;
        uint256 reserveOut = zeroForOne ? reserve1 : reserve0;
        uint256 actualAmountIn = balanceIn - reserveIn;
        amountOut = (actualAmountIn * FEE_NUM * reserveOut) / (reserveIn * BPS_DENOM + actualAmountIn * FEE_NUM);
        if (amountOut < minAmountOut || amountOut == 0) revert Slippage();

        ammPair.swap(zeroForOne ? 0 : amountOut, zeroForOne ? amountOut : 0, to);
        emit SwapExactIn(msg.sender, pair, tokenIn, actualAmountIn, amountOut, to);
    }
}
