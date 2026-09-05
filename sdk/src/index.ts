import {
  getAddress,
  encodePacked,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  erc20Abi,
  factoryAbi,
  feeEscrowAbi,
  launchDeployerAbi,
  lockerAbi,
  quotePricerAbi,
  routerAbi,
  v3PoolAbi,
} from "./abis.js";
import type {
  Deployment,
  EthLeg,
  LaunchInput,
  PoolKey,
  QuoteAssetStatus,
  Socials,
  TokenParams,
} from "./types.js";

export * from "./abis.js";
export * from "./types.js";

export const ROBINHOOD_CHAIN_ID = 4663;
export const NATIVE_TOKEN = zeroAddress;
export const EMPTY_ETH_LEG: EthLeg = { v3Path: "0x", v4Hops: [] };

const METADATA_LIMITS = {
  name: 64,
  symbol: 16,
  logo: 512,
  description: 2_048,
  social: 256,
} as const;

const EMPTY_SOCIALS: Socials = {
  twitter: "",
  telegram: "",
  discord: "",
  website: "",
  farcaster: "",
};

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function requireWithin(label: string, value: string, limit: number): void {
  if (byteLength(value) > limit) {
    throw new Error(`${label} exceeds the ${limit}-byte protocol limit`);
  }
}

function requireBytes32(value: Hex): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("salt must be exactly 32 bytes");
  }
}

export function normalizeTokenParams(input: LaunchInput, expectedEconomics: Hex): TokenParams {
  const logo = input.metadata.logo ?? "";
  const description = input.metadata.description ?? "";
  const socials: Socials = { ...EMPTY_SOCIALS, ...input.metadata.socials };
  const creatorTaxBps = input.creatorTaxBps ?? 0;

  if (byteLength(input.metadata.name) === 0) throw new Error("name is required");
  if (byteLength(input.metadata.symbol) === 0) throw new Error("symbol is required");
  requireWithin("name", input.metadata.name, METADATA_LIMITS.name);
  requireWithin("symbol", input.metadata.symbol, METADATA_LIMITS.symbol);
  requireWithin("logo", logo, METADATA_LIMITS.logo);
  requireWithin("description", description, METADATA_LIMITS.description);
  for (const [key, value] of Object.entries(socials)) {
    requireWithin(key, value, METADATA_LIMITS.social);
  }
  if (!Number.isInteger(creatorTaxBps) || creatorTaxBps < 0 || creatorTaxBps > 500) {
    throw new Error("creatorTaxBps must be an integer between 0 and 500");
  }
  requireBytes32(input.salt);

  return {
    name: input.metadata.name,
    symbol: input.metadata.symbol,
    logo,
    description,
    socials,
    creatorFeeRecipient: getAddress(input.creatorFeeRecipient ?? zeroAddress),
    creatorTaxBps,
    expectedEconomics,
    salt: input.salt,
  };
}

export async function inspectQuoteAsset(
  client: PublicClient,
  deployment: Pick<Deployment, "quotePricer">,
  quoteToken: Address,
): Promise<QuoteAssetStatus> {
  const minReferenceEth = await client.readContract({
    address: deployment.quotePricer,
    abi: quotePricerAbi,
    functionName: "minReferenceEth",
  });

  if (getAddress(quoteToken) === zeroAddress) {
    return { priceable: true, minReferenceEth };
  }

  const [priceable, references] = await Promise.all([
    client.readContract({
      address: deployment.quotePricer,
      abi: quotePricerAbi,
      functionName: "isPriceable",
      args: [quoteToken],
    }),
    client.readContract({
      address: deployment.quotePricer,
      abi: quotePricerAbi,
      functionName: "describe",
      args: [quoteToken],
    }),
  ]);

  return {
    priceable,
    minReferenceEth,
    direct: references[0],
    usdgLeg: references[1],
    viaUsdg: references[2],
  };
}

async function referenceV3Fee(client: PublicClient, pool: Address): Promise<number> {
  return Number(await client.readContract({ address: pool, abi: v3PoolAbi, functionName: "fee" }));
}

export async function buildBuyEthLeg(
  client: PublicClient,
  status: QuoteAssetStatus,
  quoteToken: Address,
  weth: Address,
  usdg: Address,
): Promise<EthLeg> {
  const quote = getAddress(quoteToken);
  const wrappedEth = getAddress(weth);
  const stable = getAddress(usdg);
  if (quote === zeroAddress) return EMPTY_ETH_LEG;
  const direct = status.direct;
  if (direct?.qualifies && direct.kind === 1) {
    const fee = await referenceV3Fee(client, direct.v3Pool);
    return { v3Path: encodePacked(["address", "uint24", "address"], [wrappedEth, fee, quote]), v4Hops: [] };
  }
  if (direct?.qualifies && direct.kind === 2 && getAddress(direct.anchor) === zeroAddress) {
    return { v3Path: "0x", v4Hops: [direct.v4Key] };
  }
  const ethToUsdg = status.usdgLeg;
  const usdgToQuote = status.viaUsdg;
  if (!ethToUsdg?.qualifies || !usdgToQuote?.qualifies) throw new Error("No atomic ETH route is available for this quote asset");
  if (ethToUsdg.kind === 1 && usdgToQuote.kind === 1) {
    const [firstFee, secondFee] = await Promise.all([
      referenceV3Fee(client, ethToUsdg.v3Pool),
      referenceV3Fee(client, usdgToQuote.v3Pool),
    ]);
    return {
      v3Path: encodePacked(
        ["address", "uint24", "address", "uint24", "address"],
        [wrappedEth, firstFee, stable, secondFee, quote],
      ),
      v4Hops: [],
    };
  }
  if (ethToUsdg.kind === 1 && usdgToQuote.kind === 2) {
    const fee = await referenceV3Fee(client, ethToUsdg.v3Pool);
    return {
      v3Path: encodePacked(["address", "uint24", "address"], [wrappedEth, fee, stable]),
      v4Hops: [usdgToQuote.v4Key],
    };
  }
  if (ethToUsdg.kind === 2 && usdgToQuote.kind === 2 && getAddress(ethToUsdg.anchor) === zeroAddress) {
    return { v3Path: "0x", v4Hops: [ethToUsdg.v4Key, usdgToQuote.v4Key] };
  }
  throw new Error("This quote is priceable, but its current pools cannot be used for an atomic opening buy");
}

