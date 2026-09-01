// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Distributes fully-funded USDC rewards from immutable epoch Merkle roots.
/// @dev Leaves are keccak256(bytes.concat(keccak256(abi.encode(chainId, distributor, epochId, account, amount)))).
contract WafflesRewardsDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    struct Epoch {
        bytes32 merkleRoot;
        bytes32 snapshotHash;
        bytes32 drandSignatureHash;
        uint128 totalAmount;
        uint128 claimedAmount;
        uint64 drandRound;
        uint64 finalizedAt;
    }

    IERC20 public immutable usdc;
    address public owner;
    address public pendingOwner;
    address public finalizer;
    uint256 public totalReserved;

    mapping(uint256 epochId => Epoch) public epochs;
    mapping(uint256 epochId => mapping(address account => bool)) public claimed;

    event EpochFinalized(
        uint256 indexed epochId,
        bytes32 indexed merkleRoot,
        uint256 totalAmount,
        bytes32 snapshotHash,
        uint256 drandRound,
        bytes drandSignature
    );
    event RewardClaimed(uint256 indexed epochId, address indexed account, uint256 amount);
    event FinalizerUpdated(address indexed previousFinalizer, address indexed newFinalizer);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAddress();
    error InvalidEpoch();
    error EpochAlreadyFinalized();
    error EpochNotFinalized();
    error InsufficientUnreservedBalance();
    error AlreadyClaimed();
    error InvalidProof();
    error InvalidClaimAmount();
    error InvalidBatch();
    error AmountOverflow();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyFinalizer() {
        if (msg.sender != finalizer) revert Unauthorized();
        _;
    }

    constructor(IERC20 usdc_, address owner_, address finalizer_) {
        if (address(usdc_) == address(0) || owner_ == address(0) || finalizer_ == address(0)) {
            revert InvalidAddress();
        }
        usdc = usdc_;
        owner = owner_;
        finalizer = finalizer_;
    }

    function setEpochRoot(
        uint256 epochId,
        bytes32 merkleRoot,
        uint256 totalAmount,
        bytes32 snapshotHash,
        uint256 drandRound,
        bytes calldata drandSignature
    ) external onlyFinalizer {
        if (merkleRoot == bytes32(0) || totalAmount == 0 || snapshotHash == bytes32(0) || drandSignature.length == 0) {
            revert InvalidEpoch();
        }
        if (epochs[epochId].finalizedAt != 0) revert EpochAlreadyFinalized();
        if (totalAmount > type(uint128).max || drandRound > type(uint64).max) revert AmountOverflow();
        if (usdc.balanceOf(address(this)) < totalReserved + totalAmount) revert InsufficientUnreservedBalance();

        epochs[epochId] = Epoch({
            merkleRoot: merkleRoot,
            snapshotHash: snapshotHash,
            drandSignatureHash: keccak256(drandSignature),
            totalAmount: totalAmount.toUint128(),
            claimedAmount: 0,
            drandRound: drandRound.toUint64(),
            finalizedAt: block.timestamp.toUint64()
        });
        totalReserved += totalAmount;

        emit EpochFinalized(epochId, merkleRoot, totalAmount, snapshotHash, drandRound, drandSignature);
    }

    function claim(uint256 epochId, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        _claim(epochId, msg.sender, amount, proof);
        usdc.safeTransfer(msg.sender, amount);
    }

    function claimBatch(uint256[] calldata epochIds, uint256[] calldata amounts, bytes32[][] calldata proofs)
        external
        nonReentrant
    {
        uint256 length = epochIds.length;
        if (length == 0 || length != amounts.length || length != proofs.length) revert InvalidBatch();

        uint256 totalAmount;
        for (uint256 i; i < length; ++i) {
            _claim(epochIds[i], msg.sender, amounts[i], proofs[i]);
            totalAmount += amounts[i];
        }
        usdc.safeTransfer(msg.sender, totalAmount);
    }

    function leaf(uint256 epochId, address account, uint256 amount) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), epochId, account, amount))));
    }

    function availableBalance() external view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return balance > totalReserved ? balance - totalReserved : 0;
    }

    function setFinalizer(address newFinalizer) external onlyOwner {
        if (newFinalizer == address(0)) revert InvalidAddress();
        emit FinalizerUpdated(finalizer, newFinalizer);
        finalizer = newFinalizer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert Unauthorized();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function _claim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof) internal {
        Epoch storage epoch = epochs[epochId];
        if (epoch.finalizedAt == 0) revert EpochNotFinalized();
        if (claimed[epochId][account]) revert AlreadyClaimed();
        if (amount == 0 || amount > uint256(epoch.totalAmount) - uint256(epoch.claimedAmount)) {
            revert InvalidClaimAmount();
        }
        if (!MerkleProof.verifyCalldata(proof, epoch.merkleRoot, leaf(epochId, account, amount))) {
            revert InvalidProof();
        }

        claimed[epochId][account] = true;
        epoch.claimedAmount += amount.toUint128();
        totalReserved -= amount;
        emit RewardClaimed(epochId, account, amount);
    }
}
