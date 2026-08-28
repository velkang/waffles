// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILiquidityMigrator} from "./interfaces/ILiquidityMigrator.sol";

/// @notice Virtual constant-product bonding curve quoted in USDC for waffles.meme.
///         (x + v_x)(y + v_y) = k, where x/y are real reserves held by this
///         contract and v_x/v_y are virtual reserves fixed at deployment.
///         The entire token supply is held here, but `reserveTokens` of it is
///         never sellable: the reserve, any unsold balance,
///         and the raised USDC together seed DEX liquidity at graduation.
///         When market cap reaches the graduation threshold the remaining
///         assets are handed to an ILiquidityMigrator and the curve closes.
contract WafflesBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;

    IERC20 public immutable token;
    IERC20 public immutable usdc;
    address public immutable creator;
    address public immutable treasury;
    ILiquidityMigrator public immutable migrator;

    uint256 public immutable virtualUsdc; // v_x, raw quote units
    uint256 public immutable virtualTokens; // v_y, raw token units
    uint256 public immutable k;
    uint256 public immutable totalSupply_; // raw token units
    uint256 public immutable initialCurveSupply; // token units transferred in
    uint256 public immutable reserveTokens; // non-sellable floor, token units
    uint256 public immutable graduationMcap; // raw quote units
    uint256 public immutable feeBps; // total trade fee, e.g. 100 = 1%
    uint256 public immutable protocolFeeBps; // share of fee to treasury

    uint256 public reserveUsdc; // real quote reserves (net of fees)
    bool public graduated;
    address public graduationPool;
    uint256 public graduationPrice;
    uint256 public graduationMarketCap;

    mapping(address => uint256) public creatorEarnings;

    event Traded(
        address indexed trader,
        bool indexed isBuy,
        uint256 usdcAmount,
        uint256 tokenAmount,
        uint256 priceAfter,
        uint256 mcapAfter,
        uint256 progressBpsAfter
    );
    event Graduated(address pool);
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    error CurveClosed();
    error Slippage();
    error NotCreator();
    error ThresholdNotReached();
    error ZeroOutput();
    error InsufficientReserve();
    error InvalidParameters();

    constructor(
        address token_,
        address usdc_,
        address creator_,
        address treasury_,
        address migrator_,
        uint256 initialCurveSupply_,
        uint256 reserveTokens_,
        uint256 virtualUsdc_,
        uint256 virtualTokens_,
        uint256 graduationMcap_,
        uint256 feeBps_,
        uint256 protocolFeeBps_
    ) {
        if (
            token_ == address(0) || usdc_ == address(0) || creator_ == address(0) || treasury_ == address(0)
                || migrator_ == address(0) || initialCurveSupply_ == 0 || reserveTokens_ >= initialCurveSupply_
                || virtualUsdc_ == 0 || virtualTokens_ == 0 || graduationMcap_ == 0 || feeBps_ >= BPS_DENOM
                || protocolFeeBps_ > BPS_DENOM
        ) revert InvalidParameters();
        token = IERC20(token_);
        usdc = IERC20(usdc_);
        creator = creator_;
        treasury = treasury_;
        migrator = ILiquidityMigrator(migrator_);
        initialCurveSupply = initialCurveSupply_;
        reserveTokens = reserveTokens_;
        virtualUsdc = virtualUsdc_;
        virtualTokens = virtualTokens_;
        graduationMcap = graduationMcap_;
        feeBps = feeBps_;
        protocolFeeBps = protocolFeeBps_;

        totalSupply_ = IERC20(token_).totalSupply();
        k = virtualUsdc_ * (virtualTokens_ + initialCurveSupply_);
    }

    // ---------- views ----------

    function _reserves() internal view returns (uint256 x, uint256 y) {
        x = virtualUsdc + reserveUsdc;
        y = virtualTokens + token.balanceOf(address(this));
    }

    /// @notice Tokens still purchasable on the curve (balance above reserve).
    function sellableTokens() public view returns (uint256) {
        uint256 balance = token.balanceOf(address(this));
        return balance > reserveTokens ? balance - reserveTokens : 0;
    }

    /// @notice Marginal price, scaled by 1e18, in raw quote units per whole token.
    function currentPrice() public view returns (uint256) {
        (uint256 x, uint256 y) = _reserves();
        return Math.mulDiv(x, 1e18, y);
    }

    /// @notice Market cap in raw quote units (price * total supply).
    function marketCap() public view returns (uint256) {
        (uint256 x, uint256 y) = _reserves();
        return Math.mulDiv(x, totalSupply_, y);
    }

    /// @notice Curve drained fraction: how much of the sellable supply has
    ///         been bought (pump.fun-style progress, in bps).
    function graduationProgressBps() public view returns (uint256) {
        if (graduated) return BPS_DENOM;
        uint256 balance = token.balanceOf(address(this));
        if (balance <= reserveTokens) return BPS_DENOM;
        if (balance >= initialCurveSupply) return 0;
        return Math.mulDiv(initialCurveSupply - balance, BPS_DENOM, initialCurveSupply - reserveTokens);
    }

    /// @notice Quote tokens received for spending `usdcIn` (fee-inclusive).
    function quoteBuy(uint256 usdcIn) public view returns (uint256) {
        if (graduated) revert CurveClosed();
        uint256 netIn = usdcIn - (usdcIn * feeBps) / BPS_DENOM;
        (uint256 x, uint256 y) = _reserves();
        uint256 newY = Math.mulDiv(k, 1, x + netIn, Math.Rounding.Ceil);
        if (newY >= y) return 0;
        uint256 out = y - newY;
        uint256 sellable = sellableTokens();
        return out > sellable ? sellable : out;
    }

    /// @notice Quote USDC received (after fees) for selling `tokensIn`.
    function quoteSell(uint256 tokensIn) public view returns (uint256) {
        if (graduated) revert CurveClosed();
        (uint256 x, uint256 y) = _reserves();
        uint256 newX = Math.mulDiv(k, 1, y + tokensIn, Math.Rounding.Ceil);
        if (newX >= x) return 0;
        uint256 grossOut = x - newX;
        uint256 fee = (grossOut * feeBps) / BPS_DENOM;
        return grossOut - fee;
    }

    // ---------- trading ----------

    function buy(uint256 usdcIn, uint256 minTokensOut) external nonReentrant returns (uint256) {
        if (graduated) revert CurveClosed();

        uint256 sellable = sellableTokens();
        if (sellable == 0) revert ZeroOutput();

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);

        uint256 consumed = usdcIn;
        uint256 netIn = usdcIn - (usdcIn * feeBps) / BPS_DENOM;
        (uint256 x, uint256 y) = _reserves();
        uint256 newY = Math.mulDiv(k, 1, x + netIn, Math.Rounding.Ceil);
        uint256 tokensOut = y - newY;

        // Draining buy: cap the output at the sellable balance and refund the
        // USDC that is not needed to complete the curve.
        if (tokensOut >= sellable) {
            uint256 targetX = Math.mulDiv(k, 1, virtualTokens + reserveTokens, Math.Rounding.Ceil);
            uint256 netInNeeded = targetX - x;
            uint256 consumedNeeded = Math.mulDiv(netInNeeded, BPS_DENOM, BPS_DENOM - feeBps, Math.Rounding.Ceil);
            if (consumedNeeded <= usdcIn) {
                tokensOut = sellable;
                consumed = consumedNeeded;
                if (usdcIn > consumed) {
                    usdc.safeTransfer(msg.sender, usdcIn - consumed);
                }
            }
        }

        _splitFee(consumed);
        netIn = consumed - (consumed * feeBps) / BPS_DENOM;
        reserveUsdc += netIn;

        if (tokensOut == 0) revert ZeroOutput();
        if (tokensOut < minTokensOut) revert Slippage();

        token.safeTransfer(msg.sender, tokensOut);
        uint256 priceAfter = currentPrice();
        uint256 mcapAfter = marketCap();
        emit Traded({
            trader: msg.sender,
            isBuy: true,
            usdcAmount: consumed,
            tokenAmount: tokensOut,
            priceAfter: priceAfter,
            mcapAfter: mcapAfter,
            progressBpsAfter: graduationProgressBps()
        });
        _settleGraduation();
        return tokensOut;
    }

    function sell(uint256 tokensIn, uint256 minUsdcOut) external nonReentrant returns (uint256) {
        if (graduated) revert CurveClosed();

        token.safeTransferFrom(msg.sender, address(this), tokensIn);

        (uint256 x,) = _reserves();
        uint256 yAfter = virtualTokens + token.balanceOf(address(this));
        uint256 newX = Math.mulDiv(k, 1, yAfter, Math.Rounding.Ceil);
        if (newX >= x) revert ZeroOutput();
        uint256 grossOut = x - newX;
        if (grossOut > reserveUsdc) revert InsufficientReserve();

        reserveUsdc -= grossOut;

        uint256 fee = (grossOut * feeBps) / BPS_DENOM;
        uint256 netOut = grossOut - fee;
        if (netOut < minUsdcOut) revert Slippage();

        usdc.safeTransfer(msg.sender, netOut);
        _splitFee(grossOut);

        emit Traded({
            trader: msg.sender,
            isBuy: false,
            usdcAmount: grossOut,
            tokenAmount: tokensIn,
            priceAfter: currentPrice(),
            mcapAfter: marketCap(),
            progressBpsAfter: graduationProgressBps()
        });
        return netOut;
    }

    // ---------- graduation ----------

    function canGraduate() public view returns (bool) {
        return !graduated && marketCap() >= graduationMcap;
    }

    function graduate() external nonReentrant returns (address pool) {
        if (!canGraduate()) revert ThresholdNotReached();
        return _graduate();
    }

    function _settleGraduation() internal {
        if (canGraduate()) {
            _graduate();
        }
    }

    function _graduate() internal returns (address pool) {
        graduationPrice = currentPrice();
        graduationMarketCap = marketCap();
        graduated = true;
        uint256 tokenAmount = token.balanceOf(address(this));
        uint256 usdcAmount = reserveUsdc;
        reserveUsdc = 0;
        if (tokenAmount > 0 || usdcAmount > 0) {
            if (tokenAmount > 0) token.forceApprove(address(migrator), tokenAmount);
            if (usdcAmount > 0) usdc.forceApprove(address(migrator), usdcAmount);
            pool = migrator.migrate(address(token), tokenAmount, usdcAmount);
        }
        graduationPool = pool;
        emit Graduated(pool);
    }

    // ---------- fees ----------

    function _splitFee(uint256 grossAmount) internal {
        uint256 fee = (grossAmount * feeBps) / BPS_DENOM;
        if (fee == 0) return;
        uint256 protocolFee = (fee * protocolFeeBps) / BPS_DENOM;
        uint256 creatorFee = fee - protocolFee;
        if (protocolFee > 0) usdc.safeTransfer(treasury, protocolFee);
        if (creatorFee > 0) creatorEarnings[creator] += creatorFee;
    }

    function claimCreatorFees() external nonReentrant {
        if (msg.sender != creator) revert NotCreator();
        uint256 amount = creatorEarnings[creator];
        if (amount == 0) return;
        creatorEarnings[creator] = 0;
        usdc.safeTransfer(creator, amount);
        emit CreatorFeesClaimed(creator, amount);
    }
}
