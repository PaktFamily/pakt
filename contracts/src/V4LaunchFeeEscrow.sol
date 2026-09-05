// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IV4LaunchFeeEscrow} from "./interfaces/IV4Launchpad.sol";

contract V4LaunchFeeEscrow is IV4LaunchFeeEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error NativeValueRequired();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();

    event Credited(address indexed recipient, uint256 amount);
    event CreditedToken(address indexed recipient, address indexed token, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);
    event ClaimedToken(address indexed recipient, address indexed token, uint256 amount);

    mapping(address recipient => uint256 amount) private _nativeBalances;
    mapping(address recipient => mapping(address token => uint256 amount)) private _tokenBalances;

    function credit(address recipient) external payable {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert NativeValueRequired();
        _nativeBalances[recipient] += msg.value;
        emit Credited(recipient, msg.value);
    }

    function creditToken(address recipient, address token, uint256 amount) external {
        if (recipient == address(0) || token == address(0)) revert ZeroAddress();
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        _tokenBalances[recipient][token] += received;
        emit CreditedToken(recipient, token, received);
    }

    function claim() external returns (uint256 amount) {
        return _claimNative(_nativeBalances[msg.sender]);
    }

    function claim(uint256 amount) external returns (uint256) {
        return _claimNative(amount);
    }

    function claimToken(address token) external returns (uint256 amount) {
        return _claimToken(token, _tokenBalances[msg.sender][token]);
    }

    function claimToken(address token, uint256 amount) external returns (uint256) {
        return _claimToken(token, amount);
    }

    function balanceOf(address recipient) external view returns (uint256) {
        return _nativeBalances[recipient];
    }

    function balanceOfToken(address recipient, address token) external view returns (uint256) {
        return _tokenBalances[recipient][token];
    }

    function _claimNative(uint256 amount) private nonReentrant returns (uint256) {
        uint256 available = _nativeBalances[msg.sender];
        if (amount > available) revert InsufficientBalance(amount, available);
        if (amount == 0) return 0;

        _nativeBalances[msg.sender] = available - amount;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Claimed(msg.sender, amount);
        return amount;
    }

    function _claimToken(address token, uint256 amount) private nonReentrant returns (uint256) {
        uint256 available = _tokenBalances[msg.sender][token];
        if (amount > available) revert InsufficientBalance(amount, available);
        if (amount == 0) return 0;

        _tokenBalances[msg.sender][token] = available - amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit ClaimedToken(msg.sender, token, amount);
        return amount;
    }
}
