import { feeEscrowAbi } from "@direct-v4-launchpad/sdk";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Coins, LoaderCircle, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatUnits, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { QuoteAssetAvatar } from "../components/quote-asset-avatar";
import { WalletButton } from "../components/wallet-button";
import { Button, buttonVariants } from "../components/ui/button";
import { getPortfolio } from "../lib/api";
import { deployment } from "../lib/config";
import type { Market } from "../lib/types";
import { compactAddress, compactNumber } from "../lib/utils";

type ClaimAsset = {
  address: Address;
  symbol: string;
  decimals: number;
  amount: bigint;
};

function displayTokenAmount(amount: bigint, decimals: number) {
  const value = Number(formatUnits(amount, decimals));
  if (!Number.isFinite(value)) return formatUnits(amount, decimals);
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 1 ? 4 : 8 });
}

function positionValue(balance: string, market: Market) {
  const value = Number(balance) * market.price;
  return Number.isFinite(value) ? `${compactNumber(value)} ${market.quoteSymbol}` : "—";
}

export function MyMarketsPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState("");
  const portfolioQuery = useQuery({
    queryKey: ["portfolio", address],
    queryFn: ({ signal }) => getPortfolio(address!, signal),
    enabled: Boolean(address),
    refetchInterval: 8_000,
  });
  const feeAssetDefinitions = useMemo(() => {
    const assets = new Map<string, Omit<ClaimAsset, "amount">>();
    for (const market of portfolioQuery.data?.created ?? []) {
      assets.set(market.token.toLowerCase(), {
        address: market.token as Address,
        symbol: market.symbol,
        decimals: market.tokenDecimals,
      });
      const pairAddress = market.pairToken.toLowerCase();
      assets.set(pairAddress, pairAddress === zeroAddress
        ? { address: zeroAddress, symbol: "ETH", decimals: 18 }
        : { address: market.pairToken as Address, symbol: market.quoteSymbol, decimals: market.quoteDecimals });
    }
    return [...assets.values()];
  }, [portfolioQuery.data?.created]);
  const claimBalancesQuery = useQuery({
    queryKey: ["claimable-fees", address, deployment?.feeEscrow, feeAssetDefinitions.map(({ address: asset }) => asset).join(",")],
    queryFn: async (): Promise<ClaimAsset[]> => {
      if (!address || !deployment || !publicClient) return [];
      const feeEscrow = deployment.feeEscrow;
      return Promise.all(feeAssetDefinitions.map(async (asset) => {
        const amount = asset.address === zeroAddress
          ? await publicClient.readContract({ address: feeEscrow, abi: feeEscrowAbi, functionName: "balanceOf", args: [address] })
          : await publicClient.readContract({ address: feeEscrow, abi: feeEscrowAbi, functionName: "balanceOfToken", args: [address, asset.address] });
        return { ...asset, amount };
      }));
    },
    enabled: Boolean(address && deployment && publicClient && portfolioQuery.data),
    refetchInterval: 8_000,
  });
  const claimAssets = claimBalancesQuery.data ?? [];
  const availableClaims = claimAssets.filter((asset) => asset.amount > 0n);

  async function claimAsset(asset: ClaimAsset) {
    if (!address || !deployment || !publicClient || asset.amount === 0n) return;
    try {
      setClaiming(asset.address);
      setClaimStatus(`Confirm the ${asset.symbol} claim in your wallet…`);
      const hash = asset.address === zeroAddress
        ? await writeContractAsync({ address: deployment.feeEscrow, abi: feeEscrowAbi, functionName: "claim", account: address })
        : await writeContractAsync({ address: deployment.feeEscrow, abi: feeEscrowAbi, functionName: "claimToken", args: [asset.address], account: address });
      setClaimStatus(`Claiming ${asset.symbol}…`);
      await publicClient.waitForTransactionReceipt({ hash });
      setClaimStatus(`${asset.symbol} claimed.`);
      await claimBalancesQuery.refetch();
    } catch (error) {
      setClaimStatus(error instanceof Error ? error.message.split("\n")[0] : "Claim did not complete.");
    } finally {
      setClaiming(null);
    }
  }

  async function claimAll() {
    for (const asset of availableClaims) await claimAsset(asset);
  }

  return (
    <div className="page-width portfolio-page">
      <div className="portfolio-heading">
        <div><p className="eyebrow">{address ? compactAddress(address) : "YOUR WALLET"}</p><h1>Portfolio</h1><span>Finalized holdings and claimable creator fees.</span></div>
        <div className="portfolio-actions">{!isConnected && <WalletButton />}<Link className={buttonVariants()} to="/create">Create <ArrowRight size={15} /></Link></div>
      </div>

      {!isConnected || !address ? (
        <section className="wallet-empty"><WalletCards size={28} /><h2>Connect your wallet</h2><p>Your live holdings, launched markets, and creator fees will appear here.</p><WalletButton /></section>
      ) : portfolioQuery.isLoading ? (
        <section className="wallet-empty"><LoaderCircle className="spin" size={28} /><h2>Reading your portfolio</h2><p>Syncing finalized balances from Robinhood Chain.</p></section>
      ) : portfolioQuery.error ? (
        <section className="wallet-empty"><WalletCards size={28} /><h2>Portfolio unavailable</h2><p>{portfolioQuery.error instanceof Error ? portfolioQuery.error.message : "The indexer did not respond."}</p><Button onClick={() => void portfolioQuery.refetch()}>Retry</Button></section>
      ) : (
        <>
          <section className="portfolio-claim-card">
            <div className="claim-total"><span>Creator fees ready</span><strong>{claimBalancesQuery.isLoading ? "…" : `${availableClaims.length} ${availableClaims.length === 1 ? "asset" : "assets"}`}</strong><p>{deployment ? "Read directly from the fee escrow." : "Fee claiming becomes available after protocol deployment."}</p></div>
            <div className="claim-asset-list">
              {availableClaims.length ? availableClaims.slice(0, 3).map((asset) => <div key={asset.address}><QuoteAssetAvatar symbol={asset.symbol} /><span><small>{asset.symbol}</small><b>{displayTokenAmount(asset.amount, asset.decimals)}</b></span></div>) : <div><Coins size={20} /><span><small>Claimable</small><b>{claimBalancesQuery.isLoading ? "Reading…" : "None"}</b></span></div>}
            </div>
            <Button onClick={() => void claimAll()} disabled={!availableClaims.length || claiming !== null}>{claiming ? <><LoaderCircle size={16} className="spin" /> Claiming</> : availableClaims.length ? `Claim all (${availableClaims.length})` : <><Check size={16} /> Up to date</>}</Button>
          </section>
          {claimStatus && <p className="portfolio-status" role="status">{claimStatus}</p>}

          <div className="portfolio-columns">
            <section className="portfolio-panel holdings-panel">
              <div className="portfolio-panel-heading"><div><h2>Holdings</h2><p>Launch tokens held by this wallet</p></div><span>{portfolioQuery.data?.holdings.length ?? 0} assets</span></div>
              <div className="portfolio-table-head"><span>Asset</span><span>Balance</span><span>Value</span><span>PnL</span></div>
              {portfolioQuery.data?.holdings.length ? portfolioQuery.data.holdings.map(({ market, balance }) => (
                <Link className="position-row" key={market.token} to={`/token/${market.token}`}>
                  <span className="position-token"><i style={market.image ? { backgroundImage: `url(${market.image})` } : { background: market.accent }}>{market.image ? "" : market.symbol.slice(0, 2)}</i><b>{market.name}<small>${market.symbol} / {market.quoteSymbol}</small></b></span>
                  <span>{compactNumber(Number(balance))}</span><b>{positionValue(balance, market)}</b><em>—</em>
                </Link>
              )) : <div className="portfolio-empty-row">No pakt launch tokens in this wallet yet.</div>}
            </section>

            <section className="portfolio-panel earnings-panel">
              <div className="portfolio-panel-heading"><div><h2>Creator earnings</h2><p>Balances available to this wallet</p></div><span>{portfolioQuery.data?.created.length ?? 0} markets</span></div>
              {!deployment ? <div className="portfolio-empty-row">Fee escrow is not deployed yet.</div> : claimBalancesQuery.isLoading ? <div className="portfolio-empty-row">Reading fee escrow…</div> : claimBalancesQuery.error ? <div className="portfolio-empty-row">Creator fee balances are temporarily unavailable.</div> : claimAssets.length ? claimAssets.map((asset) => (
                <div className="earning-row" key={asset.address}>
                  <div><QuoteAssetAvatar symbol={asset.symbol} /><span><b>{asset.symbol}</b><small>{displayTokenAmount(asset.amount, asset.decimals)} claimable</small></span></div>
                  <Button aria-label={`Claim ${asset.symbol}`} size="sm" variant={asset.amount > 0n ? "primary" : "outline"} onClick={() => void claimAsset(asset)} disabled={asset.amount === 0n || claiming !== null}>{claiming === asset.address ? <LoaderCircle size={14} className="spin" /> : asset.amount > 0n ? "Claim" : <Check size={14} />}</Button>
                </div>
              )) : <div className="portfolio-empty-row">No creator-fee assets for this wallet.</div>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
