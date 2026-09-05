import { approveQuoteCall, erc20Abi, getLaunchPool, routerAbi } from "@direct-v4-launchpad/sdk";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { maxUint256, parseEther, parseUnits, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useSendTransaction, useWriteContract } from "wagmi";

import { getSwapQuote } from "../lib/api";
import { deployment, robinhoodChain } from "../lib/config";
import type { Market } from "../lib/types";
import { QuoteAssetAvatar } from "./quote-asset-avatar";
import { SlippageSelect } from "./slippage-select";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { WalletButton } from "./wallet-button";

type SettlementAsset = "eth" | "quote";

function displayBalance(data: { formatted: string } | undefined, symbol: string, connected: boolean, pending: boolean) {
  if (!connected) return "—";
  if (pending) return "…";
  if (!data) return "—";
  const value = Number(data.formatted);
  if (!Number.isFinite(value)) return `${data.formatted} ${symbol}`;
  const maximumFractionDigits = value >= 1_000 ? 2 : value >= 1 ? 4 : 6;
  return `${value.toLocaleString("en-US", { maximumFractionDigits })} ${symbol}`;
}

function PaymentAssetSelect({ market, value, onChange, label }: { market: Market; value: SettlementAsset; onChange: (value: SettlementAsset) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const hasQuoteChoice = market.pairToken.toLowerCase() !== zeroAddress;
  const symbol = value === "quote" && hasQuoteChoice ? market.quoteSymbol : "ETH";
  const options: { value: SettlementAsset; symbol: string }[] = hasQuoteChoice
    ? [{ value: "eth", symbol: "ETH" }, { value: "quote", symbol: market.quoteSymbol }]
    : [{ value: "eth", symbol: "ETH" }];

  return (
    <div className="payment-asset-picker">
      <button type="button" className="payment-asset-trigger" aria-label={`${label} ${symbol}`} aria-expanded={open} onClick={() => hasQuoteChoice && setOpen((current) => !current)}>
        <QuoteAssetAvatar symbol={symbol} image={value === "quote" ? market.quoteImage : undefined} />
        <b>{symbol}</b>
        {hasQuoteChoice && <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="payment-asset-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button type="button" role="option" aria-selected={value === option.value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
              <QuoteAssetAvatar symbol={option.symbol} image={option.value === "quote" ? market.quoteImage : undefined} />
              <span>{option.symbol}</span>
              {value === option.value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TradePanel({ market }: { market: Market }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [settlementAsset, setSettlementAsset] = useState<SettlementAsset>("eth");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [slippageBps, setSlippageBps] = useState(300);
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const quoteIsNative = market.pairToken.toLowerCase() === zeroAddress;
  const settlementSymbol = settlementAsset === "quote" && !quoteIsNative ? market.quoteSymbol : "ETH";
  const { data: nativeBalance, isPending: nativeBalancePending, refetch: refetchNativeBalance } = useBalance({ address, chainId: robinhoodChain.id, query: { enabled: Boolean(address) } });
  const { data: quoteBalance, isPending: quoteBalancePending, refetch: refetchQuoteBalance } = useBalance({ address, chainId: robinhoodChain.id, token: market.pairToken as Address, query: { enabled: Boolean(address && !quoteIsNative) } });
  const { data: tokenBalance, isPending: tokenBalancePending, refetch: refetchTokenBalance } = useBalance({ address, chainId: robinhoodChain.id, token: market.token as Address, query: { enabled: Boolean(address) } });
  const selectedBuyBalance = settlementAsset === "quote" && !quoteIsNative ? quoteBalance : nativeBalance;
  const selectedBuyBalancePending = settlementAsset === "quote" && !quoteIsNative ? quoteBalancePending : nativeBalancePending;
  const buyBalanceText = displayBalance(selectedBuyBalance, settlementSymbol, isConnected, selectedBuyBalancePending);
  const sellBalanceText = displayBalance(tokenBalance, market.symbol, isConnected, tokenBalancePending);

  function minimumOutput(value: bigint) {
    return value * BigInt(10_000 - slippageBps) / 10_000n;
  }

  async function ensureAllowance(token: Address, spender: Address, requiredAmount: bigint) {
    if (!publicClient || !address) return;
    const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, spender] });
    if (allowance >= requiredAmount) return;
    setStatus(`Approve $${token.toLowerCase() === market.token.toLowerCase() ? market.symbol : market.quoteSymbol} once…`);
    const approveHash = await writeContractAsync({ ...approveQuoteCall(token, spender, maxUint256), account: address });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  async function tradeThroughZeroX(sellToken: Address, buyToken: Address, sellAmount: bigint) {
    if (!publicClient || !address) return;
    setStatus("Finding the best route…");
    let quote = await getSwapQuote({
      chainId: robinhoodChain.id,
      sellToken,
      buyToken,
      sellAmount,
      taker: address,
      recipient: address,
      slippageBps,
    });
    if (sellToken !== zeroAddress) {
      if (!quote.allowanceSpender) throw new Error("The route did not return an approval target.");
      await ensureAllowance(sellToken, quote.allowanceSpender as Address, sellAmount);
      setStatus("Refreshing route…");
      quote = await getSwapQuote({
        chainId: robinhoodChain.id,
        sellToken,
        buyToken,
        sellAmount,
        taker: address,
        recipient: address,
        slippageBps,
      });
    }
    setStatus("Waiting for wallet…");
    const hash = await sendTransactionAsync({
      to: quote.transaction.to as Address,
      data: quote.transaction.data,
      value: BigInt(quote.transaction.value),
      chainId: robinhoodChain.id,
    });
    setStatus("Confirming…");
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function trade() {
    if (!deployment || !publicClient || !address) {
      setStatus("Trading is not available yet.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setStatus("Enter an amount first.");
      return;
    }
    try {
      setBusy(true);
      setStatus("Preparing route…");
      const key = await getLaunchPool(publicClient, deployment, market.token as `0x${string}`);
      const tokenIsCurrency0 = key.currency0.toLowerCase() === market.token.toLowerCase();
      if (side === "buy") {
        if (settlementAsset === "quote" && !quoteIsNative) {
          const quoteToken = market.pairToken as Address;
          const decimals = await publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "decimals" });
          const quoteAmount = parseUnits(amount, decimals);
          await ensureAllowance(quoteToken, deployment.router, quoteAmount);
          const draft = {
            address: deployment.router,
            abi: routerAbi,
            functionName: "swapExactIn" as const,
            args: [key, !tokenIsCurrency0, quoteAmount, 1n, address] as const,
            account: address,
          };
          const simulation = await publicClient.simulateContract(draft);
          const minOut = minimumOutput(simulation.result);
          setStatus("Waiting for wallet…");
          const hash = await writeContractAsync({ ...draft, args: [key, !tokenIsCurrency0, quoteAmount, minOut, address] });
          setStatus("Confirming…");
          await publicClient.waitForTransactionReceipt({ hash });
        } else {
          await tradeThroughZeroX(zeroAddress, market.token as Address, parseEther(amount));
        }
      } else {
        const tokenDecimals = await publicClient.readContract({ address: market.token as Address, abi: erc20Abi, functionName: "decimals" });
        const tokenAmount = parseUnits(amount, tokenDecimals);
        const directQuoteSettlement = settlementAsset === "quote" && !quoteIsNative;
        if (directQuoteSettlement) {
          await ensureAllowance(market.token as Address, deployment.router, tokenAmount);
          const draft = {
            address: deployment.router,
            abi: routerAbi,
            functionName: "swapExactIn" as const,
            args: [key, tokenIsCurrency0, tokenAmount, 1n, address] as const,
            account: address,
          };
          const simulation = await publicClient.simulateContract(draft);
          const minOut = minimumOutput(simulation.result);
          setStatus("Waiting for wallet…");
          const hash = await writeContractAsync({ ...draft, args: [key, tokenIsCurrency0, tokenAmount, minOut, address] });
          setStatus("Confirming…");
          await publicClient.waitForTransactionReceipt({ hash });
        } else {
          await tradeThroughZeroX(market.token as Address, zeroAddress, tokenAmount);
        }
      }
      setAmount("");
      setStatus("Trade confirmed.");
      await Promise.all([refetchNativeBalance(), refetchQuoteBalance(), refetchTokenBalance()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "Trade did not complete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="trade-panel">
      <Tabs value={side} onValueChange={(value) => setSide(value as "buy" | "sell")}> 
        <TabsList className="trade-tabs">
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
        <TabsContent value="buy">
          <label className="amount-label"><span>You pay</span><span>Balance {buyBalanceText}</span></label>
          <div className="amount-input has-asset-picker"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><PaymentAssetSelect market={market} value={settlementAsset} onChange={setSettlementAsset} label="Pay with" /></div>
          {settlementAsset === "eth" && <div className="quick-amounts">
            {["0.01", "0.05", "0.1", "0.5"].map((value) => <button key={value} onClick={() => setAmount(value)}>{value}</button>)}
          </div>}
        </TabsContent>
        <TabsContent value="sell">
          <label className="amount-label"><span>You sell</span><span>Balance {sellBalanceText}</span></label>
          <div className="amount-input"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /><strong>{market.symbol}</strong></div>
          <div className="quick-amounts">
            {[["25%", 0.25], ["50%", 0.5], ["75%", 0.75], ["MAX", 1]].map(([label, ratio]) => <button type="button" key={label} onClick={() => tokenBalance && setAmount(String(Number(tokenBalance.formatted) * Number(ratio)))}>{label}</button>)}
          </div>
          <div className="receive-asset-row"><span>You receive</span><PaymentAssetSelect market={market} value={settlementAsset} onChange={setSettlementAsset} label="Receive in" /></div>
        </TabsContent>
      </Tabs>
      <div className="trade-settings"><span>Pool fee</span><b>{(1 + market.creatorTaxBps / 100).toFixed(2)}%</b><span>Slippage</span><SlippageSelect value={slippageBps} onChange={setSlippageBps} /></div>
      {!isConnected ? <WalletButton /> : (
        <Button className="trade-submit" size="lg" onClick={trade} disabled={busy}>
          {busy && <LoaderCircle size={17} className="spin" />}
          {side === "buy" ? `Buy $${market.symbol} with ${settlementSymbol}` : `Sell $${market.symbol} for ${settlementSymbol}`}
        </Button>
      )}
      {status && <p className="trade-status" role="status">{status}</p>}
    </aside>
  );
}
