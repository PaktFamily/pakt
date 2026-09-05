// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {V4LaunchFactory} from "./V4LaunchFactory.sol";

interface ISwapRouter02 {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH9 is IERC20 {
    function withdraw(uint256 amount) external;
}

contract V4LaunchRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolManager public immutable manager;
    V4LaunchFactory public immutable factory;
    ISwapRouter02 public immutable swapRouter;
    IWETH9 public immutable weth;

    error NotPoolManager();
    error ZeroAmount();
    error ZeroAddress();
    error NativeValueMismatch();
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);
    error EthTransferFailed();
    error NativeQuoteNeedsNoZap();
    error InsufficientLaunchValue();
    error PathTooShort();
    error PathStartMismatch(address expected);
    error PathEndMismatch(address expected);
    error RouteBroken(uint256 index);
    error RouteEndMismatch(address expected, address actual);

    event ZapBuy(bytes32 indexed poolId, address indexed buyer, uint256 ethIn, uint256 tokensOut);
    event ZapSell(bytes32 indexed poolId, address indexed seller, uint256 tokensIn, uint256 ethOut);

    struct EthLeg {
        bytes v3Path;
        PoolKey[] v4Hops;
    }

    struct Route {
        PoolKey[] hops;
        Currency currencyIn;
        uint256 amountIn;
        uint256 minAmountOut;
        address payer;
        address recipient;
        address swapper;
    }

    constructor(IPoolManager manager_, V4LaunchFactory factory_, ISwapRouter02 swapRouter_, IWETH9 weth_) {
        if (
            address(manager_) == address(0) || address(factory_) == address(0) || address(swapRouter_) == address(0)
                || address(weth_) == address(0)
        ) revert ZeroAddress();
        manager = manager_;
        factory = factory_;
        swapRouter = swapRouter_;
        weth = weth_;
    }

    function swapExactIn(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        Currency currencyIn = zeroForOne ? key.currency0 : key.currency1;
        if (currencyIn.isAddressZero()) {
            if (msg.value != amountIn) revert NativeValueMismatch();
        } else if (msg.value != 0) {
            revert NativeValueMismatch();
        }

        PoolKey[] memory hops = new PoolKey[](1);
        hops[0] = key;
        (amountOut,) = _route(
            Route({
                hops: hops,
                currencyIn: currencyIn,
                amountIn: amountIn,
                minAmountOut: minAmountOut,
                payer: msg.sender,
                recipient: recipient,
                swapper: msg.sender
            })
        );
    }

    function buyWithEth(PoolKey calldata key, EthLeg calldata leg, uint256 minTokensOut, address recipient)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (msg.value == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        tokensOut = _buyAlongLeg(key, leg, msg.value, minTokensOut, recipient);
        emit ZapBuy(_poolId(key), msg.sender, msg.value, tokensOut);
    }

    function sellToEth(
        PoolKey calldata key,
        bool tokenIsCurrency0,
        uint256 tokensIn,
        EthLeg calldata leg,
        uint256 minEthOut,
        address recipient
    ) external nonReentrant returns (uint256 ethOut) {
        if (tokensIn == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        bool v3Tail = leg.v3Path.length != 0;
        PoolKey[] memory hops = new PoolKey[](1 + leg.v4Hops.length);
        hops[0] = key;
        for (uint256 i = 0; i < leg.v4Hops.length; i++) {
            hops[i + 1] = leg.v4Hops[i];
        }

        (uint256 out, Currency outCurrency) = _route(
            Route({
                hops: hops,
                currencyIn: tokenIsCurrency0 ? key.currency0 : key.currency1,
                amountIn: tokensIn,
                minAmountOut: v3Tail ? 0 : minEthOut,
                payer: msg.sender,
                recipient: v3Tail ? address(this) : recipient,
                swapper: msg.sender
            })
        );

        if (!v3Tail) {
            if (!outCurrency.isAddressZero()) revert RouteEndMismatch(address(0), Currency.unwrap(outCurrency));
            ethOut = out;
        } else {
            address first = _requirePathEndpoints(leg.v3Path, address(0), address(weth));
            if (first != Currency.unwrap(outCurrency)) revert RouteEndMismatch(first, Currency.unwrap(outCurrency));
            IERC20(first).forceApprove(address(swapRouter), out);
            ethOut = _v3ExactInput(leg.v3Path, out, minEthOut, 0);
            weth.withdraw(ethOut);
            _sendEth(recipient, ethOut);
        }
        emit ZapSell(_poolId(key), msg.sender, tokensIn, ethOut);
    }

    function launchAndBuyWithEth(
        V4LaunchFactory.TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        EthLeg calldata leg,
        uint256 minTokensOut
    ) external payable nonReentrant returns (address token, PoolId poolId, uint256 tokensOut) {
        uint256 launchFee = factory.launchFee();
        if (msg.value < launchFee) revert InsufficientLaunchValue();
        uint256 buyValue = msg.value - launchFee;

        (token, poolId) = factory.launchTokenFor{value: launchFee}(params, launchConfigId, pairToken, msg.sender);
        if (buyValue == 0) return (token, poolId, 0);

        PoolKey memory key = factory.poolKeyFor(token);
        if (pairToken == address(0)) {
            PoolKey[] memory hops = new PoolKey[](1);
            hops[0] = key;
            (tokensOut,) = _route(
                Route({
                    hops: hops,
                    currencyIn: key.currency0,
                    amountIn: buyValue,
                    minAmountOut: minTokensOut,
                    payer: msg.sender,
                    recipient: msg.sender,
                    swapper: msg.sender
                })
            );
        } else {
            tokensOut = _buyAlongLeg(key, leg, buyValue, minTokensOut, msg.sender);
            emit ZapBuy(PoolId.unwrap(poolId), msg.sender, buyValue, tokensOut);
        }
    }

    function launchAndBuyWithQuote(
        V4LaunchFactory.TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        uint256 quoteIn,
        uint256 minTokensOut
    ) external payable nonReentrant returns (address token, PoolId poolId, uint256 tokensOut) {
        if (pairToken == address(0)) revert NativeQuoteNeedsNoZap();
        if (msg.value != factory.launchFee()) revert InsufficientLaunchValue();

        (token, poolId) = factory.launchTokenFor{value: msg.value}(params, launchConfigId, pairToken, msg.sender);
        if (quoteIn == 0) return (token, poolId, 0);

        PoolKey memory key = factory.poolKeyFor(token);
        PoolKey[] memory hops = new PoolKey[](1);
        hops[0] = key;
        (tokensOut,) = _route(
            Route({
                hops: hops,
                currencyIn: Currency.wrap(pairToken),
                amountIn: quoteIn,
                minAmountOut: minTokensOut,
                payer: msg.sender,
                recipient: msg.sender,
                swapper: msg.sender
            })
        );
    }

    function _buyAlongLeg(
        PoolKey memory key,
        EthLeg calldata leg,
        uint256 ethIn,
        uint256 minTokensOut,
        address recipient
    ) private returns (uint256 tokensOut) {
        PoolKey[] memory hops = new PoolKey[](leg.v4Hops.length + 1);
        for (uint256 i = 0; i < leg.v4Hops.length; i++) {
            hops[i] = leg.v4Hops[i];
        }
        hops[leg.v4Hops.length] = key;

        Currency currencyIn;
        uint256 amountIn;
        address payer;
        if (leg.v3Path.length != 0) {
            address last = _requirePathEndpoints(leg.v3Path, address(weth), address(0));
            currencyIn = Currency.wrap(last);
            amountIn = _v3ExactInput(leg.v3Path, ethIn, 0, ethIn);
            payer = address(this);
        } else {
            currencyIn = Currency.wrap(address(0));
            amountIn = ethIn;
            payer = msg.sender;
        }

        (tokensOut,) = _route(
            Route({
                hops: hops,
                currencyIn: currencyIn,
                amountIn: amountIn,
                minAmountOut: minTokensOut,
                payer: payer,
                recipient: recipient,
                swapper: msg.sender
            })
        );
    }

    function _route(Route memory r) private returns (uint256 amountOut, Currency currencyOut) {
        bytes memory result = manager.unlock(abi.encode(r));
        (amountOut, currencyOut) = abi.decode(result, (uint256, Currency));
    }

    function unlockCallback(bytes calldata raw) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotPoolManager();
        Route memory r = abi.decode(raw, (Route));

        Currency current = r.currencyIn;
        uint256 amount = r.amountIn;
        uint256 n = r.hops.length;
        for (uint256 i = 0; i < n; i++) {
            PoolKey memory key = r.hops[i];
            bool zeroForOne;
            if (current == key.currency0) zeroForOne = true;
            else if (current == key.currency1) zeroForOne = false;
            else revert RouteBroken(i);

            BalanceDelta delta = manager.swap(
                key,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amount),
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                ""
            );
            int128 outSigned = zeroForOne ? delta.amount1() : delta.amount0();
            amount = uint256(uint128(outSigned));
            current = zeroForOne ? key.currency1 : key.currency0;
        }
        if (current == r.currencyIn) revert RouteBroken(n);
        if (amount < r.minAmountOut) revert SlippageExceeded(amount, r.minAmountOut);

        uint256 owed = uint256(-_delta(r.currencyIn));
        if (r.currencyIn.isAddressZero()) {
            manager.sync(r.currencyIn);
            manager.settle{value: owed}();
            uint256 excess = r.amountIn - owed;
            if (excess != 0) _sendEth(r.payer == address(this) ? r.swapper : r.payer, excess);
        } else {
            manager.sync(r.currencyIn);
            IERC20 tokenIn = IERC20(Currency.unwrap(r.currencyIn));
            if (r.payer == address(this)) {
                tokenIn.safeTransfer(address(manager), owed);
                uint256 excess = r.amountIn - owed;
                if (excess != 0) tokenIn.safeTransfer(r.swapper, excess);
            } else {
                tokenIn.safeTransferFrom(r.payer, address(manager), owed);
            }
            manager.settle();
        }

        if (amount != 0) manager.take(current, r.recipient, amount);

        Currency mid = r.currencyIn;
        for (uint256 i = 0; i + 1 < n; i++) {
            PoolKey memory key = r.hops[i];
            mid = mid == key.currency0 ? key.currency1 : key.currency0;
            int256 left = _delta(mid);
            if (left > 0) manager.take(mid, r.swapper, uint256(left));
        }

        return abi.encode(amount, current);
    }

    function _delta(Currency currency) private view returns (int256) {
        bytes32 slot = keccak256(abi.encode(address(this), Currency.unwrap(currency)));
        return int256(uint256(manager.exttload(slot)));
    }

    function _v3ExactInput(bytes calldata path, uint256 amountIn, uint256 minOut, uint256 value)
        private
        returns (uint256)
    {
        return swapRouter.exactInput{value: value}(
            ISwapRouter02.ExactInputParams({
                path: path, recipient: address(this), amountIn: amountIn, amountOutMinimum: minOut
            })
        );
    }

    function _poolId(PoolKey calldata key) private pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    function _requirePathEndpoints(bytes calldata path, address first, address last)
        private
        pure
        returns (address other)
    {
        if (path.length < 43) revert PathTooShort();
        address start = address(bytes20(path[:20]));
        address end = address(bytes20(path[path.length - 20:]));
        if (first != address(0) && start != first) revert PathStartMismatch(first);
        if (last != address(0) && end != last) revert PathEndMismatch(last);
        other = first == address(0) ? start : end;
    }

    function _sendEth(address recipient, uint256 amount) private {
        (bool sent,) = payable(recipient).call{value: amount}("");
        if (!sent) revert EthTransferFailed();
    }

    receive() external payable {}
}
