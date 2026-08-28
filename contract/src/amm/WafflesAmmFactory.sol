// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WafflesAmmPair} from "./WafflesAmmPair.sol";

/// @notice Minimal Uniswap-V2-style factory for waffles.meme: one WafflesAmmPair per token pair.
contract WafflesAmmFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    address public immutable owner;
    address public pairCreator;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    error IdenticalAddresses();
    error ZeroAddress();
    error PairExists();
    error Unauthorized();
    error AlreadyConfigured();

    // Parameters consumed by the WafflesAmmPair constructor during createPair.
    address private token0Param;
    address private token1Param;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Permanently authorizes the graduation migrator to create pools.
    ///         Pool creation is restricted so an attacker cannot pre-seed the
    ///         canonical token/USDC pair before graduation.
    function setPairCreator(address pairCreator_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (pairCreator != address(0)) revert AlreadyConfigured();
        if (pairCreator_ == address(0)) revert ZeroAddress();
        pairCreator = pairCreator_;
    }

    function parameters() external view returns (address, address) {
        return (token0Param, token1Param);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (msg.sender != pairCreator) revert Unauthorized();
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        token0Param = token0;
        token1Param = token1;
        pair = address(new WafflesAmmPair());
        delete token0Param;
        delete token1Param;

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
