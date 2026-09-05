import {
  EMPTY_ETH_LEG,
  approveQuoteCall,
  buildBuyEthLeg,
  erc20Abi,
  inspectQuoteAsset,
  launchTokenAbi,
  launchAndBuyWithEthCall,
  launchAndBuyWithQuoteCall,
  prepareLaunch,
  type LaunchInput,
} from "@direct-v4-launchpad/sdk";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImagePlus, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getAddress, isAddress, keccak256, maxUint256, parseEther, parseUnits, stringToHex, zeroAddress, type Address } from "viem";
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from "wagmi";

import { BrandMark } from "../components/brand-mark";
import { QuoteAssetAvatar } from "../components/quote-asset-avatar";
import { SlippageSelect } from "../components/slippage-select";
import { Button, buttonVariants } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Slider } from "../components/ui/slider";
import { WalletButton } from "../components/wallet-button";
import { getAssetImage, getSwapQuote, uploadTokenImage } from "../lib/api";
import { appConfig, deployment, robinhoodChain, USDG_ADDRESS, WETH_ADDRESS } from "../lib/config";
import { compactAddress } from "../lib/utils";

type QuoteMode = "eth" | "usdg" | "custom";
type FirstBuyAsset = "eth" | "quote";
type FirstBuyMode = "tokens" | "spend";
const IMAGE_MAX_BYTES = 6_291_456;

