import type { Board, Player } from "../types";

export function makePlayer(id: string, resources = {}): Player {
  return {
    id,
    name: `Player ${id}`,
    color: "ember",
    avatar: "compass",
    connected: true,
    ready: true,
    resources: {
      wood: 0,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 0,
      ...resources,
    },
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  };
}

export function makeLinearBoard(): Board {
  return {
    seed: "test-seed",
    tiles: [
      {
        id: "tile-1",
        q: 0,
        r: 0,
        terrain: "forest",
        resource: "wood",
        number: 8,
        hasRobber: false,
        vertexIds: ["v1", "v2", "v3", "v4", "v5", "v6"],
      },
    ],
    vertices: ["v1", "v2", "v3", "v4", "v5", "v6"].map((id) => ({
      id,
      tileIds: ["tile-1"],
      building: null,
    })),
    edges: [
      { id: "e1", vertexIds: ["v1", "v2"], roadPlayerId: null },
      { id: "e2", vertexIds: ["v2", "v3"], roadPlayerId: null },
      { id: "e3", vertexIds: ["v3", "v4"], roadPlayerId: null },
      { id: "e4", vertexIds: ["v4", "v5"], roadPlayerId: null },
      { id: "e5", vertexIds: ["v5", "v6"], roadPlayerId: null },
      { id: "e6", vertexIds: ["v6", "v1"], roadPlayerId: null },
    ],
    ports: [],
  };
}
