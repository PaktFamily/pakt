// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

interface IUniswapV3PoolMinimal {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

interface IUniswapV3FactoryMinimal {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IQuoteReferenceRegistry {
    function referencePool(address token) external view returns (bool found, PoolKey memory key);
}

contract V4LaunchQuotePricer is Ownable2Step {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    error QuoteAssetNotPriceable(address quoteToken);
    error ZeroAddress();
    error ConversionOverflow();
    error HookNotAllowed(address hook);
    error NotAnAnchorPool();
    error PoolNotInitialized();
    error PoolAlreadyRegistered(bytes32 poolId);
    error TooManyPools(address token);
    error TooManyRegistries();
    error RegistryAlreadyAdded(address registry);
    error UnknownRegistry(address registry);
    error NotAContract(address registry);

    event MinReferenceDepthUpdated(uint256 minReferenceEth);
    event V4HookAllowed(address indexed hook, bool allowed);
    event V4PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed anchor, PoolKey key);
    event RegistryAdded(address indexed registry);
    event RegistryRemoved(address indexed registry);

    struct V4Pool {
        PoolKey key;
        address token;
        address anchor;
        bool registered;
    }

    enum ReferenceKind {
        None,
        V3,
        V4
    }

    struct Reference {
        ReferenceKind kind;
        address v3Pool;
        PoolKey v4Key;
        address anchor;
        uint256 anchorDepth;
        uint256 anchorFloor;
        bool qualifies;
    }

    uint24 private constant FEE_LOW = 500;
    uint24 private constant FEE_MEDIUM = 3_000;
    uint24 private constant FEE_HIGH = 10_000;

    uint8 public constant MAX_V4_POOLS_PER_TOKEN = 8;
    uint8 public constant MAX_REGISTRIES = 8;

    IUniswapV3FactoryMinimal public immutable v3Factory;
    IPoolManager public immutable poolManager;
    address public immutable weth;
    address public immutable usdg;

    uint256 public minReferenceEth = 5 ether;

    mapping(address hook => bool) public allowedV4Hooks;
    mapping(bytes32 poolId => V4Pool) private _v4Pools;
    mapping(address token => bytes32[]) private _v4PoolsOf;
    bytes32[] public allV4Pools;
    IQuoteReferenceRegistry[] public registries;

    constructor(
        address initialOwner,
        IUniswapV3FactoryMinimal v3Factory_,
        address weth_,
        address usdg_,
        IPoolManager poolManager_
    ) Ownable(initialOwner) {
        if (
            address(v3Factory_) == address(0) || weth_ == address(0) || usdg_ == address(0)
                || address(poolManager_) == address(0)
        ) revert ZeroAddress();
        v3Factory = v3Factory_;
        weth = weth_;
        usdg = usdg_;
        poolManager = poolManager_;
        allowedV4Hooks[address(0)] = true;
        emit V4HookAllowed(address(0), true);
    }

    function setMinReferenceEth(uint256 minEth) external onlyOwner {
        minReferenceEth = minEth;
        emit MinReferenceDepthUpdated(minEth);
    }

    function setV4HookAllowed(address hook, bool allowed) external onlyOwner {
        allowedV4Hooks[hook] = allowed;
        emit V4HookAllowed(hook, allowed);
    }

    function addRegistry(IQuoteReferenceRegistry registry) external onlyOwner {
        if (address(registry) == address(0)) revert ZeroAddress();
        if (address(registry).code.length == 0) revert NotAContract(address(registry));
        if (registries.length >= MAX_REGISTRIES) revert TooManyRegistries();
        for (uint256 i = 0; i < registries.length; ++i) {
            if (registries[i] == registry) revert RegistryAlreadyAdded(address(registry));
        }
        registries.push(registry);
        emit RegistryAdded(address(registry));
    }

    function removeRegistry(IQuoteReferenceRegistry registry) external onlyOwner {
        uint256 n = registries.length;
        for (uint256 i = 0; i < n; ++i) {
            if (registries[i] != registry) continue;
            registries[i] = registries[n - 1];
            registries.pop();
            emit RegistryRemoved(address(registry));
            return;
        }
        revert UnknownRegistry(address(registry));
    }

    function registriesLength() external view returns (uint256) {
        return registries.length;
    }

