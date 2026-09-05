import { createPublicClient, http, type Address, type Hex } from "viem";
import { defineChain } from "viem/utils";
import { inspectQuoteAsset, prepareLaunch, type Deployment } from "../src/index.js";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

const client = createPublicClient({ chain: robinhood, transport: http() });

const deployment: Deployment = {
  factory: process.env.FACTORY as Address,
  router: process.env.ROUTER as Address,
  quotePricer: process.env.QUOTE_PRICER as Address,
  locker: process.env.LOCKER as Address,
  feeEscrow: process.env.FEE_ESCROW as Address,
};

const creator = process.env.CREATOR as Address;
const pairToken = process.env.PAIR_TOKEN as Address;

const status = await inspectQuoteAsset(client, deployment, pairToken);
if (!status.priceable) throw new Error("Selected quote asset does not meet the depth requirement");

const preview = await prepareLaunch(client, deployment, {
  creator,
  pairToken,
  launchConfigId: 0n,
  salt: process.env.SALT as Hex,
  metadata: {
    name: "Developer Coin",
    symbol: "DEV",
    description: "Launched through a third-party developer integration.",
    socials: { website: "https://example.com" },
  },
});

console.log({
  predictedToken: preview.predictedToken,
  openingQuoteReserve: preview.phantomQuote.toString(),
  supply: preview.supply.toString(),
  launchFee: preview.launchFee.toString(),
});
