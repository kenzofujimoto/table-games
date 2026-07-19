export const AUREN_GAME_ID = "auren";

export interface GameCapabilities {
  simultaneous: boolean;
  teams: boolean;
  spectators: boolean;
  joinInProgress: boolean;
}

export interface GameManifest {
  id: string;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number | null;
  capabilities: GameCapabilities;
}

export function defineGameManifest(manifest: GameManifest): GameManifest {
  if (!Number.isInteger(manifest.minPlayers) || manifest.minPlayers < 2) {
    throw new Error("Games must support at least two players");
  }
  if (manifest.maxPlayers !== null && (
    !Number.isInteger(manifest.maxPlayers)
    || manifest.maxPlayers < manifest.minPlayers
  )) {
    throw new Error("The maximum player count must include the minimum");
  }
  return Object.freeze({ ...manifest, capabilities: Object.freeze({ ...manifest.capabilities }) });
}

export function validatePlayerCount(manifest: GameManifest, playerCount: number): boolean {
  return Number.isInteger(playerCount)
    && playerCount >= manifest.minPlayers
    && (manifest.maxPlayers === null || playerCount <= manifest.maxPlayers);
}

export function validateRoomCapacity(manifest: GameManifest, capacity: number | null): boolean {
  if (capacity === null) return manifest.maxPlayers === null;
  return validatePlayerCount(manifest, capacity);
}

const aurenManifest = defineGameManifest({
  id: AUREN_GAME_ID,
  title: "Auren — Rotas do Horizonte",
  description: "Explore, negocie e construa rotas em uma ilha procedural.",
  minPlayers: 2,
  maxPlayers: 4,
  capabilities: {
    simultaneous: false,
    teams: false,
    spectators: true,
    joinInProgress: false,
  },
});

export const gameRegistry = new Map<string, GameManifest>([
  [aurenManifest.id, aurenManifest],
]);

export function getGameManifest(gameId: string): GameManifest {
  const manifest = gameRegistry.get(gameId);
  if (!manifest) throw new Error("Game is not available");
  return manifest;
}
