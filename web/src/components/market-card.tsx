import { Link } from "react-router-dom";

import type { Market } from "../lib/types";
import { compactAddress, compactNumber, timeAgo } from "../lib/utils";
import { QuoteAssetAvatar } from "./quote-asset-avatar";

function TokenArt({ market }: { market: Market }) {
  if (market.image) {
    return (
      <div className="token-art has-image" style={{ backgroundImage: `url(${market.image})` }}>
        <span className="quote-tag"><QuoteAssetAvatar symbol={market.quoteSymbol} image={market.quoteImage} />{market.quoteSymbol}</span>
      </div>
    );
  }
  return (
    <div className="token-art letter-art" style={{ background: market.accent }}>
      <span className="quote-tag"><QuoteAssetAvatar symbol={market.quoteSymbol} image={market.quoteImage} />{market.quoteSymbol}</span>
      <strong>{market.symbol.slice(0, 2)}</strong>
    </div>
  );
}

export function MarketCard({ market }: { market: Market }) {
  return (
    <Link className="market-card" to={`/token/${market.token}`}>
      <TokenArt market={market} />
      <div className="market-card-body">
        <div className="market-title-row">
          <div>
            <h3>{market.name}</h3>
            <p>${market.symbol}</p>
          </div>
        </div>
        <div className="market-numbers">
          <p><strong>{compactNumber(market.marketCap)}</strong><span>{market.quoteSymbol} MC</span></p>
          <p className={market.change === null ? "" : market.change >= 0 ? "up" : "down"}>{market.change === null ? "LIVE" : `${market.change >= 0 ? "+" : ""}${market.change.toFixed(1)}%`}</p>
        </div>
        <div className="market-mini-stats">
          <span>VOL {compactNumber(market.volume)} {market.quoteSymbol}</span>
          <span>BURNED {compactNumber(market.burned)}</span>
        </div>
        <div className="market-meta">
          <span>{compactAddress(market.token)}</span>
          <time>{timeAgo(market.createdAt)}</time>
        </div>
      </div>
    </Link>
  );
}
