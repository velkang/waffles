// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ILiquidityMigrator} from "../interfaces/ILiquidityMigrator.sol";

/// @notice Placeholder migrator. Holds graduated assets until a real DEX
///         integration replaces it. Implements ILiquidityMigrator.
contract MockMigrator is ILiquidityMigrator {
    using SafeERC20 for IERC20;

    event Migrated(address indexed token, uint256 tokenAmount, uint256 usdcAmount);

    address public immutable usdc;
    uint256 public totalMigratedUsdc;
    uint256 public totalMigratedTokens;

    constructor(address usdc_) {
        usdc = usdc_;
    }

    function migrate(address token, uint256 tokenAmount, uint256 usdcAmount) external returns (address) {
        if (tokenAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
            totalMigratedTokens += tokenAmount;
        }
        if (usdcAmount > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcAmount);
            totalMigratedUsdc += usdcAmount;
        }
        emit Migrated(token, tokenAmount, usdcAmount);
        return address(0);
    }
}
