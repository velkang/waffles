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

/// @notice Constant-product pool (Uniswap-V2-style) for waffles.meme with a 0.25% swap fee
///         accruing to liquidity providers. The first mint locks
///         MINIMUM_LIQUIDITY forever; graduated pools have their LP burned,
///         so their fees compound inside the pool as permanent depth.
contract WafflesAmmPair is ERC20, ReentrancyGuard {
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

    constructor() ERC20("Waffles LP", "WFLP") {
        factory = msg.sender;
        (token0, token1) = IAmmFactory(msg.sender).parameters();
    }

    function getReserves() public view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(balance0, balance1);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));
        uint256 a0 = b0 - r0;
        uint256 a1 = b1 - r1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(a0 * a1) - MINIMUM_LIQUIDITY;
            _mint(address(0x000000000000000000000000000000000000dEaD), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((a0 * _totalSupply) / r0, (a1 * _totalSupply) / r1);
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);
        _update(b0, b1);
        emit Mint(msg.sender, a0, a1);
    }

    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * b0) / _totalSupply;
        amount1 = (liquidity * b1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        b0 = IERC20(token0).balanceOf(address(this));
        b1 = IERC20(token1).balanceOf(address(this));
        _update(b0, b1);
        emit Burn(msg.sender, to, amount0, amount1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (amount0Out >= r0 || amount1Out >= r1) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidTo();

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));

        uint256 a0In = b0 > r0 - amount0Out ? b0 - (r0 - amount0Out) : 0;
        uint256 a1In = b1 > r1 - amount1Out ? b1 - (r1 - amount1Out) : 0;
        if (a0In == 0 && a1In == 0) revert InsufficientInputAmount();

        // 0.25% fee check
        uint256 b0Adjusted = (b0 * BPS_DENOM) - (a0In * FEE_BPS);
        uint256 b1Adjusted = (b1 * BPS_DENOM) - (a1In * FEE_BPS);
        if (b0Adjusted * b1Adjusted < r0 * r1 * (BPS_DENOM ** 2)) revert K();

        _update(b0, b1);
        emit Swap(msg.sender, to, a0In, a1In, amount0Out, amount1Out);
    }

    function skim(address to) external nonReentrant {
        address _token0 = token0;
        address _token1 = token1;
        IERC20(_token0).safeTransfer(to, IERC20(_token0).balanceOf(address(this)) - reserve0);
        IERC20(_token1).safeTransfer(to, IERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    function sync() external nonReentrant {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }
}