export async function prepareLaunch(
  client: PublicClient,
  deployment: Deployment,
  input: LaunchInput,
) {
  const creator = getAddress(input.creator);
  const pairToken = getAddress(input.pairToken);

  const [canLaunch, launchFee, config, expectedEconomics, phantomQuote, launchDeployer, positionMinter, maxTax] =
    await Promise.all([
      client.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "canLaunch",
        args: [creator],
      }),
      client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "launchFee" }),
      client.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "getLaunchConfig",
        args: [input.launchConfigId],
      }),
      client.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "previewLaunchEconomics",
        args: [input.launchConfigId, pairToken],
      }),
      client.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "previewQuoteEconomics",
        args: [input.launchConfigId, pairToken],
      }),
      client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "launchDeployer" }),
      client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "positionMinter" }),
      client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
    ]);

  if (!canLaunch) throw new Error("launching is currently disabled for this account");
  if (!config.enabled) throw new Error(`launch config ${input.launchConfigId} is disabled`);
  if (BigInt(input.creatorTaxBps ?? 0) > maxTax) {
    throw new Error(`creatorTaxBps exceeds the current protocol maximum of ${maxTax}`);
  }

  const params = normalizeTokenParams(input, expectedEconomics);
  const predictedToken = await client.readContract({
    address: launchDeployer,
    abi: launchDeployerAbi,
    functionName: "predictTokenAddress",
    args: [
      {
        originalDeployer: creator,
        supplyRecipient: positionMinter,
        supply: config.supply,
        salt: params.salt,
        name: params.name,
        symbol: params.symbol,
        logo: params.logo,
        description: params.description,
        socials: params.socials,
      },
    ],
  });

  return {
    params,
    predictedToken,
    phantomQuote,
    openingMcapEth: config.phantomQuote,
    launchFee,
    supply: config.supply,
    tickSpacing: config.tickSpacing,
    directCall: {
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "launchToken" as const,
      args: [params, input.launchConfigId, pairToken] as const,
      value: launchFee,
    },
  };
}

export function launchAndBuyWithQuoteCall(
  deployment: Pick<Deployment, "router">,
  preview: Awaited<ReturnType<typeof prepareLaunch>>,
  input: Pick<LaunchInput, "launchConfigId" | "pairToken">,
  quoteIn: bigint,
  minTokensOut: bigint,
) {
  if (quoteIn <= 0n) throw new Error("quoteIn must be positive");
  if (minTokensOut <= 0n) throw new Error("minTokensOut must be positive");
  if (getAddress(input.pairToken) === zeroAddress) {
    throw new Error("use launchAndBuyWithEthCall for a native-ETH quote");
  }
  return {
    address: deployment.router,
    abi: routerAbi,
    functionName: "launchAndBuyWithQuote" as const,
    args: [preview.params, input.launchConfigId, input.pairToken, quoteIn, minTokensOut] as const,
    value: preview.launchFee,
  };
}

export function launchAndBuyWithEthCall(
  deployment: Pick<Deployment, "router">,
  preview: Awaited<ReturnType<typeof prepareLaunch>>,
  input: Pick<LaunchInput, "launchConfigId" | "pairToken">,
  ethIn: bigint,
  leg: EthLeg,
  minTokensOut: bigint,
) {
  if (ethIn <= 0n) throw new Error("ethIn must be positive");
  if (minTokensOut <= 0n) throw new Error("minTokensOut must be positive");
  return {
    address: deployment.router,
    abi: routerAbi,
    functionName: "launchAndBuyWithEth" as const,
    args: [preview.params, input.launchConfigId, input.pairToken, leg, minTokensOut] as const,
    value: preview.launchFee + ethIn,
  };
}

export async function getLaunchPool(
  client: PublicClient,
  deployment: Pick<Deployment, "factory">,
  token: Address,
): Promise<PoolKey> {
  return client.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "poolKeyFor",
    args: [token],
  });
}

export function collectFeesCall(deployment: Pick<Deployment, "locker">, token: Address) {
  return {
    address: deployment.locker,
    abi: lockerAbi,
    functionName: "collectFees" as const,
    args: [token] as const,
  };
}

export function approveQuoteCall(token: Address, router: Address, amount: bigint) {
  if (amount <= 0n) throw new Error("approval amount must be positive");
  return {
    address: token,
    abi: erc20Abi,
    functionName: "approve" as const,
    args: [router, amount] as const,
  };
}

export function claimNativeFeesCall(deployment: Pick<Deployment, "feeEscrow">) {
  return { address: deployment.feeEscrow, abi: feeEscrowAbi, functionName: "claim" as const };
}

export function claimTokenFeesCall(deployment: Pick<Deployment, "feeEscrow">, token: Address) {
  return {
    address: deployment.feeEscrow,
    abi: feeEscrowAbi,
    functionName: "claimToken" as const,
    args: [token] as const,
  };
}
