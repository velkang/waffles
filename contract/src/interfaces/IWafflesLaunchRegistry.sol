// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IWafflesLaunchRegistry {
    function tokenOfCurve(address curve) external view returns (address);
    function creatorOfToken(address token) external view returns (address);
}