    function registerV4Pool(PoolKey calldata key) external returns (bytes32 poolId) {
        if (!allowedV4Hooks[address(key.hooks)]) revert HookNotAllowed(address(key.hooks));
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        (address anchor, address token, bool ok) = _splitAnchor(c0, c1);
        if (!ok) revert NotAnAnchorPool();

        poolId = PoolId.unwrap(key.toId());
        if (_v4Pools[poolId].registered) revert PoolAlreadyRegistered(poolId);
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(PoolId.wrap(poolId));
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();
        if (_v4PoolsOf[token].length >= MAX_V4_POOLS_PER_TOKEN) revert TooManyPools(token);

        _v4Pools[poolId] = V4Pool({key: key, token: token, anchor: anchor, registered: true});
        _v4PoolsOf[token].push(poolId);
        allV4Pools.push(poolId);
        emit V4PoolRegistered(poolId, token, anchor, key);
    }

    function allV4PoolsLength() external view returns (uint256) {
        return allV4Pools.length;
    }

    function v4PoolsOf(address token) external view returns (bytes32[] memory) {
        return _v4PoolsOf[token];
    }

    function v4PoolIdFor(PoolKey calldata key) external pure returns (bytes32) {
        return PoolId.unwrap(key.toId());
    }

    function quoteEconomics(address quoteToken, uint256 phantomQuoteEth) external view returns (uint256 phantomQuote) {
        phantomQuote = priceEthAmountInQuote(quoteToken, phantomQuoteEth);
        if (phantomQuote == 0) revert QuoteAssetNotPriceable(quoteToken);
    }

    function priceEthAmountInQuote(address quoteToken, uint256 ethAmount) public view returns (uint256) {
        if (quoteToken == weth) return ethAmount;

        Reference memory direct = _bestReference(quoteToken, true, minReferenceEth);
        if (direct.qualifies) return _convert(direct, quoteToken, ethAmount);

        Reference memory leg1 = _bestReference(usdg, true, minReferenceEth);
        if (leg1.qualifies) {
            uint256 usdgFloor = _convert(leg1, usdg, minReferenceEth);
            Reference memory leg2 = _bestReference(quoteToken, false, usdgFloor);
            if (leg2.qualifies) {
                return _convert(leg2, quoteToken, _convert(leg1, usdg, ethAmount));
            }
        }

        revert QuoteAssetNotPriceable(quoteToken);
    }

    function isPriceable(address quoteToken) external view returns (bool) {
        if (quoteToken == weth) return true;
        (Reference memory direct, Reference memory usdgLeg, Reference memory viaUsdg) = describe(quoteToken);
        return direct.qualifies || (usdgLeg.qualifies && viaUsdg.qualifies);
    }

    function describe(address quoteToken)
        public
        view
        returns (Reference memory direct, Reference memory usdgLeg, Reference memory viaUsdg)
    {
        direct = _bestReference(quoteToken, true, minReferenceEth);
        usdgLeg = _bestReference(usdg, true, minReferenceEth);
        uint256 usdgFloor = usdgLeg.qualifies ? _convert(usdgLeg, usdg, minReferenceEth) : 0;
        viaUsdg = _bestReference(quoteToken, false, usdgFloor);
        if (!usdgLeg.qualifies) viaUsdg.qualifies = false;
    }

    function _bestReference(address token, bool ethAnchor, uint256 floor) private view returns (Reference memory r) {
        address v3Anchor = ethAnchor ? weth : usdg;
        (address v3Pool, uint256 v3Depth) = _bestV3Pool(token, v3Anchor);
        (PoolKey memory v4Key, address v4Anchor, uint256 v4Depth, bool v4Found) = _bestV4Pool(token, ethAnchor);

        if (v3Pool == address(0) && !v4Found) {
            r.anchor = v3Anchor;
            r.anchorFloor = floor;
            return r;
        }
        if (v3Pool != address(0) && (!v4Found || v3Depth >= v4Depth)) {
            r.kind = ReferenceKind.V3;
            r.v3Pool = v3Pool;
            r.anchor = v3Anchor;
            r.anchorDepth = v3Depth;
        } else {
            r.kind = ReferenceKind.V4;
            r.v4Key = v4Key;
            r.anchor = v4Anchor;
            r.anchorDepth = v4Depth;
        }
        r.anchorFloor = floor;
        r.qualifies = r.anchorDepth >= floor;
    }

