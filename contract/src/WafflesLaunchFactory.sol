// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WafflesMemeToken} from "./WafflesMemeToken.sol";
import {WafflesBondingCurve} from "./WafflesBondingCurve.sol";

/// @notice Deploys WafflesMemeToken + WafflesBondingCurve pairs and records launches for waffles.meme.
contract WafflesLaunchFactory {
    using SafeERC20 for IERC20;

    address public owner;
    address public pendingOwner;

    modifier onlyOwner() {
        require(msg.sender == owner, "UNAUTHORIZED");
        _;
    }

    struct Launch {
        address token;
        address curve;
        address creator;
        string description;
        string imageUri;
        string website;
        string twitter;
        string telegram;
        uint64 createdAt;
    }

    address public immutable usdc;
    address public immutable treasury;
    address public immutable migrator;
    uint256 public creationFee; // raw USDC, 0 = free

    // Curve economics applied to every launch
    uint256 public virtualUsdc;
    uint256 public virtualTokens;
    uint256 public graduationMcap;
    uint256 public feeBps;
    uint256 public protocolFeeBps;

    mapping(address => Launch) public launchOfToken;
    mapping(address => address) public tokenOfCurve;
    address[] public allTokens;

    event TokenCreated(
        address indexed token,
        address indexed curve,
        address indexed creator,
        string name,
        string symbol,
        string description,
        string imageUri,
        string website,
        string twitter,
        string telegram,
        uint256 feeBps,
        uint256 creationFeePaid
    );
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error InvalidAddress();
    error InvalidParameters();

    constructor(
        address usdc_,
        address treasury_,
        address migrator_,
        uint256 creationFee_,
        uint256 virtualUsdc_,
        uint256 virtualTokens_,
        uint256 graduationMcap_,
        uint256 feeBps_,
        uint256 protocolFeeBps_
    ) {
        if (usdc_ == address(0) || treasury_ == address(0) || migrator_ == address(0)) {
            revert InvalidAddress();
        }
        if (
            virtualUsdc_ == 0 || virtualTokens_ == 0 || graduationMcap_ == 0 || feeBps_ >= 10_000
                || protocolFeeBps_ > 10_000
        ) revert InvalidParameters();
        owner = msg.sender;
        usdc = usdc_;
        treasury = treasury_;
        migrator = migrator_;
        creationFee = creationFee_;
        virtualUsdc = virtualUsdc_;
        virtualTokens = virtualTokens_;
        graduationMcap = graduationMcap_;
        feeBps = feeBps_;
        protocolFeeBps = protocolFeeBps_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata description,
        string calldata imageUri,
        string calldata website,
        string calldata twitter,
        string calldata telegram
    ) external returns (address token, address curve) {
        uint256 fee = creationFee;
        if (fee > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, treasury, fee);
        }

        WafflesMemeToken tokenContract = new WafflesMemeToken(name, symbol, 1_000_000_000 ether, address(this));
        uint256 supply = tokenContract.totalSupply();
        WafflesBondingCurve curveContract = new WafflesBondingCurve(
            address(tokenContract),
            usdc,
            msg.sender,
            treasury,
            migrator,
            supply,
            CURVE_RESERVE,
            virtualUsdc,
            virtualTokens,
            graduationMcap,
            feeBps,
            protocolFeeBps
        );
        IERC20(address(tokenContract)).safeTransfer(address(curveContract), supply);

        token = address(tokenContract);
        curve = address(curveContract);

        launchOfToken[token] = Launch({
            token: token,
            curve: curve,
            creator: msg.sender,
            description: description,
            imageUri: imageUri,
            website: website,
            twitter: twitter,
            telegram: telegram,
            createdAt: uint64(block.timestamp)
        });
        tokenOfCurve[curve] = token;
        allTokens.push(token);

        emit TokenCreated(
            token,
            curve,
            msg.sender,
            name,
            symbol,
            description,
            imageUri,
            website,
            twitter,
            telegram,
            feeBps,
            fee
        );
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function setCreationFee(uint256 fee) external onlyOwner {
        emit CreationFeeUpdated(creationFee, fee);
        creationFee = fee;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert InvalidAddress();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    uint256 public constant CURVE_RESERVE = 200_000_000 ether;
}
