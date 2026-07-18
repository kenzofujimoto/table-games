export const RESOURCE_TYPES = ["wood", "brick", "wool", "grain", "ore"] as const;

export type Resource = (typeof RESOURCE_TYPES)[number];

export type ResourceCounts = Record<Resource, number>;

export type Terrain = "forest" | "hills" | "pasture" | "fields" | "mountains" | "desert";

export type BuildingKind = "settlement" | "city";

export type DevelopmentCardKind =
  | "knight"
  | "roadBuilding"
  | "yearOfPlenty"
  | "monopoly"
  | "victoryPoint";

export interface DevelopmentCard {
  id: string;
  kind: DevelopmentCardKind;
  purchasedTurn: number;
  revealed: boolean;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  avatar: string;
  connected: boolean;
  ready: boolean;
  resources: ResourceCounts;
  remainingPieces: {
    roads: number;
    settlements: number;
    cities: number;
  };
  developmentCards: DevelopmentCard[];
  resourceCardCount?: number;
  developmentCardCount?: number;
  playedKnights: number;
  revealedVictoryPoints: number;
}

export interface BoardBuilding {
  kind: BuildingKind;
  playerId: string;
}

export interface BoardTile {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  resource: Resource | null;
  number: number | null;
  hasRobber: boolean;
  vertexIds: string[];
}

export interface BoardVertex {
  id: string;
  tileIds: string[];
  building: BoardBuilding | null;
  x?: number;
  y?: number;
}

export interface BoardEdge {
  id: string;
  vertexIds: [string, string];
  roadPlayerId: string | null;
}

export type PortKind = Resource | "generic";

export interface BoardPort {
  id: string;
  edgeId: string;
  kind: PortKind;
  ratio: 2 | 3;
}

export interface Board {
  seed: string;
  tiles: BoardTile[];
  vertices: BoardVertex[];
  edges: BoardEdge[];
  ports: BoardPort[];
}

export interface AchievementState {
  longestRoadPlayerId: string | null;
  largestArmyPlayerId: string | null;
}

export type TurnPhase = "setupSettlement" | "setupRoad" | "roll" | "discard" | "robber" | "actions" | "finished";

export function emptyResources(amount = 0): ResourceCounts {
  return { wood: amount, brick: amount, wool: amount, grain: amount, ore: amount };
}

export function terrainResource(terrain: Terrain): Resource | null {
  const mapping: Record<Terrain, Resource | null> = {
    forest: "wood",
    hills: "brick",
    pasture: "wool",
    fields: "grain",
    mountains: "ore",
    desert: null,
  };
  return mapping[terrain];
}
