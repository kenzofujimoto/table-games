import type { Board, BoardEdge, BoardVertex } from "./types";

interface SettlementOptions {
  setup: boolean;
}

function connectedEdges(board: Board, vertexId: string): BoardEdge[] {
  return board.edges.filter((edge) => edge.vertexIds.includes(vertexId));
}

function adjacentVertices(board: Board, vertexId: string): BoardVertex[] {
  const ids = connectedEdges(board, vertexId).map((edge) =>
    edge.vertexIds[0] === vertexId ? edge.vertexIds[1] : edge.vertexIds[0],
  );
  return ids.flatMap((id) => board.vertices.filter((vertex) => vertex.id === id));
}

export function canBuildSettlement(
  board: Board,
  vertexId: string,
  playerId: string,
  options: SettlementOptions,
): boolean {
  const vertex = board.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex || vertex.building || adjacentVertices(board, vertexId).some((candidate) => candidate.building !== null)) {
    return false;
  }

  return options.setup || connectedEdges(board, vertexId).some((edge) => edge.roadPlayerId === playerId);
}

export function validSettlementVertices(board: Board, playerId: string, options: SettlementOptions): string[] {
  return board.vertices
    .filter((vertex) => canBuildSettlement(board, vertex.id, playerId, options))
    .map((vertex) => vertex.id);
}

function networkConnectsAtVertex(board: Board, edge: BoardEdge, vertexId: string, playerId: string): boolean {
  const vertex = board.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex || (vertex.building && vertex.building.playerId !== playerId)) {
    return false;
  }
  if (vertex.building?.playerId === playerId) {
    return true;
  }
  return connectedEdges(board, vertexId).some(
    (candidate) => candidate.id !== edge.id && candidate.roadPlayerId === playerId,
  );
}

export function canBuildRoad(
  board: Board,
  edgeId: string,
  playerId: string,
  setupSettlementVertexId?: string,
): boolean {
  const edge = board.edges.find((candidate) => candidate.id === edgeId);
  if (!edge || edge.roadPlayerId) {
    return false;
  }

  if (setupSettlementVertexId !== undefined) {
    const settlement = board.vertices.find((vertex) => vertex.id === setupSettlementVertexId)?.building;
    return edge.vertexIds.includes(setupSettlementVertexId) && settlement?.playerId === playerId;
  }

  return edge.vertexIds.some((vertexId) => networkConnectsAtVertex(board, edge, vertexId, playerId));
}

export function validRoadEdges(board: Board, playerId: string, setupSettlementVertexId?: string): string[] {
  return board.edges
    .filter((edge) => canBuildRoad(board, edge.id, playerId, setupSettlementVertexId))
    .map((edge) => edge.id);
}
