// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {IQuoteReferenceRegistry} from "./V4LaunchQuotePricer.sol";

interface IV4LaunchFactoryPoolKeys {
    function poolKeyFor(address token) external view returns (PoolKey memory);
}

contract V4LaunchReferenceRegistry is IQuoteReferenceRegistry {
    IV4LaunchFactoryPoolKeys public immutable factory;

    constructor(IV4LaunchFactoryPoolKeys factory_) {
        factory = factory_;
    }

    function referencePool(address token) external view returns (bool found, PoolKey memory key) {
        try factory.poolKeyFor(token) returns (PoolKey memory k) {
            return (true, k);
        } catch {
            return (false, key);
        }
    }
}

interface IPonsV2LaunchFactory {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
}

contract PonsReferenceRegistry is IQuoteReferenceRegistry {
    IPonsV2LaunchFactory public immutable ponsFactory;
    IHooks public immutable ponsHook;

    constructor(IPonsV2LaunchFactory ponsFactory_, IHooks ponsHook_) {
        ponsFactory = ponsFactory_;
        ponsHook = ponsHook_;
    }

    function referencePool(address token) external view returns (bool found, PoolKey memory key) {
        IPonsV2LaunchFactory.LaunchedToken memory t;
        try ponsFactory.getLaunchedToken(token) returns (IPonsV2LaunchFactory.LaunchedToken memory got) {
            t = got;
        } catch {
            return (false, key);
        }
        if (!t.exists) return (false, key);
        (address c0, address c1) = t.pairToken < token ? (t.pairToken, token) : (token, t.pairToken);
        key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: t.poolFee,
            tickSpacing: t.tickSpacing,
            hooks: ponsHook
        });
        found = true;
    }
}
