import { describe, expect, it } from "vitest";

import { cardsToDiscard, rollDice, validateTurnAction } from "../turn-rules";

describe("turn rules", () => {
  it("discards half, rounded down, only above seven resource cards", () => {
    expect(cardsToDiscard(7)).toBe(0);
    expect(cardsToDiscard(8)).toBe(4);
    expect(cardsToDiscard(9)).toBe(4);
  });

  it("rolls two six-sided dice from an injected random source", () => {
    expect(rollDice(() => 0)).toEqual({ first: 1, second: 1, total: 2 });
    expect(rollDice(() => 0.999)).toEqual({ first: 6, second: 6, total: 12 });
  });

  it("blocks building before dice and actions from another player", () => {
    expect(() => validateTurnAction({ action: "build", actorId: "p1", activePlayerId: "p1", phase: "roll" })).toThrow(
      "Roll the dice before building",
    );
    expect(() => validateTurnAction({ action: "roll", actorId: "p2", activePlayerId: "p1", phase: "roll" })).toThrow(
      "It is not this player's turn",
    );
    expect(validateTurnAction({ action: "build", actorId: "p1", activePlayerId: "p1", phase: "actions" })).toBe(true);
  });
});
