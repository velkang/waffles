// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WafflesRewardsDistributor} from "../src/WafflesRewardsDistributor.sol";

contract WafflesRewardsDistributorTest is Test {
    MockUSDC internal usdc;
    WafflesRewardsDistributor internal distributor;

    address internal owner = makeAddr("owner");
    address internal finalizer = makeAddr("finalizer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
        distributor = new WafflesRewardsDistributor(usdc, owner, finalizer);
        usdc.mint(address(distributor), 1_000e6);
    }

    function test_FinalizeAndClaim() public {
        bytes32 aliceLeaf = distributor.leaf(1, alice, 60e6);
        bytes32 bobLeaf = distributor.leaf(1, bob, 40e6);
        bytes32 root = _hashPair(aliceLeaf, bobLeaf);

        vm.prank(finalizer);
        distributor.setEpochRoot(1, root, 100e6, keccak256("snapshot"), 12_345, hex"aabbcc");

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = bobLeaf;
        vm.prank(alice);
        distributor.claim(1, 60e6, proof);

        assertEq(usdc.balanceOf(alice), 60e6);
        assertEq(distributor.totalReserved(), 40e6);
        assertTrue(distributor.claimed(1, alice));
        (,,,, uint128 claimedAmount,,) = distributor.epochs(1);
        assertEq(claimedAmount, 60e6);
    }

    function test_OnlyFinalizerCanFinalize() public {
        vm.expectRevert(WafflesRewardsDistributor.Unauthorized.selector);
        distributor.setEpochRoot(1, bytes32(uint256(1)), 1e6, bytes32(uint256(2)), 1, hex"01");
    }

    function test_EpochIsImmutable() public {
        vm.startPrank(finalizer);
        distributor.setEpochRoot(1, bytes32(uint256(1)), 1e6, bytes32(uint256(2)), 1, hex"01");
        vm.expectRevert(WafflesRewardsDistributor.EpochAlreadyFinalized.selector);
        distributor.setEpochRoot(1, bytes32(uint256(3)), 1e6, bytes32(uint256(4)), 2, hex"02");
        vm.stopPrank();
    }

    function test_FinalizationRequiresFunding() public {
        vm.prank(finalizer);
        vm.expectRevert(WafflesRewardsDistributor.InsufficientUnreservedBalance.selector);
        distributor.setEpochRoot(1, bytes32(uint256(1)), 1_001e6, bytes32(uint256(2)), 1, hex"01");
    }

    function test_InvalidProofReverts() public {
        bytes32 aliceLeaf = distributor.leaf(1, alice, 10e6);
        vm.prank(finalizer);
        distributor.setEpochRoot(1, aliceLeaf, 10e6, keccak256("snapshot"), 1, hex"01");

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(bob);
        vm.expectRevert(WafflesRewardsDistributor.InvalidProof.selector);
        distributor.claim(1, 10e6, proof);
    }

    function test_DoubleClaimReverts() public {
        bytes32 aliceLeaf = distributor.leaf(1, alice, 10e6);
        vm.prank(finalizer);
        distributor.setEpochRoot(1, aliceLeaf, 10e6, keccak256("snapshot"), 1, hex"01");

        bytes32[] memory proof = new bytes32[](0);
        vm.startPrank(alice);
        distributor.claim(1, 10e6, proof);
        vm.expectRevert(WafflesRewardsDistributor.AlreadyClaimed.selector);
        distributor.claim(1, 10e6, proof);
        vm.stopPrank();
    }

    function test_ClaimCannotExceedEpochAllocation() public {
        bytes32 oversizedLeaf = distributor.leaf(1, alice, 11e6);
        vm.prank(finalizer);
        distributor.setEpochRoot(1, oversizedLeaf, 10e6, keccak256("snapshot"), 1, hex"01");

        bytes32[] memory proof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert(WafflesRewardsDistributor.InvalidClaimAmount.selector);
        distributor.claim(1, 11e6, proof);
    }

    function test_ClaimBatch() public {
        vm.startPrank(finalizer);
        distributor.setEpochRoot(1, distributor.leaf(1, alice, 10e6), 10e6, keccak256("one"), 1, hex"01");
        distributor.setEpochRoot(2, distributor.leaf(2, alice, 20e6), 20e6, keccak256("two"), 2, hex"02");
        vm.stopPrank();

        uint256[] memory epochIds = new uint256[](2);
        epochIds[0] = 1;
        epochIds[1] = 2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10e6;
        amounts[1] = 20e6;
        bytes32[][] memory proofs = new bytes32[][](2);
        proofs[0] = new bytes32[](0);
        proofs[1] = new bytes32[](0);

        vm.prank(alice);
        distributor.claimBatch(epochIds, amounts, proofs);
        assertEq(usdc.balanceOf(alice), 30e6);
        assertEq(distributor.totalReserved(), 0);
    }

    function test_OwnerCanRotateFinalizer() public {
        address nextFinalizer = makeAddr("nextFinalizer");
        vm.prank(owner);
        distributor.setFinalizer(nextFinalizer);
        assertEq(distributor.finalizer(), nextFinalizer);
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(bytes.concat(a, b)) : keccak256(bytes.concat(b, a));
    }
}
