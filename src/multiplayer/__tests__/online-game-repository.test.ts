import { describe, expect, it, vi } from "vitest";

import { createGame } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { OnlineGameRepository } from "../online-game-repository";
import type { GameRoom, PlayerProfile, RoomSettings } from "../types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const settings: RoomSettings = {
  visibility: "private",
  maxPlayers: 3,
  targetScore: 10,
  turnSeconds: 120,
  mapShape: "classic",
  terrainDistribution: "random",
  numberDistribution: "random",
  ports: "random",
  previewMap: true,
  allowSpectators: false,
  chatEnabled: true,
  confirmEndTurn: true,
};

const profile: PlayerProfile = {
  id: "p1",
  name: "Lia",
  color: "ember",
  avatar: "compass",
  crest: "sun",
};

const room: GameRoom = {
  id: "room-1",
  code: "ABC234",
  name: "Mesa",
  hostId: "p1",
  status: "lobby",
  settings,
  players: [{ profile, ready: false, connected: true, seat: 0, joinedAt: "2026-07-18T12:00:00.000Z" }],
  createdAt: "2026-07-18T12:00:00.000Z",
  gameId: null,
};

const players: Player[] = ["p1", "p2", "p3"].map((id) => ({
  id,
  name: id,
  color: "ember",
  avatar: "compass",
  connected: true,
  ready: true,
  resources: emptyResources(),
  remainingPieces: { roads: 15, settlements: 5, cities: 4 },
  developmentCards: [],
  playedKnights: 0,
  revealedVictoryPoints: 0,
}));

describe("online game repository", () => {
  it("persists the issued session and authenticates later room actions", async () => {
    const storage = new MemoryStorage();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ room, sessionToken: "s".repeat(32) }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...room,
        players: [{ ...room.players[0]!, ready: true }],
      }), { status: 200 }));
    const repository = new OnlineGameRepository({ storage, fetcher });

    await repository.createRoom({ name: room.name, host: profile, settings });
    const ready = await repository.setReady(room.code, profile.id, true);

    expect(ready.players[0]?.ready).toBe(true);
    const request = fetcher.mock.calls[1] as [string, RequestInit];
    expect(request[1].headers).toMatchObject({ Authorization: `Bearer ${"s".repeat(32)}` });
    expect(new OnlineGameRepository({ storage, fetcher }).getSession(room.code)?.playerId).toBe(profile.id);
  });

  it("submits only commands and expected versions, never a spoofable actor id", async () => {
    const storage = new MemoryStorage();
    const game = createGame({ id: "game-1", roomCode: room.code, seed: "seed", players, targetScore: 10 });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ room, sessionToken: "s".repeat(32) }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...game, version: 1 }), { status: 200 }));
    const repository = new OnlineGameRepository({ storage, fetcher });
    await repository.createRoom({ name: room.name, host: profile, settings });

    const next = await repository.executeCommand(game, {
      id: "command-1",
      type: "placeSettlement",
      actorId: "spoofed-player",
      vertexId: game.board.vertices[0]!.id,
    });

    expect(next.version).toBe(1);
    const request = fetcher.mock.calls[1] as [string, RequestInit];
    if (typeof request[1].body !== "string") throw new Error("Expected a JSON request body");
    const payload = JSON.parse(request[1].body) as { expectedVersion: number; command: Record<string, unknown> };
    expect(payload.expectedVersion).toBe(0);
    expect(payload.command).not.toHaveProperty("actorId");
  });

  it("surfaces version conflicts with a stable client error code", async () => {
    const storage = new MemoryStorage();
    const game = createGame({ id: "game-1", roomCode: room.code, seed: "seed", players, targetScore: 10 });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ room, sessionToken: "s".repeat(32) }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "VERSION_CONFLICT",
        message: "Version conflict: reload the latest game state",
      }), { status: 409 }));
    const repository = new OnlineGameRepository({ storage, fetcher });
    await repository.createRoom({ name: room.name, host: profile, settings });

    await expect(repository.executeCommand(game, {
      id: "command-1",
      type: "rollDice",
      actorId: profile.id,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
