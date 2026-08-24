// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { AmmPair } from "./AmmPair.sol";

/// @notice Minimal Uniswap-V2-style factory: one AmmPair per token pair.
contract AmmFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    error IdenticalAddresses();
    error ZeroAddress();
    error PairExists();

    // Parameters consumed by the AmmPair constructor during createPair.
    address private token0Param;
    address private token1Param;

    function parameters() external view returns (address, address) {
        return (token0Param, token1Param);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        token0Param = token0;
        token1Param = token1;
        pair = address(new AmmPair());
        delete token0Param;
        delete token1Param;

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
