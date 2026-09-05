import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { zeroAddress } from "viem";

import { BrandMark } from "../components/brand-mark";
import { MarketChart } from "../components/market-chart";
import { QuoteAssetAvatar } from "../components/quote-asset-avatar";
import { TradePanel } from "../components/trade-panel";
import { Button, buttonVariants } from "../components/ui/button";
import { getMarket, getMarketHolders, getMarketSwaps } from "../lib/api";
import { compactAddress, compactNumber, timeAgo } from "../lib/utils";

const explorerUrl = "https://explorer.chain.robinhood.com";
const timeframes = ["1m", "5m", "1h", "4h", "1d", "all"] as const;
type Timeframe = typeof timeframes[number];

function WalletLink({ address, lead = 5 }: { address: string; lead?: number }) {
  return (
    <a className="address-link" href={`${explorerUrl}/address/${address}`} target="_blank" rel="noreferrer" aria-label={`View ${address} on Robinhood Explorer`}>
      {compactAddress(address, lead)}<ArrowUpRight size={11} />
    </a>
  );
}

function TokenAvatar({ image, symbol, accent }: { image?: string; symbol: string; accent: string }) {
  if (image) return <div className="token-avatar" style={{ backgroundImage: `url(${image})` }} />;
  return <div className="token-avatar fallback" style={{ background: accent }}>{symbol.slice(0, 2)}</div>;
}

function ago(timestamp: number) {
  const value = timeAgo(timestamp);
  return value === "now" ? value : `${value} ago`;
}

function displayAmount(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? compactNumber(number) : value;
}

