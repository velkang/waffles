// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidityMigrator} from "../interfaces/ILiquidityMigrator.sol";
import {AmmFactory} from "./AmmFactory.sol";
import {AmmPair} from "./AmmPair.sol";

/// @notice Seeds a token/USDC AmmPair with a graduating curve's remaining
///         assets (reserve + unsold balance + raised USDC) and burns the LP
///         tokens it receives: liquidity is permanently locked and swap fees
///         compound in the pool (pump.fun / nad.fun graduation pattern).
contract AmmMigrator is ILiquidityMigrator {
    using SafeERC20 for IERC20;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    AmmFactory public immutable factory;
    IERC20 public immutable usdc;

    constructor(AmmFactory factory_, IERC20 usdc_) {
        factory = factory_;
        usdc = usdc_;
    }

    function migrate(address token, uint256 tokenAmount, uint256 usdcAmount) external returns (address pool) {
        pool = factory.getPair(token, address(usdc));
        if (pool == address(0)) {
            pool = factory.createPair(token, address(usdc));
        }
        if (tokenAmount == 0 || usdcAmount == 0) {
            return pool; // pair exists; nothing left to seed
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        IERC20(token).safeTransfer(pool, tokenAmount);
        usdc.safeTransfer(pool, usdcAmount);

        uint256 liquidity = AmmPair(pool).mint(address(this));
        // Burn the LP: the graduation liquidity can never be withdrawn.
        IERC20(pool).safeTransfer(DEAD_ADDRESS, liquidity);
    }
}