    function _bestV3Pool(address token, address anchor) private view returns (address best, uint256 bestBalance) {
        uint24[3] memory tiers = [FEE_LOW, FEE_MEDIUM, FEE_HIGH];
        for (uint256 i = 0; i < tiers.length; ++i) {
            address pool = v3Factory.getPool(token, anchor, tiers[i]);
            if (pool == address(0)) continue;
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3PoolMinimal(pool).slot0();
            if (sqrtPriceX96 == 0) continue;
            uint256 anchorBalance = IERC20(anchor).balanceOf(pool);
            if (anchorBalance > bestBalance) {
                bestBalance = anchorBalance;
                best = pool;
            }
        }
    }

    function _bestV4Pool(address token, bool ethAnchor)
        private
        view
        returns (PoolKey memory bestKey, address bestAnchor, uint256 bestDepth, bool found)
    {
        bytes32[] storage ids = _v4PoolsOf[token];
        for (uint256 i = 0; i < ids.length; ++i) {
            V4Pool storage p = _v4Pools[ids[i]];
            (uint256 depth, bool ok) = _v4Candidate(p.key, p.anchor, ethAnchor);
            if (ok && (!found || depth > bestDepth)) {
                (bestKey, bestAnchor, bestDepth, found) = (p.key, p.anchor, depth, true);
            }
        }
        for (uint256 i = 0; i < registries.length; ++i) {
            (bool has, PoolKey memory key) = _registryPool(registries[i], token);
            if (!has) continue;
            (address anchor, address priced, bool split) =
                _splitAnchor(Currency.unwrap(key.currency0), Currency.unwrap(key.currency1));
            if (!split || priced != token) continue;
            (uint256 depth, bool ok) = _v4Candidate(key, anchor, ethAnchor);
            if (ok && (!found || depth > bestDepth)) {
                (bestKey, bestAnchor, bestDepth, found) = (key, anchor, depth, true);
            }
        }
    }

    function _registryPool(IQuoteReferenceRegistry registry, address token)
        private
        view
        returns (bool found, PoolKey memory key)
    {
        if (address(registry).code.length == 0) return (false, key);
        try registry.referencePool(token) returns (bool f, PoolKey memory k) {
            return (f, k);
        } catch {
            return (false, key);
        }
    }

    function _v4Candidate(PoolKey memory key, address anchor, bool ethAnchor)
        private
        view
        returns (uint256 depth, bool ok)
    {
        bool isEth = anchor == address(0) || anchor == weth;
        if (isEth != ethAnchor) return (0, false);
        if (!allowedV4Hooks[address(key.hooks)]) return (0, false);
        depth = _v4AnchorDepth(key, anchor);
        ok = depth > 0;
    }

    function _splitAnchor(address c0, address c1) private view returns (address anchor, address token, bool ok) {
        bool eth0 = c0 == address(0) || c0 == weth;
        bool eth1 = c1 == address(0) || c1 == weth;
        if (eth0 || eth1) {
            return eth0 ? (c0, c1, true) : (c1, c0, true);
        }
        if (c0 == usdg) return (c0, c1, true);
        if (c1 == usdg) return (c1, c0, true);
        return (address(0), address(0), false);
    }

    function _v4AnchorDepth(PoolKey memory key, address anchor) private view returns (uint256) {
        PoolId id = key.toId();
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(id);
        uint128 liquidity = poolManager.getLiquidity(id);
        if (sqrtPriceX96 == 0 || liquidity == 0) return 0;
        bool anchorIsCurrency0 = anchor == Currency.unwrap(key.currency0);
        return anchorIsCurrency0
            ? FullMath.mulDiv(liquidity, 1 << 96, sqrtPriceX96)
            : FullMath.mulDiv(liquidity, sqrtPriceX96, 1 << 96);
    }

    function _convert(Reference memory r, address token, uint256 anchorAmount) private view returns (uint256) {
        if (anchorAmount > type(uint128).max) revert ConversionOverflow();
        uint160 sqrtPriceX96;
        address base;
        if (r.kind == ReferenceKind.V3) {
            (sqrtPriceX96,,,,,,) = IUniswapV3PoolMinimal(r.v3Pool).slot0();
            base = r.anchor;
        } else {
            (sqrtPriceX96,,,) = poolManager.getSlot0(r.v4Key.toId());
            base = r.anchor;
        }
        return _quoteAtSqrtPrice(sqrtPriceX96, uint128(anchorAmount), base, token);
    }

    function _quoteAtSqrtPrice(uint160 sqrtRatioX96, uint128 baseAmount, address baseToken, address quoteToken)
        private
        pure
        returns (uint256 quoteAmount)
    {
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
