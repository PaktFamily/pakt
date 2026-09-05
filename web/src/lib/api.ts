import { formatUnits, isAddress } from "viem";

import { appConfig } from "./config";
import type { LaunchApiRecord, Market, MarketHolder, MarketSwap, Portfolio, SwapQuote, UploadedImage } from "./types";

function toFinite(value: string | number, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function accentFor(token: string) {
  const palette = ["#ff9b83", "#eefb79", "#8eb8ff", "#ff96c8", "#a38bff", "#9af0d0"];
  const index = [...token.toLowerCase()].reduce((sum, character) => sum + character.charCodeAt(0), 0) % palette.length;
  return palette[index];
}

export function fromApi(record: LaunchApiRecord): Market {
  const tokenDecimals = record.economics.tokenDecimals;
  return {
    token: record.token,
    poolId: record.poolId,
    creator: record.creator,
    creatorFeeRecipient: record.creatorFeeRecipient,
    pairToken: record.pairToken,
    quoteSymbol: record.quote.symbol,
    quoteImage: publicAssetUrl(record.quote.logo),
    quoteDecimals: record.quote.decimals,
    tokenDecimals,
    name: record.metadata.name,
    symbol: record.metadata.symbol,
    description: record.metadata.description,
    image: publicAssetUrl(record.metadata.logo),
    accent: accentFor(record.token),
    marketCap: toFinite(record.market.fdvQuote),
    volume: toFinite(record.market.volumeQuote),
    price: toFinite(record.market.priceQuotePerToken),
    change: null,
    swaps: record.market.swaps,
    buys: record.market.buys,
    sells: record.market.sells,
    burned: toFinite(record.market.burnedTotal),
    initialSupply: toFinite(formatUnits(BigInt(record.economics.initialSupply), tokenDecimals)),
    currentSupply: toFinite(formatUnits(BigInt(record.economics.currentSupply), tokenDecimals)),
    baseFeeBps: record.economics.baseFeeBps,
    creatorTaxBps: record.economics.creatorTaxBps,
    protocolFeeShareBps: record.economics.protocolFeeShareBps,
    createdAt: record.createdAt,
  };
}

export function publicAssetUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("ipfs://")) return `${appConfig.ipfsGatewayUrl}${value.slice(7)}`;
  return value;
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!appConfig.apiConfigured) throw new Error("Live market data is not configured.");
  const response = await fetch(`${appConfig.apiUrl}${path}`, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error || `API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getMarkets(signal?: AbortSignal): Promise<Market[]> {
  const response = await apiFetch<{ data: LaunchApiRecord[] }>("/v1/launches?limit=100", { signal });
  return response.data.map(fromApi);
}

export async function getAssetImage(token: string): Promise<string | undefined> {
  if (!isAddress(token)) return undefined;
  const result = await apiFetch<{ image: string }>(`/v1/assets/${token}`);
  return publicAssetUrl(result.image);
}

export async function getMarket(token: string, signal?: AbortSignal): Promise<Market | null> {
  if (!isAddress(token)) return null;
  try {
    return fromApi(await apiFetch<LaunchApiRecord>(`/v1/launches/${token}`, { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getMarketSwaps(token: string, signal?: AbortSignal): Promise<MarketSwap[]> {
  const response = await apiFetch<{ data: MarketSwap[] }>(`/v1/launches/${token}/swaps?limit=300`, { signal });
  return response.data;
}

export async function getMarketHolders(token: string, signal?: AbortSignal): Promise<MarketHolder[]> {
  const response = await apiFetch<{ data: MarketHolder[] }>(`/v1/launches/${token}/holders?limit=20`, { signal });
  return response.data;
}

export async function getPortfolio(address: string, signal?: AbortSignal): Promise<{ holdings: Array<{ market: Market; balance: string; rawBalance: string }>; created: Market[] }> {
  const response = await apiFetch<Portfolio>(`/v1/accounts/${address}/portfolio`, { signal });
  return {
    holdings: response.holdings.map((holding) => ({ ...holding, market: fromApi(holding.market) })),
    created: response.created.map(fromApi),
  };
}

export async function getSwapQuote(input: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  taker: string;
  recipient: string;
  slippageBps: number;
}): Promise<SwapQuote> {
  return apiFetch<SwapQuote>("/v1/swap/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, sellAmount: input.sellAmount.toString() }),
  });
}

export async function uploadTokenImage(file: File): Promise<UploadedImage> {
  const body = new FormData();
  body.set("image", file);
  return apiFetch<UploadedImage>("/v1/uploads/image", { method: "POST", body });
}
