// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IWafflesAmmFactory {
    function parameters()
        external
        view
        returns (
            address token0,
            address token1,
            address usdc,
            address creator,
            address treasury,
            address rewardsTreasury
        );
}
