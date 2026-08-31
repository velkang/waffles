// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WafflesMemeToken} from "./WafflesMemeToken.sol";
import {WafflesBondingCurve} from "./WafflesBondingCurve.sol";

/// @notice Deploys WafflesMemeToken + WafflesBondingCurve pairs and records launches for waffles.meme.
contract WafflesLaunchFactory {
    using SafeERC20 for IERC20;

    uint256 public constant TOKEN_SUPPLY = 1_000_000_000 ether;
    uint256 public constant TRADE_FEE_BPS = 100;

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
    address public immutable rewardsTreasury;
    address public immutable migrator;
    uint256 public creationFee; // raw USDC, 0 = free

    uint256 public initialVirtualUsdcReserve;
    uint256 public initialVirtualTokenReserve;
    uint256 public minVirtualTokenReserve;
    uint256 public feeBps;

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
        address rewardsTreasury_,
        address migrator_,
        uint256 creationFee_,
        uint256 initialVirtualUsdcReserve_,
        uint256 initialVirtualTokenReserve_,
        uint256 minVirtualTokenReserve_,
        uint256 feeBps_
    ) {
        if (
            usdc_ == address(0) || treasury_ == address(0) || rewardsTreasury_ == address(0)
                || rewardsTreasury_ == treasury_ || migrator_ == address(0)
        ) {
            revert InvalidAddress();
        }
        if (
            initialVirtualUsdcReserve_ == 0 || initialVirtualTokenReserve_ == 0 || minVirtualTokenReserve_ == 0
                || minVirtualTokenReserve_ >= initialVirtualTokenReserve_ || feeBps_ != TRADE_FEE_BPS
                || initialVirtualTokenReserve_ - minVirtualTokenReserve_ > TOKEN_SUPPLY
        ) revert InvalidParameters();
        owner = msg.sender;
        usdc = usdc_;
        treasury = treasury_;
        rewardsTreasury = rewardsTreasury_;
        migrator = migrator_;
        creationFee = creationFee_;
        initialVirtualUsdcReserve = initialVirtualUsdcReserve_;
        initialVirtualTokenReserve = initialVirtualTokenReserve_;
        minVirtualTokenReserve = minVirtualTokenReserve_;
        feeBps = feeBps_;
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

        WafflesMemeToken tokenContract = new WafflesMemeToken(name, symbol, TOKEN_SUPPLY, address(this));
        uint256 supply = tokenContract.totalSupply();
        WafflesBondingCurve curveContract = new WafflesBondingCurve(
            address(tokenContract),
            usdc,
            msg.sender,
            treasury,
            rewardsTreasury,
            migrator,
            initialVirtualUsdcReserve,
            initialVirtualTokenReserve,
            minVirtualTokenReserve,
            feeBps
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
            token, curve, msg.sender, name, symbol, description, imageUri, website, twitter, telegram, feeBps, fee
        );
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function creatorOfToken(address token) external view returns (address) {
        return launchOfToken[token].creator;
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
}
