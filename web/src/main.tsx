import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";

import App from "./App";
import { robinhoodChain } from "./lib/config";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 8_000, retry: 1 } } });

function requestInjectedWallets() {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

async function bootstrap() {
  const announcedProviders: unknown[] = [];
  const captureInjectedWallet = (event: Event) => {
    if (event instanceof CustomEvent) announcedProviders.push(event.detail);
  };

  window.addEventListener("eip6963:announceProvider", captureInjectedWallet);
  requestInjectedWallets();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  window.removeEventListener("eip6963:announceProvider", captureInjectedWallet);

  const { wagmiConfig } = await import("./lib/web3");

  for (const detail of announcedProviders) {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            initialChain={robinhoodChain}
            locale="en-US"
            modalSize="compact"
            theme={darkTheme({ accentColor: "#63f2b5", accentColorForeground: "#090909", borderRadius: "medium", overlayBlur: "small" })}
          >
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>,
  );

  requestInjectedWallets();
  window.setTimeout(requestInjectedWallets, 250);
  window.setTimeout(requestInjectedWallets, 1_000);
}

void bootstrap();
