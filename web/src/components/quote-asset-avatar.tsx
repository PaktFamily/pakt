import { cn } from "../lib/utils";
import { useEffect, useState } from "react";

const knownAssets: Record<string, string> = {
  ETH: "/quote-assets/eth.svg",
  USDG: "/quote-assets/usdg.svg",
};

export function QuoteAssetAvatar({ symbol, image, className }: { symbol: string; image?: string; className?: string }) {
  const normalized = symbol.trim().toUpperCase();
  const resolvedImage = image || knownAssets[normalized];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolvedImage]);
  const showImage = Boolean(resolvedImage && !failed);

  return (
    <span className={cn("quote-asset-avatar", !showImage && "fallback", className)} aria-hidden="true">
      {showImage ? <img src={resolvedImage} alt="" onError={() => setFailed(true)} /> : normalized === "ANY" ? "A" : normalized.slice(0, 2) || "?"}
    </span>
  );
}
