// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WafflesAmmFactory} from "./WafflesAmmFactory.sol";
import {WafflesAmmPair} from "./WafflesAmmPair.sol";

/// @notice Atomic exact-input router for waffles.meme AMM pairs. The input transfer
///         and swap happen in one transaction, so a failed swap cannot leave
///         user funds stranded in a pair awaiting a separate call.
contract WafflesAmmRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant FEE_BPS = 100;

    WafflesAmmFactory public immutable factory;

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

    constructor(WafflesAmmFactory factory_) {
        if (address(factory_) == address(0)) revert InvalidAddress();
        factory = factory_;
    }

    function quoteExactInput(address pair, address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) return 0;
        WafflesAmmPair ammPair = WafflesAmmPair(pair);
        address token0 = ammPair.token0();
        address token1 = ammPair.token1();
        if (factory.getPair(token0, token1) != pair) revert InvalidPair();
        if (tokenIn != token0 && tokenIn != token1) revert InvalidToken();

        (uint256 reserve0, uint256 reserve1) = ammPair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = tokenIn == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        if (reserveIn == 0 || reserveOut == 0) return 0;
        if (tokenIn == ammPair.usdc()) {
            uint256 netAmountIn = amountIn - _fee(amountIn);
            amountOut = (netAmountIn * reserveOut) / (reserveIn + netAmountIn);
        } else {
            uint256 grossAmountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
            amountOut = grossAmountOut - _fee(grossAmountOut);
        }
    }

    function swapExactTokensForTokens(
        address pair,
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert Expired();
        if (to == address(0)) revert InvalidAddress();
        if (amountIn == 0) revert ZeroInput();

        WafflesAmmPair ammPair = WafflesAmmPair(pair);
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
        uint256 grossAmountOut;
        if (tokenIn == ammPair.usdc()) {
            uint256 netAmountIn = actualAmountIn - _fee(actualAmountIn);
            grossAmountOut = (netAmountIn * reserveOut) / (reserveIn + netAmountIn);
            amountOut = grossAmountOut;
        } else {
            grossAmountOut = (actualAmountIn * reserveOut) / (reserveIn + actualAmountIn);
            amountOut = grossAmountOut - _fee(grossAmountOut);
        }
        if (amountOut < minAmountOut || amountOut == 0) revert Slippage();

        ammPair.swap(zeroForOne ? 0 : grossAmountOut, zeroForOne ? grossAmountOut : 0, to);
        emit SwapExactIn(msg.sender, pair, tokenIn, actualAmountIn, amountOut, to);
    }

    function _fee(uint256 grossUsdcAmount) private pure returns (uint256) {
        return (grossUsdcAmount * FEE_BPS) / BPS_DENOM;
    }
}
