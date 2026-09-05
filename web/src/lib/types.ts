export type Market = {
  token: string;
  poolId: string;
  creator: string;
  creatorFeeRecipient: string;
  pairToken: string;
  quoteSymbol: string;
  quoteImage?: string;
  quoteDecimals: number;
  tokenDecimals: number;
  name: string;
  symbol: string;
  description: string;
  image?: string;
  accent: string;
  marketCap: number;
  volume: number;
  price: number;
  change: number | null;
  swaps: number;
  buys: number;
  sells: number;
  burned: number;
  initialSupply: number;
  currentSupply: number;
  baseFeeBps: number;
  creatorTaxBps: number;
  protocolFeeShareBps: number;
  createdAt: number;
};

export type LaunchApiRecord = {
  token: string;
  poolId: string;
  creator: string;
  creatorFeeRecipient: string;
  pairToken: string;
  quote: {
    symbol: string;
    decimals: number;
    logo?: string;
  };
  metadata: {
    name: string;
    symbol: string;
    logo: string;
    description: string;
  };
  economics: {
    baseFeeBps: number;
    creatorTaxBps: number;
    protocolFeeShareBps: number;
    initialSupply: string;
    currentSupply: string;
    tokenDecimals: number;
  };
  market: {
    swaps: number;
    buys: number;
    sells: number;
    volumeQuote: string;
    burnedTotal: string;
    priceQuotePerToken: string;
    fdvQuote: string;
  };
  createdAt: number;
  transactionHash: string;
};

export type MarketSwap = {
  id: number;
  wallet: string;
  sender: string;
  side: "buy" | "sell";
  quoteAmount: string;
  tokenAmount: string;
  priceQuotePerToken: string;
  timestamp: number;
  transactionHash: string;
  logIndex: number;
};

export type MarketHolder = {
  address: string;
  balance: string;
  rawBalance: string;
  sharePercent: string;
  creator: boolean;
};

export type Portfolio = {
  holdings: Array<{ market: LaunchApiRecord; balance: string; rawBalance: string }>;
  created: LaunchApiRecord[];
};

export type SwapQuote = {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  allowanceSpender: string | null;
  transaction: { to: string; data: `0x${string}`; value: string };
  blockNumber: number | null;
  expiresAt: number;
};

export type UploadedImage = {
  cid: string;
  url: string;
  gatewayUrl: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};
