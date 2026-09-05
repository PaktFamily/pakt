import { describe, expect, it } from "vitest";
import { encodePacked, zeroAddress, type Address, type Hex, type PublicClient } from "viem";

import {
  inspectQuoteAsset,
  buildBuyEthLeg,
  launchAndBuyWithQuoteCall,
  normalizeTokenParams,
  prepareLaunch,
  type Deployment,
  type LaunchInput,
} from "../src/index.js";

const addresses = {
  creator: "0x0000000000000000000000000000000000000011" as Address,
  quote: "0x0000000000000000000000000000000000000022" as Address,
  factory: "0x0000000000000000000000000000000000000033" as Address,
  router: "0x0000000000000000000000000000000000000044" as Address,
  pricer: "0x0000000000000000000000000000000000000055" as Address,
  locker: "0x0000000000000000000000000000000000000066" as Address,
  escrow: "0x0000000000000000000000000000000000000077" as Address,
  deployer: "0x0000000000000000000000000000000000000088" as Address,
  minter: "0x0000000000000000000000000000000000000099" as Address,
  predicted: "0x00000000000000000000000000000000000000AA" as Address,
};

const deployment: Deployment = {
  factory: addresses.factory,
  router: addresses.router,
  quotePricer: addresses.pricer,
  locker: addresses.locker,
  feeEscrow: addresses.escrow,
};

const input: LaunchInput = {
  creator: addresses.creator,
  pairToken: addresses.quote,
  launchConfigId: 0n,
  creatorTaxBps: 100,
  salt: `0x${"ab".repeat(32)}` as Hex,
  metadata: { name: "Developer Coin", symbol: "DEV" },
};

describe("SDK", () => {
  it("normalizes metadata and pins economics", () => {
    const digest = `0x${"cd".repeat(32)}` as Hex;
    const params = normalizeTokenParams(input, digest);
    expect(params.expectedEconomics).toBe(digest);
    expect(params.creatorFeeRecipient).toBe(zeroAddress);
    expect(params.socials.website).toBe("");
  });

  it("rejects salts that are not bytes32", () => {
    expect(() => normalizeTokenParams({ ...input, salt: "0x12" as Hex }, `0x${"cd".repeat(32)}` as Hex)).toThrow(
      "salt must be exactly 32 bytes",
    );
  });

  it("enforces byte limits for multibyte metadata", () => {
    expect(() =>
      normalizeTokenParams(
        { ...input, metadata: { ...input.metadata, name: "火".repeat(22) } },
        `0x${"cd".repeat(32)}` as Hex,
      ),
    ).toThrow("name exceeds the 64-byte protocol limit");
  });

  it("treats native ETH as priceable without inventing a reference pool", async () => {
    const client = {
      readContract: async ({ functionName }: { functionName: string }) => {
        expect(functionName).toBe("minReferenceEth");
        return 5n * 10n ** 18n;
      },
    } as unknown as PublicClient;

    const status = await inspectQuoteAsset(client, deployment, zeroAddress);
    expect(status.priceable).toBe(true);
    expect(status.direct).toBeUndefined();
  });

  it("prepares a pinned direct launch and atomic quote buy", async () => {
    const digest = `0x${"cd".repeat(32)}` as Hex;
    const readContract = async ({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        canLaunch: true,
        launchFee: 500_000_000_000_000n,
        getLaunchConfig: { supply: 1_000_000_000n * 10n ** 18n, phantomQuote: 1n, tickSpacing: 10, enabled: true },
        previewLaunchEconomics: digest,
        previewQuoteEconomics: 2_500_000_000n,
        launchDeployer: addresses.deployer,
        positionMinter: addresses.minter,
        maxCreatorTaxBps: 500n,
        predictTokenAddress: addresses.predicted,
      };
      return values[functionName];
    };
    const client = { readContract } as unknown as PublicClient;

    const preview = await prepareLaunch(client, deployment, input);
    expect(preview.predictedToken).toBe(addresses.predicted);
    expect(preview.params.expectedEconomics).toBe(digest);
    expect(preview.directCall.value).toBe(500_000_000_000_000n);

    const call = launchAndBuyWithQuoteCall(deployment, preview, input, 1_000_000n, 1n);
    expect(call.functionName).toBe("launchAndBuyWithQuote");
    expect(call.value).toBe(preview.launchFee);
  });

  it("builds an atomic ETH route across V3 and a V4 quote hop", async () => {
    const weth = "0x00000000000000000000000000000000000000b1" as Address;
    const usdg = "0x00000000000000000000000000000000000000b2" as Address;
    const v3Pool = "0x00000000000000000000000000000000000000b3" as Address;
    const v4Key = {
      currency0: usdg,
      currency1: addresses.quote,
      fee: 10_000,
      tickSpacing: 200,
      hooks: zeroAddress,
    };
    const client = { readContract: async () => 500 } as unknown as PublicClient;
    const leg = await buildBuyEthLeg(client, {
      priceable: true,
      minReferenceEth: 1n,
      usdgLeg: { kind: 1, v3Pool, v4Key, anchor: weth, anchorDepth: 1n, anchorFloor: 1n, qualifies: true },
      viaUsdg: { kind: 2, v3Pool: zeroAddress, v4Key, anchor: usdg, anchorDepth: 1n, anchorFloor: 1n, qualifies: true },
    }, addresses.quote, weth, usdg);
    expect(leg.v3Path).toBe(encodePacked(["address", "uint24", "address"], [weth, 500, usdg]));
    expect(leg.v4Hops).toEqual([v4Key]);
  });
});