export function TokenPage() {
  const { token = "" } = useParams();
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [pairCopied, setPairCopied] = useState(false);
  const marketQuery = useQuery({ queryKey: ["market", token], queryFn: ({ signal }) => getMarket(token, signal), refetchInterval: 5_000 });
  const swapsQuery = useQuery({ queryKey: ["market-swaps", token], queryFn: ({ signal }) => getMarketSwaps(token, signal), enabled: Boolean(marketQuery.data), refetchInterval: 4_000 });
  const holdersQuery = useQuery({ queryKey: ["market-holders", token], queryFn: ({ signal }) => getMarketHolders(token, signal), enabled: Boolean(marketQuery.data), refetchInterval: 8_000 });
  const market = marketQuery.data;
  const swaps = swapsQuery.data ?? [];
  const holders = holdersQuery.data ?? [];
  const chartSwaps = useMemo(() => {
    const seconds: Record<Exclude<Timeframe, "all">, number> = { "1m": 60, "5m": 300, "1h": 3_600, "4h": 14_400, "1d": 86_400 };
    if (timeframe === "all") return swaps;
    const cutoff = Math.floor(Date.now() / 1_000) - seconds[timeframe];
    return swaps.filter((swap) => swap.timestamp >= cutoff);
  }, [swaps, timeframe]);

  if (marketQuery.isLoading) return <div className="page-width loading-page"><BrandMark /><p>Reading finalized market data…</p></div>;
  if (marketQuery.error) return <div className="page-width not-found"><p className="eyebrow">LIVE DATA UNAVAILABLE</p><h1>{marketQuery.error instanceof Error ? marketQuery.error.message : "The indexer did not respond."}</h1><Button onClick={() => void marketQuery.refetch()}>Retry</Button></div>;
  if (!market) return <div className="page-width not-found"><p className="eyebrow">MARKET NOT FOUND</p><h1>This pool has not opened here.</h1><Link className={buttonVariants()} to="/">Explore markets</Link></div>;

  const creatorBaseFeeBps = market.baseFeeBps * (10_000 - market.protocolFeeShareBps) / 10_000;
  const creatorShare = (creatorBaseFeeBps + market.creatorTaxBps) / 100;

  return (
    <div className="page-width token-page">
      <Link to="/" className="back-link"><ArrowLeft size={15} /> Back to explore</Link>

      <div className="token-dashboard">
        <div className="token-main-column">
          <section className="token-market-panel">
            <header className="token-market-header">
              <TokenAvatar image={market.image} symbol={market.symbol} accent={market.accent} />
              <div className="token-identity">
                <div className="token-title"><h1>{market.name}</h1><span>${market.symbol}</span></div>
                <p>by <WalletLink address={market.creator} /> · {ago(market.createdAt)}</p>
                <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(market.token)}><Copy size={13} /> {compactAddress(market.token, 7)}</Button>
              </div>
              <span className="pair-badge">
                <QuoteAssetAvatar symbol={market.quoteSymbol} image={market.quoteImage} />Paired with <b>{market.quoteSymbol}</b>
                {market.pairToken.toLowerCase() !== zeroAddress && (
                  <button type="button" aria-label={`Copy ${market.quoteSymbol} contract address`} title={pairCopied ? "Copied" : `Copy ${market.pairToken}`} onClick={() => void navigator.clipboard.writeText(market.pairToken).then(() => { setPairCopied(true); window.setTimeout(() => setPairCopied(false), 1_500); })}>
                    {pairCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                )}
              </span>
            </header>

            <div className="token-stat-grid">
              <div><span>Price</span><strong>{market.price.toPrecision(6)} {market.quoteSymbol}</strong><small>Finalized onchain price</small></div>
              <div><span>Market cap ({market.quoteSymbol})</span><strong>{compactNumber(market.marketCap)}</strong><small>{compactNumber(market.currentSupply)} circulating</small></div>
              <div><span>Volume ({market.quoteSymbol})</span><strong>{compactNumber(market.volume)}</strong><small>{market.swaps.toLocaleString()} trades</small></div>
            </div>

            <div className="chart-head">
              <span>PRICE / {market.quoteSymbol}</span>
              <div className="timeframes" role="group" aria-label="Chart timeframe">{timeframes.map((value) => <button type="button" className={timeframe === value ? "active" : ""} onClick={() => setTimeframe(value)} key={value}>{value === "all" ? "All" : value}</button>)}</div>
            </div>
            <MarketChart market={market} swaps={chartSwaps} />
          </section>

          <section className="trades-panel">
            <div className="panel-heading"><h2>Trades</h2><span><i /> Finalized chain data</span></div>
            <div className="activity-table">
              <div className="activity-row head"><span>TYPE</span><span>ACCOUNT</span><span>{market.quoteSymbol}</span><span>{market.symbol}</span><span>WHEN</span></div>
              {swapsQuery.isLoading ? <div className="data-row-empty">Reading trades…</div> : swapsQuery.error ? <div className="data-row-empty">Trades are temporarily unavailable.</div> : swaps.length ? swaps.map((trade) => (
                <div className="activity-row" key={`${trade.transactionHash}-${trade.logIndex}`}>
                  <span className={trade.side}>{trade.side.toUpperCase()}</span>
                  <WalletLink address={trade.wallet} />
                  <span>{displayAmount(trade.quoteAmount)} {market.quoteSymbol}</span>
                  <span>{displayAmount(trade.tokenAmount)} {market.symbol}</span>
                  <a href={`${explorerUrl}/tx/${trade.transactionHash}`} target="_blank" rel="noreferrer">{ago(trade.timestamp)}<ArrowUpRight size={13} /></a>
                </div>
              )) : <div className="data-row-empty">No finalized trades yet.</div>}
            </div>
          </section>
        </div>

        <aside className="token-sidebar">
          <TradePanel market={market} />

          <section className="sidebar-panel creator-panel">
            <div className="panel-heading"><h2>Creator earnings</h2><span>{creatorShare.toFixed(2)}% of every trade</span></div>
            <p>Fees accrue to <WalletLink address={market.creatorFeeRecipient} lead={7} />.</p>
            <div className="detail-list">
              <p><span>Base creator share</span><b>{(creatorBaseFeeBps / 100).toFixed(2)}%</b></p>
              <p><span>Extra creator fee</span><b>{(market.creatorTaxBps / 100).toFixed(2)}%</b></p>
              <p><span>Fee assets</span><b>{market.quoteSymbol} + {market.symbol}</b></p>
            </div>
          </section>

          <section className="sidebar-panel holders-panel">
            <div className="panel-heading"><h2>Top holders</h2><span>share of circulating supply</span></div>
            {holdersQuery.isLoading ? <div className="data-row-empty">Reading holders…</div> : holdersQuery.error ? <div className="data-row-empty">Holder data is temporarily unavailable.</div> : holders.length ? (
              <ol>{holders.map((holder) => <li key={holder.address}><span><WalletLink address={holder.address} />{holder.creator && <i>creator</i>}</span><b>{holder.sharePercent}%</b></li>)}</ol>
            ) : <div className="data-row-empty">No external holders yet.</div>}
          </section>

          <section className="sidebar-panel details-panel">
            <h2>Details</h2>
            <div className="detail-list">
              <p><span>Contract</span><a className="address-link" href={`${explorerUrl}/address/${market.token}`} target="_blank" rel="noreferrer">{compactAddress(market.token, 7)} <ArrowUpRight size={12} /></a></p>
              <p><span>Pool</span><b>{compactAddress(market.poolId, 7)}</b></p>
              <p><span>Creator</span><WalletLink address={market.creator} lead={7} /></p>
              <p><span>Fee recipient</span><WalletLink address={market.creatorFeeRecipient} lead={7} /></p>
              <p><span>Paired asset</span><b>{market.quoteSymbol}</b></p>
              <p><span>Initial supply</span><b>{compactNumber(market.initialSupply)}</b></p>
              <p><span>Burned</span><b>{compactNumber(market.burned)}</b></p>
              <p><span>Trades</span><b>{market.swaps.toLocaleString()}</b></p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
