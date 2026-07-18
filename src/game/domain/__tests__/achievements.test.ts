import { describe, expect, it } from "vitest";

import { determineLargestArmy, determineLongestRoadOwner, longestRoadLength } from "../achievements";
import { calculateScore, hasWon } from "../scoring";
import { makeLinearBoard, makePlayer } from "./fixtures";

describe("longest road", () => {
  it("counts a simple five-edge route", () => {
    const board = makeLinearBoard();
    board.edges.slice(0, 5).forEach((edge) => {
      edge.roadPlayerId = "p1";
    });

    expect(longestRoadLength(board, "p1")).toBe(5);
  });

  it("does not reuse an edge when evaluating a cycle", () => {
    const board = makeLinearBoard();
    board.edges.forEach((edge) => {
      edge.roadPlayerId = "p1";
    });

    expect(longestRoadLength(board, "p1")).toBe(6);
  });

  it("stops at an opponent building", () => {
    const board = makeLinearBoard();
    board.edges.slice(0, 5).forEach((edge) => {
      edge.roadPlayerId = "p1";
    });
    board.vertices[2]!.building = { kind: "settlement", playerId: "p2" };

    expect(longestRoadLength(board, "p1")).toBe(3);
  });

  it("awards only a route with at least five edges", () => {
    const board = makeLinearBoard();
    const players = [makePlayer("p1"), makePlayer("p2")];
    expect(determineLongestRoadOwner(board, players, null)).toBeNull();
    board.edges.slice(0, 5).forEach((edge) => {
      edge.roadPlayerId = "p1";
    });
    expect(determineLongestRoadOwner(board, players, null)).toBe("p1");
  });
});

describe("largest army", () => {
  it("requires three played knights and preserves the current holder on a tie", () => {
    const p1 = { ...makePlayer("p1"), playedKnights: 3 };
    const p2 = { ...makePlayer("p2"), playedKnights: 3 };

    expect(determineLargestArmy([p1, p2], null)).toBe("p1");
    expect(determineLargestArmy([p1, p2], "p2")).toBe("p2");
    expect(determineLargestArmy([{ ...p1, playedKnights: 2 }, p2], null)).toBe("p2");
  });
});

describe("score and victory", () => {
  it("combines buildings, awards and development victory points", () => {
    const board = makeLinearBoard();
    board.vertices[0]!.building = { kind: "settlement", playerId: "p1" };
    board.vertices[2]!.building = { kind: "city", playerId: "p1" };
    const player = {
      ...makePlayer("p1"),
      developmentCards: [
        { id: "d1", kind: "victoryPoint" as const, purchasedTurn: 1, revealed: false },
      ],
    };

    expect(calculateScore(player, board, { longestRoadPlayerId: "p1", largestArmyPlayerId: "p1" })).toEqual({
      visible: 7,
      hidden: 1,
      total: 8,
    });
    expect(hasWon(player, board, { longestRoadPlayerId: "p1", largestArmyPlayerId: "p1" }, 8, "p1")).toBe(true);
    expect(hasWon(player, board, { longestRoadPlayerId: "p1", largestArmyPlayerId: "p1" }, 8, "p2")).toBe(false);
  });
});
