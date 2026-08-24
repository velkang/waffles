// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ILiquidityMigrator {
    /// @notice Move graduated curve assets into DEX liquidity.
    /// @param token The launched token.
    /// @param tokenAmount Tokens to seed liquidity with.
    /// @param usdcAmount USDC to seed liquidity with.
    /// @return pool Address of the created/used liquidity pool (0 if N/A).
    function migrate(
        address token,
        uint256 tokenAmount,
        uint256 usdcAmount
    ) external returns (address pool);
}
