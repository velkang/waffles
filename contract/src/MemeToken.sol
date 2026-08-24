// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply launch token. Entire supply is minted to the factory,
///         which forwards the curve allocation to the bonding curve.
///         No owner, no mint, no pause.
contract MemeToken is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply,
        address initialHolder
    ) ERC20(name_, symbol_) {
        _mint(initialHolder, supply);
    }
}
