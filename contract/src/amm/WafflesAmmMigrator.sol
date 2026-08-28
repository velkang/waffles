// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidityMigrator} from "../interfaces/ILiquidityMigrator.sol";
import {WafflesAmmFactory} from "./WafflesAmmFactory.sol";
import {WafflesAmmPair} from "./WafflesAmmPair.sol";

interface IWafflesLaunchRegistry {
    function tokenOfCurve(address curve) external view returns (address);
}

/// @notice Seeds a token/USDC WafflesAmmPair with a graduating waffles.meme curve's remaining
///         assets (reserve + unsold balance + raised USDC) and burns the LP
///         tokens it receives: liquidity is permanently locked and swap fees
///         compound in the pool.
contract WafflesAmmMigrator is ILiquidityMigrator {
    using SafeERC20 for IERC20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    WafflesAmmFactory public immutable factory;
    IERC20 public immutable usdc;
    address public immutable owner;
    address public launchFactory;

    error Unauthorized();
    error AlreadyConfigured();
    error InvalidAddress();
    error InvalidAmounts();
    error PairAlreadyExists();

    constructor(WafflesAmmFactory factory_, IERC20 usdc_) {
        if (address(factory_) == address(0) || address(usdc_) == address(0)) revert InvalidAddress();
        factory = factory_;
        usdc = usdc_;
        owner = msg.sender;
    }

    /// @notice Binds this migrator to one launch registry. This is deliberately
    ///         one-time configuration so arbitrary callers can never register
    ///         themselves as graduation curves later.
    function setLaunchFactory(address launchFactory_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (launchFactory != address(0)) revert AlreadyConfigured();
        if (launchFactory_ == address(0)) revert InvalidAddress();
        launchFactory = launchFactory_;
    }

    function migrate(address token, uint256 tokenAmount, uint256 usdcAmount) external returns (address pool) {
        if (launchFactory == address(0) || IWafflesLaunchRegistry(launchFactory).tokenOfCurve(msg.sender) != token) {
            revert Unauthorized();
        }
        if (tokenAmount == 0 || usdcAmount == 0) revert InvalidAmounts();
        if (factory.getPair(token, address(usdc)) != address(0)) revert PairAlreadyExists();

        pool = factory.createPair(token, address(usdc));

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        IERC20(token).safeTransfer(pool, tokenAmount);
        usdc.safeTransfer(pool, usdcAmount);

        uint256 liquidity = WafflesAmmPair(pool).mint(address(this));
        // Burn the LP: the graduation liquidity can never be withdrawn.
        IERC20(pool).safeTransfer(DEAD_ADDRESS, liquidity);
    }
}
