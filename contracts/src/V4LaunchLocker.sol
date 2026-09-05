// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint128} from "@uniswap/v4-core/src/libraries/FixedPoint128.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

import {IERC721ReceiverLike, IV4LaunchFeeEscrow, IV4LaunchFactory} from "./interfaces/IV4Launchpad.sol";

interface IV4LaunchFactoryView is IV4LaunchFactory {
    function poolKeyFor(address token) external view returns (PoolKey memory);
}

contract V4LaunchLocker is Ownable2Step, ReentrancyGuard, IERC721ReceiverLike {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;

    uint256 private constant BASIS_POINTS = 10_000;
    uint256 private constant COLLECT_DEADLINE_WINDOW = 300;

    error NotFactory();
    error AlreadyInitialized();
    error ZeroAddress();
    error PositionAlreadyLocked();
    error PositionNotHeld();
    error NotPositionManager();
    error OwnershipCannotBeRenounced();
    error TokenNotLaunched();
    error InexactTransfer(address token, uint256 expected, uint256 received);

    event FactorySet(address factory);
    event PositionLocked(address indexed token, uint256 indexed tokenId);
    event TokenSupplyLocked(address indexed token, uint256 amount);
    event ProtocolShareBurned(address indexed token, uint256 amount);

    event FeesCollected(
        address indexed token,
        address currency0,
        address currency1,
        uint256 protocolAmount0,
        uint256 protocolAmount1,
        uint256 creatorAmount0,
        uint256 creatorAmount1
    );

    IPositionManager public immutable positionManager;
    IPoolManager public immutable poolManager;
    IV4LaunchFeeEscrow public immutable feeEscrow;
    IV4LaunchFactoryView public factory;

    mapping(address token => uint256 tokenId) public lockedPositions;
    mapping(address token => uint256 amount) public lockedTokenSupply;
    mapping(address token => bool locked) private _locked;

    constructor(address initialOwner, IPositionManager positionManager_, IV4LaunchFeeEscrow feeEscrow_)
        Ownable(initialOwner)
    {
        if (address(positionManager_) == address(0) || address(feeEscrow_) == address(0)) revert ZeroAddress();
        positionManager = positionManager_;
        poolManager = positionManager_.poolManager();
        feeEscrow = feeEscrow_;
    }

    modifier onlyFactory() {
        if (msg.sender != address(factory)) revert NotFactory();
        _;
    }

    function setFactory(address factory_) external onlyOwner {
        if (address(factory) != address(0)) revert AlreadyInitialized();
        if (factory_ == address(0)) revert ZeroAddress();
        factory = IV4LaunchFactoryView(factory_);
        emit FactorySet(factory_);
    }

    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        return IERC721ReceiverLike.onERC721Received.selector;
    }

    function lockPosition(address token, uint256 tokenId) external onlyFactory {
        if (_locked[token]) revert PositionAlreadyLocked();
        if (IERC721(address(positionManager)).ownerOf(tokenId) != address(this)) revert PositionNotHeld();

        _locked[token] = true;
        lockedPositions[token] = tokenId;
        emit PositionLocked(token, tokenId);
    }

    function lockTokenSupply(address token, uint256 amount) external onlyFactory {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) return;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lockedTokenSupply[token] += amount;
        emit TokenSupplyLocked(token, amount);
    }

    function isLocked(address token) external view returns (bool) {
        return _locked[token];
    }

    function pendingFees(address token) external view returns (uint256 amount0, uint256 amount1) {
        IV4LaunchFactory.LaunchedToken memory launch = _launch(token);
        PoolId poolId = factory.poolKeyFor(token).toId();
        (uint256 inside0, uint256 inside1) = poolManager.getFeeGrowthInside(poolId, launch.tickLower, launch.tickUpper);
        (uint128 liquidity, uint256 last0, uint256 last1) = poolManager.getPositionInfo(
            poolId, address(positionManager), launch.tickLower, launch.tickUpper, bytes32(launch.positionId)
        );
        unchecked {
            amount0 = FullMath.mulDiv(inside0 - last0, liquidity, FixedPoint128.Q128);
            amount1 = FullMath.mulDiv(inside1 - last1, liquidity, FixedPoint128.Q128);
        }
    }

    function collectFees(address token) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        IV4LaunchFactory.LaunchedToken memory launch = _launch(token);
        PoolKey memory key = factory.poolKeyFor(token);
        uint256 tokenId = lockedPositions[token];

        uint256 before0 = _balance(key.currency0);
        uint256 before1 = _balance(key.currency1);

        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, address(this));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp + COLLECT_DEADLINE_WINDOW);

        amount0 = _balance(key.currency0) - before0;
        amount1 = _balance(key.currency1) - before1;
        if (amount0 == 0 && amount1 == 0) return (0, 0);

        uint256 totalFeeBps = uint256(launch.baseFeeBps) + launch.creatorTaxBps;
        uint256 protocol0 = totalFeeBps == 0
            ? 0
            : FullMath.mulDiv(
                amount0, uint256(launch.baseFeeBps) * launch.protocolFeeShareBps, totalFeeBps * BASIS_POINTS
            );
        uint256 protocol1 = totalFeeBps == 0
            ? 0
            : FullMath.mulDiv(
                amount1, uint256(launch.baseFeeBps) * launch.protocolFeeShareBps, totalFeeBps * BASIS_POINTS
            );

        _payProtocol(token, key.currency0, launch.protocolFeeRecipient, protocol0);
        _credit(key.currency0, launch.creatorFeeRecipient, amount0 - protocol0);
        _payProtocol(token, key.currency1, launch.protocolFeeRecipient, protocol1);
        _credit(key.currency1, launch.creatorFeeRecipient, amount1 - protocol1);

        emit FeesCollected(
            token,
            Currency.unwrap(key.currency0),
            Currency.unwrap(key.currency1),
            protocol0,
            protocol1,
            amount0 - protocol0,
            amount1 - protocol1
        );
    }

    function _launch(address token) private view returns (IV4LaunchFactory.LaunchedToken memory launch) {
        launch = factory.getLaunchedToken(token);
        if (!launch.exists || !_locked[token]) revert TokenNotLaunched();
    }

    function _balance(Currency currency) private view returns (uint256) {
        if (currency.isAddressZero()) return address(this).balance;
        return IERC20(Currency.unwrap(currency)).balanceOf(address(this));
    }

    function _payProtocol(address launchToken, Currency currency, address recipient, uint256 amount) private {
        if (amount == 0) return;
        if (currency.isAddressZero()) {
            (bool ok,) = recipient.call{value: amount, gas: 50_000}("");
            if (!ok) feeEscrow.credit{value: amount}(recipient);
            return;
        }
        address asset = Currency.unwrap(currency);
        if (asset == launchToken) {
            ERC20Burnable(asset).burn(amount);
            emit ProtocolShareBurned(launchToken, amount);
            return;
        }
        IERC20(asset).safeTransfer(recipient, amount);
    }

    function _credit(Currency currency, address recipient, uint256 amount) private {
        if (amount == 0) return;
        if (currency.isAddressZero()) {
            feeEscrow.credit{value: amount}(recipient);
            return;
        }
        address asset = Currency.unwrap(currency);
        uint256 escrowBefore = IERC20(asset).balanceOf(address(feeEscrow));
        IERC20(asset).forceApprove(address(feeEscrow), amount);
        feeEscrow.creditToken(recipient, asset, amount);
        uint256 received = IERC20(asset).balanceOf(address(feeEscrow)) - escrowBefore;
        if (received != amount) revert InexactTransfer(asset, amount, received);
    }

    receive() external payable {}
}
