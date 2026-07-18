import { RESOURCE_TYPES, type Board, type Player, type Resource, type ResourceCounts } from "./types.js";

export interface ProductionGrant {
  playerId: string;
  resource: Resource;
  amount: number;
  tileId: string;
}

interface ProductionInput {
  roll: number;
  board: Board;
  players: Player[];
  bank: ResourceCounts;
}

export interface ProductionResult {
  players: Player[];
  bank: ResourceCounts;
  grants: ProductionGrant[];
}

export function distributeProduction(input: ProductionInput): ProductionResult {
  const requested: ProductionGrant[] = [];

  for (const tile of input.board.tiles) {
    if (tile.number !== input.roll || tile.hasRobber || tile.resource === null) {
      continue;
    }

    for (const vertexId of tile.vertexIds) {
      const building = input.board.vertices.find((vertex) => vertex.id === vertexId)?.building;
      if (building) {
        requested.push({
          playerId: building.playerId,
          resource: tile.resource,
          amount: building.kind === "city" ? 2 : 1,
          tileId: tile.id,
        });
      }
    }
  }

  const demand = requested.reduce<ResourceCounts>((counts, grant) => {
    counts[grant.resource] += grant.amount;
    return counts;
  }, { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 });

  const unavailable = new Set(
    RESOURCE_TYPES.filter((resource) => demand[resource] > input.bank[resource]),
  );
  const grants = requested.filter((grant) => !unavailable.has(grant.resource));
  const players = input.players.map((player) => ({ ...player, resources: { ...player.resources } }));
  const bank = { ...input.bank };

  for (const grant of grants) {
    const player = players.find((candidate) => candidate.id === grant.playerId);
    if (!player) {
      continue;
    }
    player.resources[grant.resource] += grant.amount;
    bank[grant.resource] -= grant.amount;
  }

  return { players, bank, grants };
}
