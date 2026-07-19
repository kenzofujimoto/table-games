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
    const counts = board.tiles.reduce<Record<string, typeof board.tiles>>((result, tile) => {
      result[tile.terrain] = [...(result[tile.terrain] ?? []), tile];
      return result;
    }, {});

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

  it("creates four generic ports and one two-for-one port for every resource", () => {
    const board = generateBoard({ seed: "complete-ports", shape: "classic" });
    const kinds = board.ports.map((port) => port.kind);

    expect(board.ports).toHaveLength(9);
    expect(kinds.filter((kind) => kind === "generic")).toHaveLength(4);
    expect(kinds.filter((kind) => kind === "wood")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "brick")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "wool")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "grain")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "ore")).toHaveLength(1);
    expect(board.ports.every((port) => port.ratio === (port.kind === "generic" ? 3 : 2))).toBe(true);
  });

  it("places ports on unique separated coastal edges", () => {
    const board = generateBoard({ seed: "coastal-ports", shape: "classic" });
    const portEdges = board.ports.map((port) => board.edges.find((edge) => edge.id === port.edgeId)!);

    expect(new Set(portEdges.map((edge) => edge.id)).size).toBe(portEdges.length);
    expect(portEdges.every((edge) => edge.vertexIds.every((vertexId) => {
      const vertex = board.vertices.find((candidate) => candidate.id === vertexId)!;
      return vertex.tileIds.length < 3;
    }))).toBe(true);
    expect(portEdges.every((edge, index) => portEdges.every((other, otherIndex) => (
      index === otherIndex || !edge.vertexIds.some((vertexId) => other.vertexIds.includes(vertexId))
    )))).toBe(true);
  });

  it("rejects an empty seed and reports malformed boards", () => {
    expect(() => generateBoard({ seed: "  ", shape: "classic" })).toThrow("A board seed is required");
    const board = generateBoard({ seed: "invalid-copy", shape: "classic" });
    board.tiles = board.tiles.slice(0, 18);
    expect(validateBoardBalance(board).balanced).toBe(false);
  });
});
