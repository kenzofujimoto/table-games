import type { Board, Player } from "./types.js";

export function longestRoadLength(board: Board, playerId: string): number {
  const playerEdges = board.edges.filter((edge) => edge.roadPlayerId === playerId);
  const blockedVertices = new Set(
    board.vertices
      .filter((vertex) => vertex.building !== null && vertex.building.playerId !== playerId)
      .map((vertex) => vertex.id),
  );

  const walk = (vertexId: string, usedEdges: ReadonlySet<string>): number => {
    if (usedEdges.size > 0 && blockedVertices.has(vertexId)) {
      return usedEdges.size;
    }

    const choices = playerEdges.filter(
      (edge) => edge.vertexIds.includes(vertexId) && !usedEdges.has(edge.id),
    );
    let best = usedEdges.size;

    for (const edge of choices) {
      const nextVertex = edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      const nextUsed = new Set(usedEdges);
      nextUsed.add(edge.id);
      best = Math.max(best, walk(nextVertex, nextUsed));
    }

    return best;
  };

  return board.vertices.reduce((best, vertex) => {
    if (blockedVertices.has(vertex.id)) {
      return best;
    }
    return Math.max(best, walk(vertex.id, new Set<string>()));
  }, 0);
}

export function determineLargestArmy(players: Player[], currentHolderId: string | null): string | null {
  const eligible = players.filter((player) => player.playedKnights >= 3);
  if (eligible.length === 0) {
    return null;
  }

  const maximum = Math.max(...eligible.map((player) => player.playedKnights));
  const leaders = eligible.filter((player) => player.playedKnights === maximum);
  if (currentHolderId && leaders.some((player) => player.id === currentHolderId)) {
    return currentHolderId;
  }
  return leaders[0]?.id ?? null;
}

export function determineLongestRoadOwner(
  board: Board,
  players: Player[],
  currentHolderId: string | null,
): string | null {
  const lengths = players.map((player) => ({ id: player.id, length: longestRoadLength(board, player.id) }));
  const maximum = Math.max(0, ...lengths.map((candidate) => candidate.length));
  if (maximum < 5) {
    return null;
  }
  const leaders = lengths.filter((candidate) => candidate.length === maximum);
  if (currentHolderId && leaders.some((candidate) => candidate.id === currentHolderId)) {
    return currentHolderId;
  }
  return leaders.length === 1 ? leaders[0]!.id : null;
}
