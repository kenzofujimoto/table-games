import { describe, expect, it } from "vitest";

import { BUILD_COSTS, canAfford, payCost } from "../economy";
import { distributeProduction } from "../production";
import { makeLinearBoard, makePlayer } from "./fixtures";

describe("building economy", () => {
  it("uses the classic base-game costs", () => {
    expect(BUILD_COSTS.road).toEqual({ wood: 1, brick: 1 });
    expect(BUILD_COSTS.settlement).toEqual({ wood: 1, brick: 1, wool: 1, grain: 1 });
    expect(BUILD_COSTS.city).toEqual({ grain: 2, ore: 3 });
    expect(BUILD_COSTS.developmentCard).toEqual({ wool: 1, grain: 1, ore: 1 });
  });

  it("refuses a purchase when one resource is missing", () => {
    const resources = { wood: 2, brick: 1, wool: 1, grain: 0, ore: 0 };
    expect(canAfford(resources, BUILD_COSTS.settlement)).toBe(false);
    expect(() => payCost(resources, BUILD_COSTS.settlement)).toThrow("Insufficient resources");
  });

  it("deducts an affordable cost without mutating the input", () => {
    const resources = { wood: 2, brick: 1, wool: 1, grain: 1, ore: 0 };
    expect(payCost(resources, BUILD_COSTS.settlement)).toEqual({
      wood: 1,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 0,
    });
    expect(resources.wood).toBe(2);
  });
});

describe("resource production", () => {
  it("grants one resource to a settlement and two to a city", () => {
    const board = makeLinearBoard();
    board.vertices[0]!.building = { kind: "settlement", playerId: "p1" };
    board.vertices[2]!.building = { kind: "city", playerId: "p2" };

    const result = distributeProduction({
      roll: 8,
      board,
      players: [makePlayer("p1"), makePlayer("p2")],
      bank: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    });

    expect(result.players[0]!.resources.wood).toBe(1);
    expect(result.players[1]!.resources.wood).toBe(2);
    expect(result.bank.wood).toBe(16);
    expect(result.grants).toEqual([
      { playerId: "p1", resource: "wood", amount: 1, tileId: "tile-1" },
      { playerId: "p2", resource: "wood", amount: 2, tileId: "tile-1" },
    ]);
  });

  it("blocks production on the robber tile", () => {
    const board = makeLinearBoard();
    board.tiles[0]!.hasRobber = true;
    board.vertices[0]!.building = { kind: "settlement", playerId: "p1" };

    const result = distributeProduction({
      roll: 8,
      board,
      players: [makePlayer("p1")],
      bank: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    });

    expect(result.grants).toEqual([]);
  });

  it("pays nobody for a resource when the bank cannot satisfy its full demand", () => {
    const board = makeLinearBoard();
    board.vertices[0]!.building = { kind: "city", playerId: "p1" };
    board.vertices[2]!.building = { kind: "city", playerId: "p2" };

    const result = distributeProduction({
      roll: 8,
      board,
      players: [makePlayer("p1"), makePlayer("p2")],
      bank: { wood: 3, brick: 19, wool: 19, grain: 19, ore: 19 },
    });

    expect(result.grants).toEqual([]);
    expect(result.bank.wood).toBe(3);
  });
});
