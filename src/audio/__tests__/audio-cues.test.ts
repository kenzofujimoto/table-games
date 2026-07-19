import { describe, expect, it } from "vitest";

import { audioCueForCommand } from "../audio-cues";

describe("game audio cues", () => {
  it("maps meaningful actions to distinct feedback", () => {
    expect(audioCueForCommand("rollDice")).toBe("dice");
    expect(audioCueForCommand("buildRoad")).toBe("build");
    expect(audioCueForCommand("placeSettlement")).toBe("build");
    expect(audioCueForCommand("bankTrade")).toBe("trade");
    expect(audioCueForCommand("acceptTrade")).toBe("trade");
    expect(audioCueForCommand("buyDevelopmentCard")).toBe("card");
    expect(audioCueForCommand("endTurn")).toBe("turn");
    expect(audioCueForCommand("discardResources")).toBeNull();
  });
});
