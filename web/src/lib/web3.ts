import { getDefaultConfig } from "@rainbow-me/rainbowkit";

import { appConfig, robinhoodChain } from "./config";

export const wagmiConfig = getDefaultConfig({
  appName: appConfig.name,
  projectId: appConfig.walletConnectProjectId,
  chains: [robinhoodChain],
  ssr: false,
});
