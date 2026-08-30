// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILiquidityMigrator} from "./interfaces/ILiquidityMigrator.sol";

/// @notice Stored-reserve virtual constant-product bonding curve quoted in USDC
///         for waffles.meme
contract WafflesBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 private constant PRICE_CONVERSION_FACTOR = 1e30;

    IERC20 public immutable token;
    IERC20 public immutable usdc;
    address public immutable creator;
    address public immutable treasury;
    ILiquidityMigrator public immutable migrator;

    uint256 public immutable totalSupply_; // raw token units
    uint256 public immutable k; // constant-product invariant
    uint256 public immutable initialVirtualUsdcReserve;
    uint256 public immutable initialVirtualTokenReserve;
    uint256 public immutable minVirtualTokenReserve;
    uint256 public immutable liquidityTokenReserve; // tokens reserved for AMM
    uint256 public immutable feeBps; // total trade fee, e.g. 100 = 1 %
    uint256 public immutable protocolFeeBps; // share of fee to treasury

    uint256 public virtualUsdcReserve; // current virtual USDC position
    uint256 public virtualTokenReserve; // current virtual token position
    uint256 public reserveUsdc; // actual net USDC backing

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
    event Graduated(
        address indexed pool,
        address indexed token,
        uint256 graduationPrice,
        uint256 graduationMarketCap
    );
    event CreatorFeesClaimed(address indexed creator, uint256 amount);

    error CurveClosed();
    error Slippage();
    error NotCreator();
    error ThresholdNotReached();
    error ZeroOutput();
    error InsufficientReserve();
    error InvalidParameters();
    error ExcessiveSell();

    constructor(
        address token_,
        address usdc_,
        address creator_,
        address treasury_,
        address migrator_,
        uint256 initialVirtualUsdcReserve_,
        uint256 initialVirtualTokenReserve_,
        uint256 minVirtualTokenReserve_,
        uint256 feeBps_,
        uint256 protocolFeeBps_
    ) {
        if (
            token_ == address(0) ||
            usdc_ == address(0) ||
            creator_ == address(0) ||
            treasury_ == address(0) ||
            migrator_ == address(0) ||
            initialVirtualUsdcReserve_ == 0 ||
            initialVirtualTokenReserve_ == 0 ||
            minVirtualTokenReserve_ == 0 ||
            minVirtualTokenReserve_ >= initialVirtualTokenReserve_ ||
            feeBps_ >= BPS_DENOM ||
            protocolFeeBps_ > BPS_DENOM
        ) revert InvalidParameters();

        token = IERC20(token_);
        usdc = IERC20(usdc_);
        creator = creator_;
        treasury = treasury_;
        migrator = ILiquidityMigrator(migrator_);

        totalSupply_ = IERC20(token_).totalSupply();

        uint256 sellable = initialVirtualTokenReserve_ -
            minVirtualTokenReserve_;
        if (sellable > totalSupply_) revert InvalidParameters();

        initialVirtualUsdcReserve = initialVirtualUsdcReserve_;
        initialVirtualTokenReserve = initialVirtualTokenReserve_;
        minVirtualTokenReserve = minVirtualTokenReserve_;
        liquidityTokenReserve = totalSupply_ - sellable;
        k = initialVirtualUsdcReserve_ * initialVirtualTokenReserve_;

        virtualUsdcReserve = initialVirtualUsdcReserve_;
        virtualTokenReserve = initialVirtualTokenReserve_;

        feeBps = feeBps_;
        protocolFeeBps = protocolFeeBps_;
    }

    // ---------- views ----------

    /// @notice Tokens still purchasable on the curve.
    function sellableTokens() public view returns (uint256) {
        return
            virtualTokenReserve > minVirtualTokenReserve
                ? virtualTokenReserve - minVirtualTokenReserve
                : 0;
    }

    /// @notice Marginal USD price per whole token, scaled by 1e18.
    /// @dev USDC has 6 decimals and the token has 18, hence the 1e30 factor.
    function currentPrice() public view returns (uint256) {
        return
            Math.mulDiv(
                virtualUsdcReserve,
                PRICE_CONVERSION_FACTOR,
                virtualTokenReserve
            );
    }

    /// @notice Market cap in raw quote units (price × total supply).
    function marketCap() public view returns (uint256) {
        return
            Math.mulDiv(virtualUsdcReserve, totalSupply_, virtualTokenReserve);
    }

    /// @notice Virtual USDC reserve at which the curve is complete.
    function targetVirtualUsdcReserve() public view returns (uint256) {
        return Math.mulDiv(k, 1, minVirtualTokenReserve, Math.Rounding.Ceil);
    }

    /// @notice Graduation market cap in raw USDC units.
    function graduationMarketCapTarget() public view returns (uint256) {
        return
            Math.mulDiv(
                targetVirtualUsdcReserve(),
                totalSupply_,
                minVirtualTokenReserve
            );
    }

    /// @notice Curve progress: fraction of the sellable supply that has been
    ///         bought, in bps.
    function graduationProgressBps() public view returns (uint256) {
        if (graduated) return BPS_DENOM;
        if (virtualTokenReserve >= initialVirtualTokenReserve) return 0;
        uint256 sold = initialVirtualTokenReserve - virtualTokenReserve;
        uint256 total = initialVirtualTokenReserve - minVirtualTokenReserve;
        return Math.mulDiv(sold, BPS_DENOM, total);
    }

    /// @notice Quote tokens received for spending `usdcIn` (fee-inclusive).
    function quoteBuy(uint256 usdcIn) public view returns (uint256) {
        if (graduated) revert CurveClosed();
        uint256 netIn = usdcIn - (usdcIn * feeBps) / BPS_DENOM;
        uint256 newVirtualUsdc = virtualUsdcReserve + netIn;
        uint256 newVirtualTokens = Math.mulDiv(
            k,
            1,
            newVirtualUsdc,
            Math.Rounding.Ceil
        );
        if (newVirtualTokens >= virtualTokenReserve) return 0;
        uint256 out = virtualTokenReserve - newVirtualTokens;
        uint256 sellable = sellableTokens();
        return out > sellable ? sellable : out;
    }

    /// @notice Quote USDC received (after fees) for selling `tokensIn`.
    function quoteSell(uint256 tokensIn) public view returns (uint256) {
        if (graduated) revert CurveClosed();
        uint256 newVirtualTokens = virtualTokenReserve + tokensIn;
        if (newVirtualTokens > initialVirtualTokenReserve)
            revert ExcessiveSell();
        uint256 newVirtualUsdc = Math.mulDiv(
            k,
            1,
            newVirtualTokens,
            Math.Rounding.Ceil
        );
        if (newVirtualUsdc >= virtualUsdcReserve) return 0;
        uint256 grossOut = virtualUsdcReserve - newVirtualUsdc;
        uint256 fee = (grossOut * feeBps) / BPS_DENOM;
        return grossOut - fee;
    }

    // ---------- trading ----------

    function buy(
        uint256 usdcIn,
        uint256 minTokensOut
    ) external nonReentrant returns (uint256) {
        if (graduated) revert CurveClosed();

        uint256 sellable = sellableTokens();
        if (sellable == 0) revert ZeroOutput();

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);

        uint256 consumed = usdcIn;
        uint256 netIn = usdcIn - (usdcIn * feeBps) / BPS_DENOM;
        uint256 newVirtualUsdc = virtualUsdcReserve + netIn;
        uint256 newVirtualTokens = Math.mulDiv(
            k,
            1,
            newVirtualUsdc,
            Math.Rounding.Ceil
        );
        uint256 tokensOut = virtualTokenReserve - newVirtualTokens;

        if (tokensOut >= sellable) {
            uint256 targetVirtualUsdc = targetVirtualUsdcReserve();
            uint256 netInNeeded = targetVirtualUsdc - virtualUsdcReserve;
            uint256 consumedNeeded = Math.mulDiv(
                netInNeeded,
                BPS_DENOM,
                BPS_DENOM - feeBps,
                Math.Rounding.Ceil
            );
            if (consumedNeeded <= usdcIn) {
                tokensOut = sellable;
                consumed = consumedNeeded;
                newVirtualTokens = minVirtualTokenReserve;
                if (usdcIn > consumed) {
                    usdc.safeTransfer(msg.sender, usdcIn - consumed);
                }
            }
        }

        _splitFee(consumed);
        netIn = consumed - (consumed * feeBps) / BPS_DENOM;

        // Update stored reserves
        virtualUsdcReserve += netIn;
        virtualTokenReserve = newVirtualTokens;
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

    function sell(
        uint256 tokensIn,
        uint256 minUsdcOut
    ) external nonReentrant returns (uint256) {
        if (graduated) revert CurveClosed();

        token.safeTransferFrom(msg.sender, address(this), tokensIn);

        uint256 newVirtualTokens = virtualTokenReserve + tokensIn;
        if (newVirtualTokens > initialVirtualTokenReserve)
            revert ExcessiveSell();

        uint256 newVirtualUsdc = Math.mulDiv(
            k,
            1,
            newVirtualTokens,
            Math.Rounding.Ceil
        );
        if (newVirtualUsdc >= virtualUsdcReserve) revert ZeroOutput();
        uint256 grossOut = virtualUsdcReserve - newVirtualUsdc;
        if (grossOut > reserveUsdc) revert InsufficientReserve();

        virtualTokenReserve = newVirtualTokens;
        virtualUsdcReserve = newVirtualUsdc;
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
        return !graduated && virtualTokenReserve <= minVirtualTokenReserve;
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

        uint256 tokenAmount = liquidityTokenReserve;
        uint256 usdcAmount = reserveUsdc;
        reserveUsdc = 0;
        if (tokenAmount > 0 || usdcAmount > 0) {
            if (tokenAmount > 0)
                token.forceApprove(address(migrator), tokenAmount);
            if (usdcAmount > 0)
                usdc.forceApprove(address(migrator), usdcAmount);
            pool = migrator.migrate(address(token), tokenAmount, usdcAmount);
        }
        graduationPool = pool;
        emit Graduated(
            pool,
            address(token),
            graduationPrice,
            graduationMarketCap
        );
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
