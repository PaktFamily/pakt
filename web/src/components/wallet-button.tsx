import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Wallet } from "lucide-react";

import { compactAddress } from "../lib/utils";
import { Button } from "./ui/button";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!connected) {
          return (
            <Button variant="light" size={compact ? "sm" : "default"} onClick={openConnectModal}>
              <Wallet size={15} />
              {compact ? "Connect" : "Connect wallet"}
            </Button>
          );
        }
        if (chain.unsupported) {
          return (
            <Button variant="primary" size={compact ? "sm" : "default"} onClick={openChainModal}>
              Switch network
            </Button>
          );
        }
        return (
          <Button variant="outline" size={compact ? "sm" : "default"} onClick={openAccountModal}>
            <span className="size-2 rounded-full bg-[#75f7bb] shadow-[0_0_10px_#75f7bb]" />
            {compactAddress(account.address)}
            <ChevronDown size={14} />
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}
