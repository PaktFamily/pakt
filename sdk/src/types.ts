import type { Address, Hex } from "viem";

export type Socials = {
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
};

export type TokenMetadata = {
  name: string;
  symbol: string;
  logo?: string;
  description?: string;
  socials?: Partial<Socials>;
};

export type LaunchInput = {
  creator: Address;
  pairToken: Address;
  launchConfigId: bigint;
  creatorFeeRecipient?: Address;
  creatorTaxBps?: number;
  salt: Hex;
  metadata: TokenMetadata;
};

export type TokenParams = {
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: Socials;
  creatorFeeRecipient: Address;
  creatorTaxBps: number;
  expectedEconomics: Hex;
  salt: Hex;
};

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type EthLeg = {
  v3Path: Hex;
  v4Hops: readonly PoolKey[];
};

export type Deployment = {
  factory: Address;
  router: Address;
  quotePricer: Address;
  locker: Address;
  feeEscrow: Address;
};

export type Reference = {
  kind: number;
  v3Pool: Address;
  v4Key: PoolKey;
  anchor: Address;
  anchorDepth: bigint;
  anchorFloor: bigint;
  qualifies: boolean;
};

export type QuoteAssetStatus = {
  priceable: boolean;
  minReferenceEth: bigint;
  direct?: Reference;
  usdgLeg?: Reference;
  viaUsdg?: Reference;
};
