// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ILiquidityMigrator} from "../interfaces/ILiquidityMigrator.sol";

/// @notice Placeholder migrator. Holds graduated assets until a real DEX
///         integration replaces it. Implements ILiquidityMigrator.
contract MockMigrator is ILiquidityMigrator {
    using SafeERC20 for IERC20;

    event Migrated(address indexed token, uint256 tokenAmount, uint256 usdcAmount);

    address public immutable usdc;
    address private immutable OWNER;
    uint256 public totalMigratedUsdc;
    uint256 public totalMigratedTokens;

    error InvalidValue();
    error InvalidAddress();
    error Unauthorized();

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert InvalidAddress();
        usdc = usdc_;
        OWNER = msg.sender;
    }

    function migrate(address token, uint256 tokenAmount, uint256 usdcAmount) external payable returns (address) {
        if (msg.value != usdcAmount * 1e12) revert InvalidValue();
        if (tokenAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
            totalMigratedTokens += tokenAmount;
        }
        if (usdcAmount > 0) {
            totalMigratedUsdc += usdcAmount;
        }
        emit Migrated(token, tokenAmount, usdcAmount);
        return address(0);
    }

    function withdrawNative() external {
        if (msg.sender != OWNER) revert Unauthorized();
        Address.sendValue(payable(msg.sender), address(this).balance);
    }
}
