import { describe, expect, it } from "vitest";

import {
  AUREN_GAME_ID,
  defineGameManifest,
  gameRegistry,
  validatePlayerCount,
} from "../game-registry";
import { gameRoomSchema, roomSettingsSchema } from "@/multiplayer/types";

const aurenSettings = {
  visibility: "private" as const,
  maxPlayers: 3,
  targetScore: 10,
  turnSeconds: 120,
  mapShape: "classic" as const,
  terrainDistribution: "random" as const,
  numberDistribution: "random" as const,
  ports: "random" as const,
  previewMap: true,
  allowSpectators: true,
  chatEnabled: true,
  confirmEndTurn: true,
};

describe("game registry", () => {
  it("registers Auren as one game in a platform-wide catalog", () => {
    expect(gameRegistry.get(AUREN_GAME_ID)).toMatchObject({
      id: "auren",
      title: "Auren — Rotas do Horizonte",
      minPlayers: 2,
      maxPlayers: 4,
    });
  });

  it("supports games starting at two players without a platform maximum", () => {
    const partyGame = defineGameManifest({
      id: "party-test",
      title: "Party Test",
      description: "A test-only party game.",
      minPlayers: 2,
      maxPlayers: null,
      capabilities: {
        simultaneous: true,
        teams: true,
        spectators: true,
        joinInProgress: true,
      },
    });

    expect(validatePlayerCount(partyGame, 1)).toBe(false);
    expect(validatePlayerCount(partyGame, 2)).toBe(true);
    expect(validatePlayerCount(partyGame, 250)).toBe(true);
  });

  it("keeps Auren constrained to two through four players", () => {
    const auren = gameRegistry.get(AUREN_GAME_ID)!;
    expect(validatePlayerCount(auren, 1)).toBe(false);
    expect(validatePlayerCount(auren, 2)).toBe(true);
    expect(validatePlayerCount(auren, 3)).toBe(true);
    expect(validatePlayerCount(auren, 4)).toBe(true);
    expect(validatePlayerCount(auren, 5)).toBe(false);
  });
});

describe("room compatibility", () => {
  it("accepts platform capacities from two players through unbounded", () => {
    expect(roomSettingsSchema.parse({ ...aurenSettings, maxPlayers: 2 }).maxPlayers).toBe(2);
    expect(roomSettingsSchema.parse({ ...aurenSettings, maxPlayers: null }).maxPlayers).toBeNull();
  });

  it("migrates rooms without a game id to Auren", () => {
    const parsed = gameRoomSchema.parse({
      id: "room-legacy",
      code: "ABC234",
      name: "Legacy room",
      hostId: "p1",
      status: "lobby",
      settings: aurenSettings,
      players: [{
        profile: { id: "p1", name: "Lia", color: "ember", avatar: "fox", crest: "sun" },
        ready: false,
        connected: true,
        seat: 0,
        joinedAt: "2026-07-18T00:00:00.000Z",
      }],
      createdAt: "2026-07-18T00:00:00.000Z",
      gameId: null,
    });

    expect(parsed.gameKey).toBe(AUREN_GAME_ID);
  });
});
