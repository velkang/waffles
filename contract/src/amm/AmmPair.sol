// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

interface IAmmFactory {
    function parameters() external view returns (address, address);
}

/// @notice Constant-product pool (Uniswap-V2-style) with a 0.25% swap fee
///         accruing to liquidity providers. The first mint locks
///         MINIMUM_LIQUIDITY forever; graduated pools have their LP burned,
///         so their fees compound inside the pool as permanent depth.
contract AmmPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 public constant FEE_BPS = 25; // 0.25% to LPs

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;

    uint256 private reserve0;
    uint256 private reserve1;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, address indexed to, uint256 amount0, uint256 amount1);
    event Swap(
        address indexed sender,
        address indexed to,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    error InsufficientLiquidity();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error InvalidTo();
    error K();

    constructor() ERC20("ArcFun LP", "AFLP") {
        factory = msg.sender;
        (token0, token1) = IAmmFactory(msg.sender).parameters();
    }

    function getReserves() public view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    // ---------- liquidity ----------

    /// @notice Mints LP for the token amounts sent to this pair since the
    ///         last update. Callers must transfer both tokens first.
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0x000000000000000000000000000000000000dEaD), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();

        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns the pair's own LP balance and sends both tokens to `to`.
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity = balanceOf(address(this));
        if (liquidity == 0) revert InsufficientLiquidityBurned();

        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        uint256 _totalSupply = totalSupply();
        amount0 = Math.mulDiv(liquidity, _reserve0, _totalSupply);
        amount1 = Math.mulDiv(liquidity, _reserve1, _totalSupply);
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
        emit Burn(msg.sender, to, amount0, amount1);
    }

    // ---------- swapping ----------

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        if (to == token0 || to == token1) revert InvalidTo();

        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        // Fee-adjusted invariant: reserves may only grow.
        uint256 balance0Adjusted = balance0 * BPS_DENOM - amount0In * FEE_BPS;
        uint256 balance1Adjusted = balance1 * BPS_DENOM - amount1In * FEE_BPS;
        if (
            balance0Adjusted * balance1Adjusted <
            _reserve0 * _reserve1 * BPS_DENOM * BPS_DENOM
        ) {
            revert K();
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, to, amount0In, amount1In, amount0Out, amount1Out);
    }

    // ---------- housekeeping ----------

    function skim(address to) external nonReentrant {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - _reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - _reserve1);
    }

    function sync() external nonReentrant {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(balance0, balance1);
    }
}
