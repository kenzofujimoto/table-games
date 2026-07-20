import { afterEach, describe, expect, it, vi } from "vitest";

import { createGame } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { OnlineGameRepository } from "../online-game-repository";
import type { ServerRealtimeMessage } from "../protocol";
import type { RealtimeClient } from "../realtime-client";
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
  gameKey: "auren",
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("online game repository", () => {
  it("loads the live public-room directory", async () => {
    const listing = [{
      code: room.code,
      name: room.name,
      gameKey: room.gameKey,
      playerCount: 1,
      maxPlayers: 3,
      targetScore: 10,
      turnSeconds: 120,
      createdAt: room.createdAt,
    }];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(listing), { status: 200 }));
    const repository = new OnlineGameRepository({ storage: new MemoryStorage(), fetcher });

    await expect(repository.listPublicRooms()).resolves.toEqual(listing);
    expect(fetcher).toHaveBeenCalledWith("/api/rooms?visibility=public", expect.objectContaining({ method: "GET" }));
  });

  it("calls the browser fetch implementation with the global receiver", async () => {
    const fetcher = vi.fn(function (this: unknown): Promise<Response> {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify(room), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetcher);
    const repository = new OnlineGameRepository({ storage: new MemoryStorage() });

    await expect(repository.getRoom(room.code)).resolves.toEqual(room);
    expect(fetcher).toHaveBeenCalledOnce();
  });

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

  it("reads rooms and games, starts sessions and handles not-found responses", async () => {
    const storage = new MemoryStorage();
    const game = createGame({ id: "game-1", roomCode: room.code, seed: "seed", players, targetScore: 10 });
    const playingRoom = { ...room, status: "playing" as const, gameId: game.id };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ room, sessionToken: "s".repeat(32) }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(room), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(playingRoom), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(game), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "NOT_FOUND", message: "Room was not found" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "NOT_FOUND", message: "Game was not found" }), { status: 404 }));
    const repository = new OnlineGameRepository({ storage, fetcher, baseUrl: "https://example.test" });
    await repository.createRoom({ name: room.name, host: profile, settings });

    await expect(repository.getRoom("abc234")).resolves.toEqual(room);
    await expect(repository.startGame(room.code, profile.id)).resolves.toEqual(playingRoom);
    await expect(repository.loadGame(game.id)).resolves.toEqual(game);
    await expect(repository.getRoom("NONE23")).resolves.toBeNull();
    await expect(repository.loadGame("missing-game")).resolves.toBeNull();
    await expect(repository.saveGame()).rejects.toThrow("authoritative server");
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://example.test/api/rooms?code=ABC234");
  });

  it("maps realtime events, sends chat and cleans up subscriptions", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const unsubscribeRealtime = vi.fn();
    const sendChat = vi.fn();
    const captured: { listener?: (message: ServerRealtimeMessage) => void } = {};
    const realtime = {
      subscribe: vi.fn((_code: string, _token: string, listener: (message: ServerRealtimeMessage) => void) => {
        captured.listener = listener;
        return unsubscribeRealtime;
      }),
      sendChat,
    } as unknown as RealtimeClient;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ room, sessionToken: "s".repeat(32) }), { status: 201 }));
    const repository = new OnlineGameRepository({ storage, fetcher, realtime });
    await repository.createRoom({ name: room.name, host: profile, settings });
    const listener = vi.fn();
    const unsubscribe = repository.subscribe(room.code, listener);
    const chat = {
      id: "message-1",
      clientMessageId: "client-1",
      roomCode: room.code,
      playerId: profile.id,
      playerName: profile.name,
      message: "Olá",
      createdAt: "2026-07-18T12:00:00.000Z",
    };

    captured.listener?.({ type: "roomUpdated", roomCode: room.code });
    captured.listener?.({ type: "gameUpdated", roomCode: room.code, gameId: "game-1", version: 1 });
    captured.listener?.({ type: "connected", roomCode: room.code, playerId: profile.id });
    captured.listener?.({ type: "chat", payload: chat });
    await repository.sendChat(room.code, profile, "  Vamos!  ");
    vi.advanceTimersByTime(5_000);

    expect(listener).toHaveBeenCalledWith({ kind: "room", roomCode: room.code });
    expect(listener).toHaveBeenCalledWith({ kind: "game", roomCode: room.code });
    expect(listener).toHaveBeenCalledWith({ kind: "connection", roomCode: room.code, connected: true });
    expect(listener).toHaveBeenCalledWith({ kind: "chat", roomCode: room.code, message: chat });
    expect(sendChat).toHaveBeenCalledWith(room.code, "s".repeat(32), expect.any(String), "Vamos!");
    unsubscribe();
    expect(unsubscribeRealtime).toHaveBeenCalledOnce();
  });

  it("rejects operations without a matching local session", async () => {
    const repository = new OnlineGameRepository({ storage: new MemoryStorage(), fetcher: vi.fn() });
    await expect(repository.loadGame("game-1")).rejects.toThrow("No online session");
    await expect(repository.setReady(room.code, profile.id, true)).rejects.toThrow("No session");
    expect(repository.subscribe(room.code, vi.fn())).toBeTypeOf("function");
  });
});
