import { describe, expect, it, vi } from "vitest";

import type { GameState } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { LocalGameRepository } from "../local-game-repository";
import type { PlayerProfile, RoomSettings } from "../types";

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
  allowSpectators: true,
  chatEnabled: true,
  confirmEndTurn: true,
};

const profiles: PlayerProfile[] = [
  { id: "p1", name: "Lia", color: "ember", avatar: "compass", crest: "sun" },
  { id: "p2", name: "Noah", color: "tide", avatar: "fox", crest: "wave" },
  { id: "p3", name: "Maya", color: "moss", avatar: "owl", crest: "leaf" },
];

describe("local room repository", () => {
  it("creates, joins and restores a private room by code", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalGameRepository({ storage, random: () => 0.1 });
    const room = await repository.createRoom({ name: "Rota de sábado", host: profiles[0]!, settings });
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.players).toHaveLength(1);

    const joined = await repository.joinRoom(room.code.toLowerCase(), profiles[1]!);
    expect(joined.players.map((player) => player.profile.name)).toEqual(["Lia", "Noah"]);

    const restoredRepository = new LocalGameRepository({ storage, random: () => 0.2 });
    await expect(restoredRepository.getRoom(room.code)).resolves.toEqual(joined);
  });

  it("prevents duplicate colors, duplicate players and over-capacity joins", async () => {
    const repository = new LocalGameRepository({ storage: new MemoryStorage(), random: () => 0.2 });
    const room = await repository.createRoom({ name: "Mesa", host: profiles[0]!, settings: { ...settings, maxPlayers: 3 } });
    await expect(repository.joinRoom(room.code, { ...profiles[1]!, color: "ember" })).rejects.toThrow("Color is already in use");
    await repository.joinRoom(room.code, profiles[1]!);
    await repository.joinRoom(room.code, profiles[2]!);
    await expect(repository.joinRoom(room.code, { ...profiles[2]!, id: "p4", color: "amethyst" })).rejects.toThrow("Room is full");
    await expect(repository.joinRoom(room.code, profiles[1]!)).rejects.toThrow("Player is already in the room");
  });

  it("tracks readiness and only lets the host start a full ready room", async () => {
    const repository = new LocalGameRepository({ storage: new MemoryStorage(), random: () => 0.3 });
    const room = await repository.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    await repository.joinRoom(room.code, profiles[1]!);
    await repository.joinRoom(room.code, profiles[2]!);
    await repository.setReady(room.code, "p1", true);
    await repository.setReady(room.code, "p2", true);
    await expect(repository.startGame(room.code, "p1")).rejects.toThrow("Every player must be ready");
    await repository.setReady(room.code, "p3", true);
    await expect(repository.startGame(room.code, "p2")).rejects.toThrow("Only the host can start the game");

    const started = await repository.startGame(room.code, "p1");
    expect(started.status).toBe("playing");
    expect(started.gameId).toBeTruthy();
  });

  it("persists game snapshots and notifies subscribers", async () => {
    const repository = new LocalGameRepository({ storage: new MemoryStorage(), random: () => 0.4 });
    const listener = vi.fn();
    const unsubscribe = repository.subscribe("ABC234", listener);
    const player: Player = {
      id: "p1",
      name: "Lia",
      color: "ember",
      avatar: "compass",
      connected: true,
      ready: true,
      resources: emptyResources(),
      remainingPieces: { roads: 15, settlements: 5, cities: 4 },
      developmentCards: [],
      playedKnights: 0,
      revealedVictoryPoints: 0,
    };
    const snapshot = { id: "g1", roomCode: "ABC234", players: [player], version: 2 } as GameState;
    await repository.saveGame(snapshot);
    await expect(repository.loadGame("g1")).resolves.toEqual(snapshot);
    expect(listener).toHaveBeenCalledWith({ kind: "game", roomCode: "ABC234" });
    unsubscribe();
  });
});