function divideUp(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function estimateSpendForTokens(targetTokens: bigint, supply: bigint, phantomInput: bigint, poolFeeBps: number) {
  if (targetTokens <= 0n || targetTokens >= supply) throw new Error("First buy token amount must be below the total supply.");
  const netInput = divideUp(phantomInput * targetTokens, supply - targetTokens);
  const feePips = BigInt(poolFeeBps) * 100n;
  return divideUp(netInput * 1_000_000n, 1_000_000n - feePips);
}

function FirstBuyAssetSelect({ value, quoteSymbol, quoteImage, allowQuote, onChange }: { value: FirstBuyAsset; quoteSymbol: string; quoteImage?: string; allowQuote: boolean; onChange: (value: FirstBuyAsset) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value === "quote" && allowQuote ? quoteSymbol : "ETH";
  const options: { value: FirstBuyAsset; symbol: string }[] = allowQuote
    ? [{ value: "eth", symbol: "ETH" }, { value: "quote", symbol: quoteSymbol }]
    : [{ value: "eth", symbol: "ETH" }];

  return (
    <div className="payment-asset-picker">
      <button type="button" className="payment-asset-trigger" aria-label={`First buy with ${selected}`} aria-expanded={open} onClick={() => allowQuote && setOpen((current) => !current)}>
        <QuoteAssetAvatar symbol={selected} image={value === "quote" ? quoteImage : undefined} />
        <b>{selected}</b>
        {allowQuote && <ChevronDown size={14} />}
      </button>
      {open && allowQuote && (
        <div className="payment-asset-menu" role="listbox" aria-label="First buy asset">
          {options.map((option) => (
            <button type="button" role="option" aria-selected={value === option.value} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
              <QuoteAssetAvatar symbol={option.symbol} image={option.value === "quote" ? quoteImage : undefined} />
              <span>{option.symbol}</span>
              {value === option.value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreatePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [localImage, setLocalImage] = useState("");
  const [fileName, setFileName] = useState("");
  const [imageUpload, setImageUpload] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [quoteMode, setQuoteMode] = useState<QuoteMode>("eth");
  const [customQuote, setCustomQuote] = useState("");
  const [customQuoteSymbol, setCustomQuoteSymbol] = useState("TOKEN");
  const [customQuoteImage, setCustomQuoteImage] = useState<string>();
  const [quoteCheck, setQuoteCheck] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [creatorTax, setCreatorTax] = useState(0);
  const [devBuy, setDevBuy] = useState("");
  const [firstBuyMode, setFirstBuyMode] = useState<FirstBuyMode>("spend");
  const [firstBuyAsset, setFirstBuyAsset] = useState<FirstBuyAsset>("eth");
  const [slippageBps, setSlippageBps] = useState(300);
  const [feeWallet, setFeeWallet] = useState("");
  const [status, setStatus] = useState("");
  const [launchedToken, setLaunchedToken] = useState("");

  useEffect(() => () => {
    if (localImage) URL.revokeObjectURL(localImage);
  }, [localImage]);

  const pairToken = useMemo<Address | null>(() => {
    if (quoteMode === "eth") return zeroAddress;
    if (quoteMode === "usdg") return USDG_ADDRESS;
    return isAddress(customQuote) ? getAddress(customQuote) : null;
  }, [customQuote, quoteMode]);
  const busy = imageUpload === "uploading" || ["Checking market…", "Preparing market…", "Calculating first buy…", "Approve quote asset…", "Confirming approval…", "Waiting for wallet…", "Opening market…", "Finding opening route…", "Confirm opening buy…"].includes(status);
  const totalFee = 1 + creatorTax / 100;

  async function selectImage(file?: File) {
    if (!file) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setFileName(file.name);
      setImageUpload("error");
      setStatus("Image must be 6 MB or smaller.");
      return;
    }
    if (localImage) URL.revokeObjectURL(localImage);
    setLocalImage(URL.createObjectURL(file));
    setFileName(file.name);
    setImageUrl("");
    setImageUpload("uploading");
    setStatus("Uploading image…");
    try {
      const uploaded = await uploadTokenImage(file);
      setImageUrl(uploaded.url);
      setImageUpload("ready");
      setStatus("Image pinned to IPFS.");
    } catch (error) {
      setImageUpload("error");
      setStatus(error instanceof Error ? error.message : "Image upload failed.");
    }
  }

  async function checkQuote() {
    if (!pairToken) {
      setQuoteCheck("invalid");
      setStatus("Enter a valid ERC-20 address.");
      return;
    }
    if (pairToken === zeroAddress) {
      setQuoteCheck("valid");
      return;
    }
    if (quoteMode === "custom" && publicClient) {
      try {
        const resolvedSymbol = await publicClient.readContract({ address: pairToken, abi: launchTokenAbi, functionName: "symbol" });
        if (resolvedSymbol) setCustomQuoteSymbol(resolvedSymbol.toUpperCase());
      } catch {
        setCustomQuoteSymbol("TOKEN");
      }
      setCustomQuoteImage(await getAssetImage(pairToken).catch(() => undefined));
    }
    if (!deployment || !publicClient) {
      setQuoteCheck("invalid");
      setStatus("Protocol contracts are not configured, so this asset cannot be verified yet.");
      return;
    }
    setQuoteCheck("checking");
    setStatus("Checking market…");
    try {
      const result = await inspectQuoteAsset(publicClient, deployment, pairToken);
      setQuoteCheck(result.priceable ? "valid" : "invalid");
      setStatus(result.priceable ? "Quote asset is liquid enough to open." : "This asset needs a deeper ETH or USDG market first.");
    } catch {
      setQuoteCheck("invalid");
      setStatus("Could not verify this quote asset.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLaunchedToken("");
    if (!address || !publicClient || !isConnected) {
      setStatus("Connect your wallet to continue.");
      return;
    }
    if (!name.trim() || !symbol.trim()) {
      setStatus("Give the token a name and ticker.");
      return;
    }
    if (localImage && imageUpload !== "ready") {
      setStatus("Wait for the image upload or choose it again.");
      return;
    }
    if (!pairToken) {
      setStatus("Enter a valid quote token address.");
      return;
    }
    if (feeWallet && !isAddress(feeWallet)) {
      setStatus("The fee wallet address is not valid.");
      return;
    }
    if (!deployment) {
      setStatus("Protocol deployment is not configured. No transaction was created.");
      return;
    }
    try {
      setStatus("Preparing market…");
      const salt = keccak256(stringToHex(`${address}:${Date.now()}:${crypto.randomUUID()}`));
      const input: LaunchInput = {
        creator: address,
        pairToken,
        launchConfigId: appConfig.launchConfigId,
        creatorFeeRecipient: feeWallet ? getAddress(feeWallet) : zeroAddress,
        creatorTaxBps: creatorTax,
        salt,
        metadata: {
          name: name.trim(),
          symbol: symbol.trim().replace(/^\$/, "").toUpperCase(),
          logo: imageUrl.trim(),
          description: description.trim(),
          socials: { twitter: twitter.trim(), telegram: telegram.trim(), website: website.trim() },
        },
      };
      const preview = await prepareLaunch(publicClient, deployment, input);
      let call: unknown = preview.directCall;
      let buyAmount = 0n;
      let buyAfterLaunch = false;
      const normalizedBuy = devBuy.replaceAll(",", "").trim();
      const hasFirstBuy = Boolean(normalizedBuy && Number(normalizedBuy) > 0);
      const buyWithQuote = firstBuyAsset === "quote" && pairToken !== zeroAddress;
      const targetTokens = hasFirstBuy && firstBuyMode === "tokens" ? parseUnits(normalizedBuy, 18) : 0n;
      const minimumTarget = targetTokens > 0n ? targetTokens * BigInt(10_000 - slippageBps) / 10_000n || 1n : 0n;
      if (hasFirstBuy && buyWithQuote) {
        const quoteDecimals = await publicClient.readContract({ address: pairToken, abi: erc20Abi, functionName: "decimals" });
        buyAmount = firstBuyMode === "tokens"
          ? estimateSpendForTokens(targetTokens, preview.supply, preview.phantomQuote, 100 + creatorTax)
          : parseUnits(normalizedBuy, quoteDecimals);
        const allowance = await publicClient.readContract({ address: pairToken, abi: erc20Abi, functionName: "allowance", args: [address, deployment.router] });
        if (allowance < buyAmount) {
          setStatus("Approve quote asset…");
          const approvalHash = await writeContractAsync({ ...approveQuoteCall(pairToken, deployment.router, maxUint256), account: address });
          setStatus("Confirming approval…");
          await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        }
        setStatus("Calculating first buy…");
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const draft = { ...launchAndBuyWithQuoteCall(deployment, preview, input, buyAmount, 1n), account: address };
          const simulation = await publicClient.simulateContract(draft);
          const result = simulation.result as readonly [Address, `0x${string}`, bigint];
          if (firstBuyMode === "tokens" && result[2] < minimumTarget) {
            if (result[2] === 0n || attempt === 2) throw new Error("Could not reach that first-buy token amount within the selected slippage.");
            buyAmount = divideUp(divideUp(buyAmount * targetTokens, result[2]) * 101n, 100n);
            continue;
          }
          const minOut = firstBuyMode === "tokens" ? minimumTarget : result[2] * BigInt(10_000 - slippageBps) / 10_000n;
          call = launchAndBuyWithQuoteCall(deployment, preview, input, buyAmount, minOut);
          break;
        }
      } else if (hasFirstBuy) {
        buyAmount = firstBuyMode === "tokens"
          ? estimateSpendForTokens(targetTokens, preview.supply, preview.openingMcapEth, 100 + creatorTax)
          : parseEther(normalizedBuy);
        let leg = EMPTY_ETH_LEG;
        if (pairToken !== zeroAddress) {
          const quoteStatus = await inspectQuoteAsset(publicClient, deployment, pairToken);
          if (!quoteStatus.priceable) throw new Error("This quote asset needs deeper ETH or USDG liquidity first.");
          try {
            leg = await buildBuyEthLeg(publicClient, quoteStatus, pairToken, WETH_ADDRESS, USDG_ADDRESS);
          } catch {
            if (firstBuyMode === "tokens") throw new Error(`Token amount mode needs an atomic ETH route. Choose Spend or pay with ${quoteSymbol}.`);
            buyAfterLaunch = true;
          }
        }
        if (!buyAfterLaunch) {
          setStatus("Calculating first buy…");
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const draft = { ...launchAndBuyWithEthCall(deployment, preview, input, buyAmount, leg, 1n), account: address };
            const simulation = await publicClient.simulateContract(draft);
            const result = simulation.result as readonly [Address, `0x${string}`, bigint];
            if (firstBuyMode === "tokens" && result[2] < minimumTarget) {
              if (result[2] === 0n || attempt === 2) throw new Error("Could not reach that first-buy token amount within the selected slippage.");
              buyAmount = divideUp(divideUp(buyAmount * targetTokens, result[2]) * 101n, 100n);
              continue;
            }
            const minOut = firstBuyMode === "tokens" ? minimumTarget : result[2] * BigInt(10_000 - slippageBps) / 10_000n;
            call = launchAndBuyWithEthCall(deployment, preview, input, buyAmount, leg, minOut);
            break;
          }
        }
      }
      setStatus("Waiting for wallet…");
      const hash = await writeContractAsync({ ...(call as object), account: address } as never);
      setStatus("Opening market…");
      await publicClient.waitForTransactionReceipt({ hash });
      setLaunchedToken(preview.predictedToken);
      if (buyAfterLaunch) {
        setStatus("Finding opening route…");
        let quote: Awaited<ReturnType<typeof getSwapQuote>> | null = null;
        for (let attempt = 0; attempt < 4 && !quote; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
          try {
            quote = await getSwapQuote({
              chainId: robinhoodChain.id,
              sellToken: zeroAddress,
              buyToken: preview.predictedToken,
              sellAmount: buyAmount,
              taker: address,
              recipient: address,
              slippageBps,
            });
          } catch {
            quote = null;
          }
        }
        if (!quote) {
          setStatus("Market open. The opening buy route is still indexing; buy from the market page when ready.");
          return;
        }
        setStatus("Confirm opening buy…");
        const buyHash = await sendTransactionAsync({
          to: quote.transaction.to as Address,
          data: quote.transaction.data,
          value: BigInt(quote.transaction.value),
          chainId: robinhoodChain.id,
        });
        await publicClient.waitForTransactionReceipt({ hash: buyHash });
      }
      setStatus("Market open. It is tradable now.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message.split("\n")[0] : "The launch did not complete.");
    }
  }

  const previewImage = localImage || imageUrl;
  const displaySymbol = symbol.trim().replace(/^\$/, "").toUpperCase() || "TICKER";
  const quoteSymbol = quoteMode === "eth" ? "ETH" : quoteMode === "usdg" ? "USDG" : customQuoteSymbol;

  return (
    <div className="page-width create-page">
      <Link to="/" className="back-link"><ArrowLeft size={15} /> Back to markets</Link>
      <div className="create-intro">
        <h1>Create a token</h1>
        <p>Create the token and its permanent Uniswap V4 market in one transaction. Anyone can do it.</p>
      </div>

      <form className="create-layout" onSubmit={submit}>
        <div className="create-form">
          <section className="form-section">
            <div className="form-index">01</div>
            <div className="form-section-body">
              <div className="form-section-title"><div><p>THE IDEA</p><h2>Name what you are putting onchain.</h2></div></div>
              <div className="two-cols">
                <label className="field"><span>Name <small>64 bytes max</small></span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="The next internet object" maxLength={64} /></label>
                <label className="field"><span>Ticker <small>16 bytes max</small></span><div className="ticker-input"><b>$</b><Input value={symbol} onChange={(event) => setSymbol(event.target.value.replace(/[^a-zA-Z0-9]/g, ""))} placeholder="OPEN" maxLength={16} /></div></label>
              </div>
              <label className="field"><span>Description <small>{description.length}/280</small></span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Give the market something to believe in." maxLength={280} /></label>
              <div className="image-row">
                <label className="image-drop">
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => void selectImage(event.target.files?.[0])} />
                  {previewImage ? <img src={previewImage} alt="Token preview" /> : <><ImagePlus size={25} /><strong>Drop the face of it here</strong><span>PNG, JPG, GIF or WEBP · max 6 MB</span></>}
                </label>
                <div className="image-details">
                  <p><Upload size={15} /> {imageUpload === "uploading" ? "Pinning to IPFS…" : imageUpload === "ready" ? `${fileName} · ready` : imageUpload === "error" ? `${fileName} · retry` : "No image selected"}</p>
                </div>
              </div>
              <div className="three-cols social-fields">
                <label className="field"><span>X / Twitter</span><Input value={twitter} onChange={(event) => setTwitter(event.target.value)} placeholder="@handle" /></label>
                <label className="field"><span>Telegram</span><Input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="t.me/community" /></label>
                <label className="field"><span>Website</span><Input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" /></label>
              </div>
            </div>
          </section>

          <section className="form-section">
            <div className="form-index">02</div>
            <div className="form-section-body">
              <div className="form-section-title"><div><p>THE MARKET</p><h2>Choose what the world trades it against.</h2></div></div>
              <div className="quote-options">
                <button type="button" className={quoteMode === "eth" ? "active" : ""} onClick={() => { setQuoteMode("eth"); setQuoteCheck("valid"); setFirstBuyAsset("eth"); }}><QuoteAssetAvatar symbol="ETH" /><span><b>ETH</b><small>Native route</small></span><Check /></button>
                <button type="button" className={quoteMode === "usdg" ? "active" : ""} onClick={() => { setQuoteMode("usdg"); setQuoteCheck("idle"); }}><QuoteAssetAvatar symbol="USDG" /><span><b>USDG</b><small>Stable quote</small></span><Check /></button>
                <button type="button" className={quoteMode === "custom" ? "active" : ""} onClick={() => { setQuoteMode("custom"); setQuoteCheck("idle"); }}><QuoteAssetAvatar symbol={customQuoteSymbol === "TOKEN" ? "ANY" : customQuoteSymbol} image={customQuoteImage} /><span><b>{quoteMode === "custom" && customQuoteSymbol !== "TOKEN" ? customQuoteSymbol : "Any token"}</b><small>If the chain can price it</small></span><Check /></button>
              </div>
              <AnimatePresence initial={false}>
                {quoteMode === "custom" && (
                  <motion.div className="custom-quote" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <label className="field"><span>Quote token address</span><div className="inline-check"><Input value={customQuote} onChange={(event) => { setCustomQuote(event.target.value); setCustomQuoteSymbol("TOKEN"); setCustomQuoteImage(undefined); setQuoteCheck("idle"); }} placeholder="0x…" /><Button type="button" variant="outline" onClick={checkQuote}>Check market</Button></div></label>
                  </motion.div>
                )}
              </AnimatePresence>
              {quoteMode !== "eth" && (
                <div className={`quote-health ${quoteCheck}`}>
                  <span>{quoteCheck === "checking" ? <LoaderCircle className="spin" /> : quoteCheck === "valid" ? <Check /> : <ShieldCheck />}</span>
                  <p><b>{quoteCheck === "valid" ? "Price route found" : quoteCheck === "invalid" ? !pairToken ? "Enter a valid ERC-20 address" : "Not enough reference liquidity" : "Liquidity check required"}</b><small>We verify an ETH or USDG price route before the wallet opens the market.</small></p>
                  {quoteMode === "usdg" && quoteCheck === "idle" && <Button type="button" variant="ghost" size="sm" onClick={checkQuote}>Check USDG</Button>}
                </div>
              )}
            </div>
          </section>

          <section className="form-section">
            <div className="form-index">03</div>
            <div className="form-section-body">
              <div className="form-section-title"><div><p>YOUR POSITION</p><h2>Set the creator share. Enter first if you want.</h2></div></div>
              <div className="fee-slider">
                <div><span>Extra creator fee</span><strong>{(creatorTax / 100).toFixed(2)}%</strong></div>
                <Slider value={[creatorTax]} onValueChange={([value]) => setCreatorTax(value ?? 0)} min={0} max={500} step={25} />
                <p><span>0%</span><span>Protocol maximum 5%</span></p>
              </div>
              <div className="fee-breakdown">
                <p><span>Base trading fee</span><b>1.00%</b><small>70% creator · 30% protocol</small></p>
                <p><span>Your extra fee</span><b>{(creatorTax / 100).toFixed(2)}%</b><small>100% to creator</small></p>
                <p className="total"><span>Pool fee</span><b>{totalFee.toFixed(2)}%</b><small>Fixed when opened</small></p>
              </div>
              <div className="two-cols">
                <div className="dev-buy-card">
                  <div className="dev-buy-heading">
                    <span>First buy <small>optional</small></span>
                    <div className="first-buy-mode-toggle">
                      <button type="button" className={firstBuyMode === "tokens" ? "active" : ""} onClick={() => { setFirstBuyMode("tokens"); setDevBuy(""); }}>Tokens</button>
                      <button type="button" className={firstBuyMode === "spend" ? "active" : ""} onClick={() => { setFirstBuyMode("spend"); setDevBuy(""); }}>Spend</button>
                    </div>
                  </div>
                  <div className={`unit-input dev-buy-input ${firstBuyMode === "spend" ? "has-asset-picker" : "has-token-unit"}`}>
                    <Input value={devBuy} onChange={(event) => setDevBuy(event.target.value)} inputMode="decimal" placeholder={firstBuyMode === "tokens" ? "e.g. 50,000,000" : "0.0"} />
                    {firstBuyMode === "spend"
                      ? <FirstBuyAssetSelect value={firstBuyAsset} quoteSymbol={quoteSymbol} allowQuote={Boolean(pairToken && pairToken !== zeroAddress)} onChange={setFirstBuyAsset} />
                      : <b>tokens</b>}
                  </div>
                  {firstBuyMode === "tokens" && (
                    <div className="supply-shortcuts">
                      {[1, 2, 5, 10].map((percent) => <button type="button" key={percent} onClick={() => setDevBuy((1_000_000_000 * percent / 100).toLocaleString("en-US"))}>{percent}% of supply</button>)}
                    </div>
                  )}
                  <div className="dev-buy-foot">
                    <small>Lands in the same transaction as the launch, so nobody can get in before you.</small>
                    {firstBuyMode === "tokens" && (
                      <div className="dev-buy-payment"><span>Pay with</span><FirstBuyAssetSelect value={firstBuyAsset} quoteSymbol={quoteSymbol} quoteImage={customQuoteImage} allowQuote={Boolean(pairToken && pairToken !== zeroAddress)} onChange={setFirstBuyAsset} /></div>
                    )}
                  </div>
                  <div className="launch-slippage"><span>Slippage</span><SlippageSelect value={slippageBps} onChange={setSlippageBps} /></div>
                </div>
                <label className="field fee-wallet-field"><span>Fee wallet <small>optional</small></span><Input value={feeWallet} onChange={(event) => setFeeWallet(event.target.value)} placeholder={address ? compactAddress(address) : "Connected wallet"} /><small>Leave blank to use the wallet opening this market.</small></label>
              </div>
            </div>
          </section>
        </div>

        <aside className="launch-preview">
          <div className="creator-fee-entry">
            <div><span>Creator fees</span><b>Live balances in Portfolio</b></div>
            <Link className={buttonVariants({ variant: "outline", size: "sm" })} to="/me">View <ArrowRight size={14} /></Link>
            <p><span>Claimable amounts are read directly from the fee escrow.</span></p>
          </div>
          <p className="preview-label">FORM PREVIEW</p>
          <div className="preview-card">
            <div className="preview-art" style={previewImage ? { backgroundImage: `url(${previewImage})` } : undefined}>
              {!previewImage && <><BrandMark /><span>YOUR<br />MARKET</span></>}
              <b className="preview-quote-tag"><QuoteAssetAvatar symbol={quoteSymbol} image={quoteMode === "custom" ? customQuoteImage : undefined} />{quoteSymbol}</b>
            </div>
            <div className="preview-body">
              <h3>{name || "Untitled market"}</h3><p>${displaySymbol}</p>
              <div><strong>OPENING MC</strong><span>SET BY PROTOCOL</span></div>
              <div><strong>LIQUIDITY</strong><span>LOCKED FOREVER</span></div>
            </div>
          </div>
          <div className="launch-receipt">
            <p><span>Supply</span><b>1,000,000,000</b></p>
            <p><span>Supply in LP</span><b>100%</b></p>
            <p><span>Curve</span><b>None</b></p>
            <p><span>Graduation</span><b>Never needed</b></p>
            <p><span>Trading</span><b>First block</b></p>
          </div>
          {!isConnected ? <WalletButton /> : <Button type="submit" size="lg" className="launch-button" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}Open this market<ArrowRight size={17} /></Button>}
          {status && <p className="launch-status" role="status">{status}</p>}
          {launchedToken && <Link className={buttonVariants({ variant: "light" })} to={`/token/${launchedToken}`}>Enter market <ArrowRight size={15} /></Link>}
          <p className="launch-legal"><ShieldCheck size={14} /> The token and permanent V4 pool open together. ETH and any priceable token can be the pair.</p>
        </aside>
      </form>
    </div>
  );
}
