import { describe, expect, it, vi } from "vitest";

import { createGame, type GameState } from "../../src/game/application/game-engine";
import { emptyResources, type Player } from "../../src/game/domain/types";
import type { GameRoom, RoomSettings } from "../../src/multiplayer/types";
import { DurableOnlineStore, type SnapshotArchive } from "../durable-online-store";
import { InMemoryOnlineStore } from "../in-memory-online-store";
import type { ChatMessage, ServerRealtimeMessage } from "../../src/multiplayer/protocol";
import type { StoredRoomRecord } from "../online-store";

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

const players: Player[] = ["p1", "p2", "p3"].map((id, index) => ({
  id,
  name: `Player ${index + 1}`,
  color: ["ember", "tide", "moss"][index]!,
  avatar: "compass",
  connected: true,
  ready: true,
  resources: emptyResources(),
  remainingPieces: { roads: 15, settlements: 5, cities: 4 },
  developmentCards: [],
  playedKnights: 0,
  revealedVictoryPoints: 0,
}));

function roomRecord(revision = 0): StoredRoomRecord {
  const room: GameRoom = {
    id: "room-1",
    code: "ABC234",
    name: "Mesa",
    hostId: "p1",
    status: "lobby",
    settings,
    players: players.map((player, seat) => ({
      profile: {
        id: player.id,
        name: player.name,
        color: player.color as "ember" | "tide" | "moss",
        avatar: player.avatar,
        crest: "sun",
      },
      ready: player.ready,
      connected: player.connected,
      seat,
      joinedAt: "2026-07-18T12:00:00.000Z",
    })),
    createdAt: "2026-07-18T12:00:00.000Z",
    gameId: null,
  };
  return { revision, room, sessionHashes: { p1: "hash-1", p2: "hash-2", p3: "hash-3" } };
}

class MemorySnapshotArchive implements SnapshotArchive {
  readonly rooms: StoredRoomRecord[] = [];
  readonly games: GameState[] = [];

  async writeRoom(record: StoredRoomRecord) {
    this.rooms.push(structuredClone(record));
  }

  async loadLatestRoom(code: string) {
    return structuredClone(this.rooms.filter((record) => record.room.code === code).at(-1) ?? null);
  }

  async writeGame(state: GameState) {
    this.games.push(structuredClone(state));
  }

  async loadLatestGame(gameId: string) {
    return structuredClone(this.games.filter((state) => state.id === gameId).at(-1) ?? null);
  }
}

describe("durable online store", () => {
  it("archives every successful room and game revision", async () => {
    const archive = new MemorySnapshotArchive();
    const store = new DurableOnlineStore(new InMemoryOnlineStore(), archive);
    const initialRoom = roomRecord();
    const changedRoom = { ...initialRoom, revision: 1, room: { ...initialRoom.room, name: "Mesa atualizada" } };
    const initialGame = createGame({
      id: "game-1",
      roomCode: "ABC234",
      seed: "seed",
      players,
      targetScore: 10,
    });
    const changedGame = { ...initialGame, version: 1, turnNumber: 2 };

    expect(await store.createRoom(initialRoom)).toBe(true);
    expect(await store.compareAndSetRoom("ABC234", 0, changedRoom)).toBe(true);
    expect(await store.createGame(initialGame)).toBe(true);
    expect(await store.compareAndSetGame("game-1", 0, changedGame)).toBe(true);

    expect(archive.rooms.map((record) => record.revision)).toEqual([0, 1]);
    expect(archive.games.map((state) => state.version)).toEqual([0, 1]);
  });

  it("recovers the latest durable snapshots after an empty cache restart", async () => {
    const archive = new MemorySnapshotArchive();
    const firstStore = new DurableOnlineStore(new InMemoryOnlineStore(), archive);
    const initialRoom = roomRecord();
    const latestRoom = { ...initialRoom, revision: 1, room: { ...initialRoom.room, name: "Recuperada" } };
    const game = createGame({ id: "game-1", roomCode: "ABC234", seed: "seed", players, targetScore: 10 });
    await firstStore.createRoom(initialRoom);
    await firstStore.compareAndSetRoom("ABC234", 0, latestRoom);
    await firstStore.createGame(game);

    const restartedStore = new DurableOnlineStore(new InMemoryOnlineStore(), archive);
    await expect(restartedStore.getRoom("ABC234")).resolves.toEqual(latestRoom);
    await expect(restartedStore.getGame("game-1")).resolves.toEqual(game);
  });

  it("does not archive rejected stale writes", async () => {
    const archive = new MemorySnapshotArchive();
    const store = new DurableOnlineStore(new InMemoryOnlineStore(), archive);
    const initialRoom = roomRecord();
    await store.createRoom(initialRoom);

    const stale = { ...initialRoom, revision: 1 };
    expect(await store.compareAndSetRoom("ABC234", 9, stale)).toBe(false);
    expect(archive.rooms).toHaveLength(1);
  });

  it("forwards chat and pub/sub operations to the live cache", async () => {
    const store = new DurableOnlineStore(new InMemoryOnlineStore(), new MemorySnapshotArchive());
    const message: ChatMessage = {
      id: "message-1",
      clientMessageId: "client-1",
      roomCode: "ABC234",
      playerId: "p1",
      playerName: "Lia",
      message: "Olá",
      createdAt: "2026-07-18T12:00:00.000Z",
    };
    const listener = vi.fn<(event: ServerRealtimeMessage) => void>();
    const unsubscribe = await store.subscribe("ABC234", listener);
    await store.appendChat(message);
    await store.publish("ABC234", { type: "chat", payload: message });

    await expect(store.getChat("ABC234", 10)).resolves.toEqual([message]);
    expect(listener).toHaveBeenCalledWith({ type: "chat", payload: message });
    await unsubscribe();
    await store.publish("ABC234", { type: "roomUpdated", roomCode: "ABC234" });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("returns null when neither cache nor archive contains a snapshot", async () => {
    const store = new DurableOnlineStore(new InMemoryOnlineStore(), new MemorySnapshotArchive());
    await expect(store.getRoom("NONE23")).resolves.toBeNull();
    await expect(store.getGame("missing-game")).resolves.toBeNull();
  });
});
