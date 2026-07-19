import { describe, expect, it } from "vitest";

import { formatCountdown, remainingMilliseconds } from "../countdown";

describe("game countdown", () => {
  it("uses the authoritative deadline instead of a local starting value", () => {
    const deadline = "2026-07-18T12:02:00.000Z";
    expect(remainingMilliseconds(deadline, new Date("2026-07-18T12:00:30.400Z"))).toBe(89_600);
    expect(formatCountdown(89_600)).toBe("01:30");
  });

  it("never renders negative time", () => {
    expect(remainingMilliseconds("2026-07-18T12:00:00.000Z", new Date("2026-07-18T12:00:10.000Z"))).toBe(0);
    expect(formatCountdown(0)).toBe("00:00");
  });
});
