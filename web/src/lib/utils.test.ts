import { describe, expect, it } from "vitest";

import { compactAddress, compactNumber, timeAgo } from "./utils";

describe("display helpers", () => {
  it("shortens an address without losing both ends", () => {
    expect(compactAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x12345…5678");
  });

  it("uses compact notation for market numbers", () => {
    expect(compactNumber(128_400)).toMatch(/128(?:\.4)?K/i);
  });

  it("keeps very recent launches live", () => {
    expect(timeAgo(Math.floor(Date.now() / 1000) - 4)).toBe("now");
  });
});
