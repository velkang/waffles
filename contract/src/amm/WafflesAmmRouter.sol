// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {WafflesAmmFactory} from "./WafflesAmmFactory.sol";
import {WafflesAmmPair} from "./WafflesAmmPair.sol";

/// @notice Atomic exact-input router for waffles.meme AMM pairs. The input transfer
///         and swap happen in one transaction, so a failed swap cannot leave
///         user funds stranded in a pair awaiting a separate call.
contract WafflesAmmRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant NATIVE_USDC_SCALE = 1e12;

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
    error InvalidNativeUsdcAmount();

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
        if (block.timestamp > deadline) revert Expired();
        if (to == address(0)) revert InvalidAddress();
        if (amountIn == 0) revert ZeroInput();

        WafflesAmmPair ammPair = WafflesAmmPair(pair);
        address token0 = ammPair.token0();
        address token1 = ammPair.token1();
        if (factory.getPair(token0, token1) != pair) revert InvalidPair();
        if (tokenIn != token0 && tokenIn != token1) revert InvalidToken();
        if (tokenIn == ammPair.usdc()) revert InvalidToken();

        (uint256 reserve0, uint256 reserve1) = ammPair.getReserves();
        bool zeroForOne = tokenIn == token0;
        uint256 reserveIn = zeroForOne ? reserve0 : reserve1;
        uint256 reserveOut = zeroForOne ? reserve1 : reserve0;
        uint256 grossAmountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
        amountOut = grossAmountOut - _fee(grossAmountOut);
        if (amountOut < minAmountOut || amountOut == 0) revert Slippage();

        emit SwapExactIn(msg.sender, pair, tokenIn, amountIn, amountOut, to);
        IERC20(tokenIn).safeTransferFrom(msg.sender, pair, amountIn);
        ammPair.swap(zeroForOne ? 0 : grossAmountOut, zeroForOne ? grossAmountOut : 0, to);
    }

    function swapExactUsdcForTokens(address pair, uint256 minAmountOut, address to, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (to == address(0)) revert InvalidAddress();
        if (msg.value == 0 || msg.value % NATIVE_USDC_SCALE != 0) revert InvalidNativeUsdcAmount();

        WafflesAmmPair ammPair = WafflesAmmPair(pair);
        address token0 = ammPair.token0();
        address token1 = ammPair.token1();
        if (factory.getPair(token0, token1) != pair) revert InvalidPair();

        uint256 amountIn = msg.value / NATIVE_USDC_SCALE;
        amountOut = quoteExactInput(pair, ammPair.usdc(), amountIn);
        if (amountOut < minAmountOut || amountOut == 0) revert Slippage();

        bool usdcIsToken0 = token0 == ammPair.usdc();
        emit SwapExactIn(msg.sender, pair, ammPair.usdc(), amountIn, amountOut, to);
        Address.functionCallWithValue(pair, abi.encodeCall(WafflesAmmPair.depositUsdc, ()), msg.value);
        ammPair.swap(usdcIsToken0 ? 0 : amountOut, usdcIsToken0 ? amountOut : 0, to);
    }

    function _fee(uint256 grossUsdcAmount) private pure returns (uint256) {
        return (grossUsdcAmount * FEE_BPS) / BPS_DENOM;
    }
}
