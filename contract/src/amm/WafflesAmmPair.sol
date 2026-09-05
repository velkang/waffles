// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IWafflesAmmFactory} from "../interfaces/IWafflesAmmFactory.sol";

/// @notice Constant-product pool for graduated waffles.meme tokens. Every swap
///         charges a 1% USDC fee split 70/25/5 between the token creator, the
///         platform treasury, and the rewards treasury.
contract WafflesAmmPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant CREATOR_FEE_SHARE_BPS = 7_000;
    uint256 public constant PLATFORM_FEE_SHARE_BPS = 2_500;
    uint256 public constant REWARDS_FEE_SHARE_BPS = 500;
    uint256 public constant NATIVE_USDC_SCALE = 1e12;

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    address public immutable usdc;
    address public immutable creator;
    address public immutable treasury;
    address public immutable rewardsTreasury;

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
    event FeeAllocated(
        address indexed trader,
        uint256 grossUsdcAmount,
        uint256 totalFee,
        uint256 creatorFee,
        uint256 platformFee,
        uint256 rewardsFee
    );

    error InsufficientLiquidity();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error InvalidTo();
    error K();
    error InvalidNativeUsdcAmount();

    constructor() ERC20("Waffles LP", "WFLP") {
        factory = msg.sender;
        (token0, token1, usdc, creator, treasury, rewardsTreasury) = IWafflesAmmFactory(msg.sender).parameters();
    }

    function getReserves() public view returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    function depositUsdc() external payable {
        if (msg.value == 0 || msg.value % NATIVE_USDC_SCALE != 0) revert InvalidNativeUsdcAmount();
    }

    function _update(uint256 balance0, uint256 balance1) private {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(balance0, balance1);
    }

    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        uint256 b0 = _balanceOf(token0);
        uint256 b1 = _balanceOf(token1);
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
        uint256 b0 = _balanceOf(token0);
        uint256 b1 = _balanceOf(token1);
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * b0) / _totalSupply;
        amount1 = (liquidity * b1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        _transferAsset(token0, to, amount0);
        _transferAsset(token1, to, amount1);

        b0 = _balanceOf(token0);
        b1 = _balanceOf(token1);
        _update(b0, b1);
        emit Burn(msg.sender, to, amount0, amount1);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (amount0Out >= r0 || amount1Out >= r1) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidTo();

        if (amount0Out > 0) _transferOutput(token0, amount0Out, to);
        if (amount1Out > 0) _transferOutput(token1, amount1Out, to);

        uint256 b0 = _balanceOf(token0);
        uint256 b1 = _balanceOf(token1);

        uint256 gross0In = b0 > r0 - amount0Out ? b0 - (r0 - amount0Out) : 0;
        uint256 gross1In = b1 > r1 - amount1Out ? b1 - (r1 - amount1Out) : 0;
        if (token0 == usdc && gross0In > 0) {
            _allocateFee(to, gross0In);
        }
        if (token1 == usdc && gross1In > 0) {
            _allocateFee(to, gross1In);
        }

        b0 = _balanceOf(token0);
        b1 = _balanceOf(token1);
        uint256 a0In = b0 > r0 - amount0Out ? b0 - (r0 - amount0Out) : 0;
        uint256 a1In = b1 > r1 - amount1Out ? b1 - (r1 - amount1Out) : 0;
        if (a0In == 0 && a1In == 0) revert InsufficientInputAmount();

        if (b0 * b1 < r0 * r1) revert K();

        _update(b0, b1);
        emit Swap(
            msg.sender, to, token0 == usdc ? gross0In : a0In, token1 == usdc ? gross1In : a1In, amount0Out, amount1Out
        );
    }

    function _transferOutput(address outputToken, uint256 grossAmount, address to) private {
        if (outputToken != usdc) {
            IERC20(outputToken).safeTransfer(to, grossAmount);
            return;
        }

        uint256 fee = _allocateFee(to, grossAmount);
        _transferAsset(outputToken, to, grossAmount - fee);
    }

    function _allocateFee(address trader, uint256 grossUsdcAmount) private returns (uint256 fee) {
        fee = (grossUsdcAmount * FEE_BPS) / BPS_DENOM;
        uint256 creatorFee = Math.mulDiv(fee, CREATOR_FEE_SHARE_BPS, BPS_DENOM);
        uint256 platformFee = Math.mulDiv(fee, PLATFORM_FEE_SHARE_BPS, BPS_DENOM);
        uint256 rewardsFee = fee - creatorFee - platformFee;

        if (creatorFee > 0) _transferAsset(usdc, creator, creatorFee);
        if (platformFee > 0) _transferAsset(usdc, treasury, platformFee);
        if (rewardsFee > 0) {
            _transferAsset(usdc, rewardsTreasury, rewardsFee);
        }

        emit FeeAllocated(trader, grossUsdcAmount, fee, creatorFee, platformFee, rewardsFee);
    }

    function skim(address to) external nonReentrant {
        address _token0 = token0;
        address _token1 = token1;
        _transferAsset(_token0, to, _balanceOf(_token0) - reserve0);
        _transferAsset(_token1, to, _balanceOf(_token1) - reserve1);
    }

    function sync() external nonReentrant {
        _update(_balanceOf(token0), _balanceOf(token1));
    }

    function _balanceOf(address asset) private view returns (uint256) {
        return asset == usdc ? address(this).balance / NATIVE_USDC_SCALE : IERC20(asset).balanceOf(address(this));
    }

    function _transferAsset(address asset, address to, uint256 amount) private {
        if (amount == 0) return;
        if (asset != usdc) {
            IERC20(asset).safeTransfer(to, amount);
            return;
        }
        Address.sendValue(payable(to), amount * NATIVE_USDC_SCALE);
    }
}
