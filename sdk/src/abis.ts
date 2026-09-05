import { parseAbi } from "viem";

const socials = "(string twitter,string telegram,string discord,string website,string farcaster)";
const tokenParams = `(string name,string symbol,string logo,string description,${socials} socials,address creatorFeeRecipient,uint16 creatorTaxBps,bytes32 expectedEconomics,bytes32 salt)`;
const poolKey = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const reference = `(uint8 kind,address v3Pool,${poolKey} v4Key,address anchor,uint256 anchorDepth,uint256 anchorFloor,bool qualifies)`;

export const factoryAbi = parseAbi([
  "function canLaunch(address launcher) view returns (bool)",
  "function launchFee() view returns (uint256)",
  "function launchDeployer() view returns (address)",
  "function positionMinter() view returns (address)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns ((uint256 supply,uint256 phantomQuote,int24 tickSpacing,bool enabled))",
  "function getLaunchedToken(address token) view returns ((address token,address deployer,address creatorFeeRecipient,address pairToken,uint256 phantomQuote,uint24 poolFee,int24 tickSpacing,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 positionId,uint16 baseFeeBps,uint16 creatorTaxBps,uint16 protocolFeeShareBps,address protocolFeeRecipient,uint64 launchedAt,bool exists))",
  "function previewQuoteEconomics(uint256 launchConfigId,address pairToken) view returns (uint256 phantomQuote)",
  "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
  `function launchToken(${tokenParams} params,uint256 launchConfigId,address pairToken) payable returns (address token,bytes32 poolId)`,
  `function poolKeyFor(address token) view returns (${poolKey})`,
  "event TokenLaunched(address indexed token,bytes32 indexed poolId,address indexed deployer,address pairToken,uint256 launchConfigId,uint24 poolFee)",
  "event LaunchPositionMinted(address indexed token,uint256 positionId,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 tokenAmount,uint256 phantomQuote)",
  "event CreatorFeeRecipientUpdated(address indexed token,address indexed previousRecipient,address indexed newRecipient)",
]);

export const quotePricerAbi = parseAbi([
  "function minReferenceEth() view returns (uint256)",
  "function isPriceable(address quoteToken) view returns (bool)",
  "function priceEthAmountInQuote(address quoteToken,uint256 ethAmount) view returns (uint256)",
  `function describe(address quoteToken) view returns (${reference} direct,${reference} usdgLeg,${reference} viaUsdg)`,
]);

export const launchDeployerAbi = parseAbi([
  `function predictTokenAddress((address originalDeployer,address supplyRecipient,uint256 supply,bytes32 salt,string name,string symbol,string logo,string description,${socials} socials) params) view returns (address)`,
]);

export const routerAbi = parseAbi([
  `function launchAndBuyWithQuote(${tokenParams} params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut) payable returns (address token,bytes32 poolId,uint256 tokensOut)`,
  `function launchAndBuyWithEth(${tokenParams} params,uint256 launchConfigId,address pairToken,(bytes v3Path,${poolKey}[] v4Hops) leg,uint256 minTokensOut) payable returns (address token,bytes32 poolId,uint256 tokensOut)`,
  `function buyWithEth(${poolKey} key,(bytes v3Path,${poolKey}[] v4Hops) leg,uint256 minTokensOut,address recipient) payable returns (uint256 tokensOut)`,
  `function sellToEth(${poolKey} key,bool tokenIsCurrency0,uint256 tokensIn,(bytes v3Path,${poolKey}[] v4Hops) leg,uint256 minEthOut,address recipient) returns (uint256 ethOut)`,
  `function swapExactIn(${poolKey} key,bool zeroForOne,uint256 amountIn,uint256 minAmountOut,address recipient) payable returns (uint256 amountOut)`,
  "event ZapBuy(bytes32 indexed poolId,address indexed buyer,uint256 ethIn,uint256 tokensOut)",
  "event ZapSell(bytes32 indexed poolId,address indexed seller,uint256 tokensIn,uint256 ethOut)",
]);

export const lockerAbi = parseAbi([
  "function pendingFees(address token) view returns (uint256 amount0,uint256 amount1)",
  "function collectFees(address token) returns (uint256 amount0,uint256 amount1)",
  "event FeesCollected(address indexed token,address currency0,address currency1,uint256 protocolAmount0,uint256 protocolAmount1,uint256 creatorAmount0,uint256 creatorAmount1)",
  "event ProtocolShareBurned(address indexed token,uint256 amount)",
]);

export const feeEscrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient,address token) view returns (uint256)",
  "function claim() returns (uint256 amount)",
  "function claimToken(address token) returns (uint256 amount)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export const v3PoolAbi = parseAbi([
  "function fee() view returns (uint24)",
]);

export const launchTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function socials() view returns (string twitter,string telegram,string discord,string website,string farcaster)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export const poolManagerAbi = parseAbi([
  "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)",
]);
