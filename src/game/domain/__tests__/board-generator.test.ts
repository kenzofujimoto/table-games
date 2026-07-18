import { describe, expect, it } from "vitest";

import { generateBoard, validateBoardBalance } from "../board-generator";

describe("seeded board generation", () => {
  it("always generates the same classic map for the same seed", () => {
    expect(generateBoard({ seed: "auren-42", shape: "classic" })).toEqual(
      generateBoard({ seed: "auren-42", shape: "classic" }),
    );
  });

  it("generates 19 tiles with the classic terrain distribution", () => {
    const board = generateBoard({ seed: "classic-layout", shape: "classic" });
    const counts = Object.groupBy(board.tiles, (tile) => tile.terrain);

    expect(board.tiles).toHaveLength(19);
    expect(counts.forest).toHaveLength(4);
    expect(counts.pasture).toHaveLength(4);
    expect(counts.fields).toHaveLength(4);
    expect(counts.hills).toHaveLength(3);
    expect(counts.mountains).toHaveLength(3);
    expect(counts.desert).toHaveLength(1);
  });

  it("keeps sixes and eights apart and includes every resource", () => {
    for (const seed of ["alpha", "bravo", "charlie", "delta", "echo"]) {
      const board = generateBoard({ seed, shape: "classic" });
      expect(validateBoardBalance(board)).toEqual({ balanced: true, issues: [] });
    }
  });

  it("creates unique topology references for vertices and edges", () => {
    const board = generateBoard({ seed: "topology", shape: "classic" });
    expect(new Set(board.vertices.map((vertex) => vertex.id)).size).toBe(board.vertices.length);
    expect(new Set(board.edges.map((edge) => edge.id)).size).toBe(board.edges.length);
    expect(board.tiles.every((tile) => tile.vertexIds.length === 6)).toBe(true);
  });
});
