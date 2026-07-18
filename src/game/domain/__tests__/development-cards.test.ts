import { describe, expect, it } from "vitest";

import { applyMonopoly, canPlayDevelopmentCard, drawDevelopmentCard } from "../development-cards";
import { makePlayer } from "./fixtures";

describe("development cards", () => {
  it("cannot play a newly purchased card or a second card in the same turn", () => {
    const card = { id: "d1", kind: "knight" as const, purchasedTurn: 4, revealed: false };

    expect(canPlayDevelopmentCard(card, 4, false)).toBe(false);
    expect(canPlayDevelopmentCard(card, 5, true)).toBe(false);
    expect(canPlayDevelopmentCard(card, 5, false)).toBe(true);
  });

  it("draws deterministically from a shared deck", () => {
    const deck = ["knight", "monopoly", "victoryPoint"] as const;
    expect(drawDevelopmentCard([...deck], () => 0.5)).toEqual({ card: "monopoly", remainingDeck: ["knight", "victoryPoint"] });
  });

  it("moves every selected resource from opponents during monopoly", () => {
    const players = [
      makePlayer("p1"),
      makePlayer("p2", { ore: 2 }),
      makePlayer("p3", { ore: 3 }),
    ];
    const result = applyMonopoly(players, "p1", "ore");

    expect(result.find((player) => player.id === "p1")!.resources.ore).toBe(5);
    expect(result.find((player) => player.id === "p2")!.resources.ore).toBe(0);
    expect(result.find((player) => player.id === "p3")!.resources.ore).toBe(0);
  });
});
