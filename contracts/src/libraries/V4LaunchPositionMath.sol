// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

library V4LaunchPositionMath {
    error ZeroAmount();
    error UnsupportedPrice();
    error PositionTooSmall();
    error InvalidTickSpacing();

    int24 private constant MIN_USABLE_TICK = -887272;
    int24 private constant MAX_USABLE_TICK = 887272;

    struct Plan {
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    function plan(bool tokenIsCurrency0, uint256 supply, uint256 phantomQuote, int24 tickSpacing)
        internal
        pure
        returns (Plan memory p)
    {
        if (tickSpacing <= 0) revert InvalidTickSpacing();
        if (supply == 0 || phantomQuote == 0) revert ZeroAmount();

        uint160 openingSqrtPrice = tokenIsCurrency0
            ? sqrtPriceX96FromAmounts(supply, phantomQuote)
            : sqrtPriceX96FromAmounts(phantomQuote, supply);
        if (openingSqrtPrice <= TickMath.MIN_SQRT_PRICE || openingSqrtPrice >= TickMath.MAX_SQRT_PRICE) {
            revert UnsupportedPrice();
        }
        int24 openingTick = _nearestUsableTick(TickMath.getTickAtSqrtPrice(openingSqrtPrice), tickSpacing);

        if (tokenIsCurrency0) {
            p.tickLower = openingTick;
            p.tickUpper = _floorToSpacing(MAX_USABLE_TICK, tickSpacing);
            if (p.tickLower >= p.tickUpper) revert UnsupportedPrice();
            p.sqrtPriceX96 = TickMath.getSqrtPriceAtTick(p.tickLower);
            uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(p.tickUpper);
            p.liquidity = LiquidityAmounts.getLiquidityForAmount0(p.sqrtPriceX96, sqrtUpper, supply);
            while (
                p.liquidity != 0 && SqrtPriceMath.getAmount0Delta(p.sqrtPriceX96, sqrtUpper, p.liquidity, true) > supply
            ) {
                p.liquidity -= 1;
            }
        } else {
            p.tickUpper = openingTick;
            p.tickLower = _ceilToSpacing(MIN_USABLE_TICK, tickSpacing);
            if (p.tickLower >= p.tickUpper) revert UnsupportedPrice();
            p.sqrtPriceX96 = TickMath.getSqrtPriceAtTick(p.tickUpper);
            uint160 sqrtLower = TickMath.getSqrtPriceAtTick(p.tickLower);
            p.liquidity = LiquidityAmounts.getLiquidityForAmount1(sqrtLower, p.sqrtPriceX96, supply);
            while (
                p.liquidity != 0 && SqrtPriceMath.getAmount1Delta(sqrtLower, p.sqrtPriceX96, p.liquidity, true) > supply
            ) {
                p.liquidity -= 1;
            }
        }
        if (p.liquidity == 0) revert PositionTooSmall();
    }

    function tokenAmountFor(bool tokenIsCurrency0, Plan memory p) internal pure returns (uint256) {
        return tokenIsCurrency0
            ? SqrtPriceMath.getAmount0Delta(p.sqrtPriceX96, TickMath.getSqrtPriceAtTick(p.tickUpper), p.liquidity, true)
            : SqrtPriceMath.getAmount1Delta(TickMath.getSqrtPriceAtTick(p.tickLower), p.sqrtPriceX96, p.liquidity, true);
    }

    function amountsForLiquidity(uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity)
        internal
        pure
        returns (uint256 amount0, uint256 amount1)
    {
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        if (sqrtPriceX96 <= sqrtLower) {
            amount0 = SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false);
        } else if (sqrtPriceX96 < sqrtUpper) {
            amount0 = SqrtPriceMath.getAmount0Delta(sqrtPriceX96, sqrtUpper, liquidity, false);
            amount1 = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtPriceX96, liquidity, false);
        } else {
            amount1 = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);
        }
    }

    function sqrtPriceX96FromAmounts(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        if (amount0 == 0 || amount1 == 0) revert ZeroAmount();

        if (_fitsQ192(amount0, amount1)) {
            uint256 ratioX192 = FullMath.mulDiv(amount1, 1 << 192, amount0);
            return uint160(Math.sqrt(ratioX192));
        }

        if (!_fitsQ128(amount0, amount1)) revert UnsupportedPrice();
        uint256 ratioX128 = FullMath.mulDiv(amount1, 1 << 128, amount0);
        uint256 sqrtPriceX64 = Math.sqrt(ratioX128);
        if (sqrtPriceX64 > type(uint128).max) revert UnsupportedPrice();
        return uint160(sqrtPriceX64 << 32);
    }

    function _nearestUsableTick(int24 tick, int24 tickSpacing) private pure returns (int24) {
        int24 floored = _floorToSpacing(tick, tickSpacing);
        int24 rounded = tick - floored >= tickSpacing / 2 ? floored + tickSpacing : floored;
        int24 lo = _ceilToSpacing(MIN_USABLE_TICK, tickSpacing);
        int24 hi = _floorToSpacing(MAX_USABLE_TICK, tickSpacing);
        if (rounded < lo) return lo;
        if (rounded > hi) return hi;
        return rounded;
    }

    function _floorToSpacing(int24 tick, int24 tickSpacing) private pure returns (int24) {
        int24 q = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) q -= 1;
        return q * tickSpacing;
    }

    function _ceilToSpacing(int24 tick, int24 tickSpacing) private pure returns (int24) {
        int24 q = tick / tickSpacing;
        if (tick > 0 && tick % tickSpacing != 0) q += 1;
        return q * tickSpacing;
    }

    function _fitsQ192(uint256 amount0, uint256 amount1) private pure returns (bool) {
        if (amount0 > type(uint192).max) return true;
        return amount1 < (amount0 << 64);
    }

    function _fitsQ128(uint256 amount0, uint256 amount1) private pure returns (bool) {
        if (amount0 > type(uint128).max) return true;
        return amount1 < (amount0 << 128);
    }
}
