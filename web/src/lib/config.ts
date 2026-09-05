import type { Deployment } from "@direct-v4-launchpad/sdk";
import { defineChain, getAddress, isAddress, zeroAddress, type Address } from "viem";

export const robinhoodChain = defineChain({
  id: 4_663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://explorer.chain.robinhood.com" },
  },
});

export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const WETH_ADDRESS = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;

function envAddress(value?: string): Address | null {
  return value && isAddress(value) && getAddress(value) !== zeroAddress ? getAddress(value) : null;
}

const deploymentCandidate = {
  factory: envAddress(import.meta.env.VITE_FACTORY_ADDRESS),
  router: envAddress(import.meta.env.VITE_ROUTER_ADDRESS),
  quotePricer: envAddress(import.meta.env.VITE_QUOTE_PRICER_ADDRESS),
  locker: envAddress(import.meta.env.VITE_LOCKER_ADDRESS),
  feeEscrow: envAddress(import.meta.env.VITE_FEE_ESCROW_ADDRESS),
};

export const deployment: Deployment | null = Object.values(deploymentCandidate).every(Boolean)
  ? (deploymentCandidate as Deployment)
  : null;

export const appConfig = {
  name: import.meta.env.VITE_APP_NAME?.trim() || "pakt",
  xUrl: "https://x.com/Paktdotfamily",
  githubUrl: "https://github.com/PaktFamily/pakt",
  apiUrl: (import.meta.env.VITE_API_URL?.trim() || "").replace(/\/$/, ""),
  apiConfigured: Boolean(import.meta.env.VITE_API_URL?.trim()),
  ipfsGatewayUrl: (import.meta.env.VITE_IPFS_GATEWAY_URL?.trim() || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/"),
  launchConfigId: BigInt(import.meta.env.VITE_LAUNCH_CONFIG_ID || "0"),
  walletConnectProjectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || "00000000000000000000000000000000",
};
