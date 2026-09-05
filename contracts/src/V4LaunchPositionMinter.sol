// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {V4LaunchLocker} from "./V4LaunchLocker.sol";
import {V4LaunchPositionMath} from "./libraries/V4LaunchPositionMath.sol";

contract V4LaunchPositionMinter {
    using SafeERC20 for IERC20;

    uint256 private constant MINT_DEADLINE_WINDOW = 300;

    error NotFactory();
    error ZeroAddress();
    error SupplyNotReceived(uint256 expected, uint256 held);

    event LaunchDustLocked(address indexed launchToken, uint256 amount);

    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    V4LaunchLocker public immutable locker;
    address public immutable factory;

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(
        IPositionManager positionManager_,
        IAllowanceTransfer permit2_,
        V4LaunchLocker locker_,
        address factory_
    ) {
        if (address(positionManager_) == address(0) || address(permit2_) == address(0)) {
            revert ZeroAddress();
        }
        if (address(locker_) == address(0) || factory_ == address(0)) revert ZeroAddress();
        positionManager = positionManager_;
        permit2 = permit2_;
        locker = locker_;
        factory = factory_;
    }

    function plan(bool tokenIsCurrency0, uint256 supply, uint256 phantomQuote, int24 tickSpacing)
        external
        pure
        returns (V4LaunchPositionMath.Plan memory)
    {
        return V4LaunchPositionMath.plan(tokenIsCurrency0, supply, phantomQuote, tickSpacing);
    }

    function mintLaunchPosition(
        address launchToken,
        PoolKey calldata key,
        V4LaunchPositionMath.Plan calldata p,
        uint256 supply
    ) external onlyFactory returns (uint256 positionId, uint256 tokenAmount) {
        uint256 held = IERC20(launchToken).balanceOf(address(this));
        if (held < supply) revert SupplyNotReceived(supply, held);

        bool tokenIsCurrency0 = Currency.unwrap(key.currency0) == launchToken;
        _approvePermit2(launchToken, supply);

        positionId = positionManager.nextTokenId();
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key,
            p.tickLower,
            p.tickUpper,
            uint256(p.liquidity),
            tokenIsCurrency0 ? uint128(supply) : uint128(0),
            tokenIsCurrency0 ? uint128(0) : uint128(supply),
            address(locker),
            bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp + MINT_DEADLINE_WINDOW);

        uint256 left = IERC20(launchToken).balanceOf(address(this));
        tokenAmount = held - left;
        if (left != 0) {
            IERC20(launchToken).safeTransfer(address(locker), left);
            emit LaunchDustLocked(launchToken, left);
        }
    }

    function _approvePermit2(address token, uint256 amount) private {
        IERC20(token).forceApprove(address(permit2), amount);
        permit2.approve(
            token, address(positionManager), uint160(amount), uint48(block.timestamp + MINT_DEADLINE_WINDOW)
        );
    }
}
