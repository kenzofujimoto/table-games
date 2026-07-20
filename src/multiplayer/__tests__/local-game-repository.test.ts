import { describe, expect, it, vi } from "vitest";

import { createGame, type GameState } from "@/game/application/game-engine";
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

function createPlayer(id: string, color: Player["color"], name = id): Player {
  return {
    id,
    name,
    color,
    avatar: "compass",
    connected: true,
    ready: true,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  };
}

describe("local room repository", () => {
  it("lists only discoverable public rooms with available seats", async () => {
    let random = 0;
    const repository = new LocalGameRepository({
      storage: new MemoryStorage(),
      random: () => (random += 0.071) % 0.99,
    });
    const publicSettings = { ...settings, visibility: "public" as const };
    const open = await repository.createRoom({ name: "Mesa aberta", host: profiles[0]!, settings: publicSettings });
    await repository.createRoom({ name: "Mesa privada", host: profiles[1]!, settings });
    const full = await repository.createRoom({
      name: "Mesa lotada",
      host: profiles[0]!,
      settings: { ...publicSettings, maxPlayers: 2 },
    });
    await repository.joinRoom(full.code, profiles[1]!);

    await expect(repository.listPublicRooms()).resolves.toEqual([
      expect.objectContaining({ code: open.code, name: open.name, playerCount: 1 }),
    ]);
  });

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

  it("handles missing, malformed and invalid room operations explicitly", async () => {
    const storage = new MemoryStorage();
    storage.setItem("auren:rooms:v1", "{malformed");
    const repository = new LocalGameRepository({ storage, random: () => 0.5 });
    await expect(repository.getRoom("NONE23")).resolves.toBeNull();
    await expect(repository.loadGame("missing-game")).resolves.toBeNull();
    await expect(repository.createRoom({ name: "x", host: profiles[0]!, settings })).rejects.toThrow("Room name");
    await expect(repository.joinRoom("NONE23", profiles[1]!)).rejects.toThrow("Room was not found");
    await expect(repository.setReady("NONE23", "p1", true)).rejects.toThrow("Room was not found");

    const room = await repository.createRoom({ name: "Mesa válida", host: profiles[0]!, settings });
    await expect(repository.setReady(room.code, "unknown", true)).rejects.toThrow("Player is not in the room");
    await expect(repository.startGame(room.code, "p1")).rejects.toThrow("every seat filled");
  });

  it("forwards valid cross-tab channel events and ignores malformed messages", async () => {
    const channel = { onmessage: null, postMessage: vi.fn() } as unknown as BroadcastChannel;
    const repository = new LocalGameRepository({
      storage: new MemoryStorage(),
      random: () => 0.6,
      channelFactory: () => channel,
    });
    const listener = vi.fn();
    const unsubscribe = repository.subscribe("ABC234", listener);
    channel.onmessage?.({ data: { unexpected: true } } as MessageEvent);
    channel.onmessage?.({ data: { kind: "room", roomCode: "ABC234" } } as MessageEvent);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    channel.onmessage?.({ data: { kind: "room", roomCode: "ABC234" } } as MessageEvent);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("transfers lobby ownership and moves departed game players to autopilot", async () => {
    let random = 0;
    const repository = new LocalGameRepository({
      storage: new MemoryStorage(),
      random: () => (random += 0.083) % 0.99,
    });
    const room = await repository.createRoom({ name: "Mesa", host: profiles[0]!, settings: { ...settings, maxPlayers: 2 } });
    await repository.joinRoom(room.code, profiles[1]!);
    const transferred = await repository.leaveRoom(room.code, "p1");
    expect(transferred.hostId).toBe("p2");
    expect(transferred.players[0]?.seat).toBe(0);

    const secondRoom = await repository.createRoom({ name: "Outra mesa", host: profiles[0]!, settings: { ...settings, maxPlayers: 2 } });
    await repository.joinRoom(secondRoom.code, profiles[1]!);
    await repository.setReady(secondRoom.code, "p1", true);
    await repository.setReady(secondRoom.code, "p2", true);
    const started = await repository.startGame(secondRoom.code, "p1");
    const game = createGame({
      id: started.gameId!,
      roomCode: started.code,
      seed: "local-autopilot",
      players: [
        createPlayer("p1", "ember", "Lia"),
        createPlayer("p2", "tide", "Noah"),
      ],
      targetScore: 10,
    });
    await repository.saveGame(game);

    const departed = await repository.leaveRoom(started.code, "p2");
    expect(departed.players.find((player) => player.profile.id === "p2")).toMatchObject({ control: "autopilot", connected: false });
    const savedGame = await repository.loadGame(game.id);
    expect(savedGame?.players.find((player) => player.id === "p2")).toMatchObject({ control: "autopilot" });
  });

  it("executes commands, advances expired phases and validates local chat", async () => {
    const repository = new LocalGameRepository({ storage: new MemoryStorage(), random: () => 0.7 });
    const game = createGame({
      id: "local-game",
      roomCode: "LOCAL2",
      seed: "local-actions",
      players: [
        createPlayer("p1", "ember"),
        createPlayer("p2", "tide"),
      ],
      targetScore: 10,
    });
    const vertexId = game.board.vertices.find((vertex) => vertex.building === null)!.id;
    const commanded = await repository.executeCommand(game, {
      id: "local-command",
      type: "placeSettlement",
      actorId: "p1",
      vertexId,
    });
    expect(commanded.version).toBe(1);

    const expired = await repository.advanceExpiredGame({
      ...game,
      phaseDeadlineAt: "2000-01-01T00:00:00.000Z",
    });
    expect(expired.version).toBe(1);

    const listener = vi.fn();
    repository.subscribe("LOCAL2", listener);
    await repository.sendChat("local2", profiles[0]!, "  Vamos jogar!  ");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ kind: "chat", roomCode: "LOCAL2" }));
    await expect(repository.sendChat("LOCAL2", profiles[0]!, " ")).rejects.toThrow("entre 1 e 280");
  });
});
