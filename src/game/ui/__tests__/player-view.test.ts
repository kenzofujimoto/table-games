import { describe, expect, it } from "vitest";

import type { GameState } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { canOpenTrade, canPlayerInteract, resourceCardTotal } from "../player-view";

function player(id: string): Player {
  return {
    id,
    name: id,
    color: "ember",
    avatar: "compass",
    connected: true,
    ready: true,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  };
}

describe("player-specific game view", () => {
  it("uses public card totals when an opponent's resources are hidden", () => {
    const opponent = { ...player("p2"), resourceCardCount: 7 };
    expect(resourceCardTotal(opponent)).toBe(7);
    expect(resourceCardTotal({ ...player("p1"), resources: { ...emptyResources(), wood: 2, ore: 1 } })).toBe(3);
  });

  it("only enables turn actions for the active player, while allowing personal discards", () => {
    const state = {
      players: [player("p1"), player("p2")],
      activePlayerIndex: 0,
      phase: "actions",
      pendingDiscards: {},
    } as GameState;
    expect(canPlayerInteract(state, "p1")).toBe(true);
    expect(canPlayerInteract(state, "p2")).toBe(false);
    expect(canPlayerInteract({ ...state, phase: "discard", pendingDiscards: { p2: 3 } }, "p2")).toBe(true);
  });

  it("lets an invited player open an active trade outside their turn", () => {
    const state = {
      players: [player("p1"), player("p2"), player("p3")],
      activePlayerIndex: 0,
      phase: "actions",
      pendingDiscards: {},
      trades: [{
        id: "trade-1",
        proposerId: "p1",
        offer: { ...emptyResources(), wood: 1 },
        request: { ...emptyResources(), ore: 1 },
        targetPlayerIds: ["p2"],
        status: "open",
        responderId: null,
      }],
    } as GameState;

    expect(canOpenTrade(state, "p1")).toBe(true);
    expect(canOpenTrade(state, "p2")).toBe(true);
    expect(canOpenTrade(state, "p3")).toBe(false);
    expect(canOpenTrade({ ...state, phase: "roll" }, "p2")).toBe(false);
  });
});
