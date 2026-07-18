import { describe, expect, it } from "vitest";

import { canBuildRoad, canBuildSettlement, validRoadEdges, validSettlementVertices } from "../placement";
import { makeLinearBoard } from "./fixtures";

describe("settlement placement", () => {
  it("enforces the distance rule on directly connected vertices", () => {
    const board = makeLinearBoard();
    board.vertices[0]!.building = { kind: "settlement", playerId: "p2" };

    expect(canBuildSettlement(board, "v2", "p1", { setup: true })).toBe(false);
    expect(canBuildSettlement(board, "v3", "p1", { setup: true })).toBe(true);
  });

  it("requires connection to the player's road outside setup", () => {
    const board = makeLinearBoard();
    board.edges[1]!.roadPlayerId = "p1";

    expect(canBuildSettlement(board, "v3", "p1", { setup: false })).toBe(true);
    expect(canBuildSettlement(board, "v5", "p1", { setup: false })).toBe(false);
    expect(validSettlementVertices(board, "p1", { setup: false })).toEqual(["v2", "v3"]);
  });
});

describe("road placement", () => {
  it("requires an empty edge connected to the player's network", () => {
    const board = makeLinearBoard();
    board.edges[0]!.roadPlayerId = "p1";

    expect(canBuildRoad(board, "e2", "p1")).toBe(true);
    expect(canBuildRoad(board, "e4", "p1")).toBe(false);
    expect(canBuildRoad(board, "e1", "p1")).toBe(false);
    expect(validRoadEdges(board, "p1")).toEqual(["e2", "e6"]);
  });

  it("cannot continue through an opponent building", () => {
    const board = makeLinearBoard();
    board.edges[0]!.roadPlayerId = "p1";
    board.vertices[1]!.building = { kind: "settlement", playerId: "p2" };

    expect(canBuildRoad(board, "e2", "p1")).toBe(false);
  });

  it("allows an initial road only when connected to the new settlement", () => {
    const board = makeLinearBoard();
    board.vertices[3]!.building = { kind: "settlement", playerId: "p1" };

    expect(canBuildRoad(board, "e3", "p1", "v4")).toBe(true);
    expect(canBuildRoad(board, "e1", "p1", "v4")).toBe(false);
  });
});
