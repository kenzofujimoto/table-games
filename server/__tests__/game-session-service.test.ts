import { describe, expect, it } from "vitest";

import type { GameState } from "../../src/game/application/game-engine";
import { emptyResources } from "../../src/game/domain/types";
import type { PlayerProfile, RoomSettings } from "../../src/multiplayer/types";
import { GameSessionService } from "../game-session-service";
import { InMemoryOnlineStore } from "../in-memory-online-store";

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

const profiles: PlayerProfile[] = [
  { id: "p1", name: "Lia", color: "ember", avatar: "compass", crest: "sun" },
  { id: "p2", name: "Noah", color: "tide", avatar: "fox", crest: "wave" },
  { id: "p3", name: "Maya", color: "moss", avatar: "owl", crest: "leaf" },
];

function createService() {
  const store = new InMemoryOnlineStore();
  let id = 0;
  const service = new GameSessionService(store, {
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    randomCode: () => "ABC234",
    randomId: () => `generated-${++id}`,
    issueToken: () => `session-token-${++id}`.padEnd(32, "x"),
  });
  return { service, store };
}

async function startThreePlayerGame(service: GameSessionService) {
  const host = await service.createRoom({ name: "Rota de sábado", host: profiles[0]!, settings });
  const second = await service.joinRoom(host.room.code, profiles[1]!);
  const third = await service.joinRoom(host.room.code, profiles[2]!);
  await service.setReady(host.room.code, host.sessionToken, true);
  await service.setReady(host.room.code, second.sessionToken, true);
  await service.setReady(host.room.code, third.sessionToken, true);
  const room = await service.startGame(host.room.code, host.sessionToken);
  return { room, host, second, third };
}

function totalResourceSupply(state: GameState): number {
  const playerCards = state.players.reduce((total, player) => (
    total + Object.values(player.resources).reduce((subtotal, amount) => subtotal + amount, 0)
  ), 0);
  return playerCards + Object.values(state.bank).reduce((total, amount) => total + amount, 0);
}

describe("authoritative online game sessions", () => {
  it("lists only public lobbies that still have open seats", async () => {
    const store = new InMemoryOnlineStore();
    const codes = ["PUB234", "PRI234", "FULL23"];
    let id = 0;
    const service = new GameSessionService(store, {
      now: () => new Date("2026-07-18T12:00:00.000Z"),
      randomCode: () => codes.shift()!,
      randomId: () => `generated-${++id}`,
      issueToken: () => `session-token-${++id}`.padEnd(32, "x"),
    });
    const publicSettings = { ...settings, visibility: "public" as const };
    const publicRoom = await service.createRoom({ name: "Mesa pública", host: profiles[0]!, settings: publicSettings });
    await service.createRoom({ name: "Mesa privada", host: profiles[1]!, settings });
    const fullRoom = await service.createRoom({
      name: "Mesa lotada",
      host: profiles[0]!,
      settings: { ...publicSettings, maxPlayers: 2 },
    });
    await service.joinRoom(fullRoom.room.code, profiles[1]!);

    await expect(service.listPublicRooms()).resolves.toEqual([
      expect.objectContaining({ code: publicRoom.room.code, name: "Mesa pública", playerCount: 1, maxPlayers: 3 }),
    ]);
  });

  it("creates private sessions without exposing token hashes in room data", async () => {
    const { service } = createService();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const guest = await service.joinRoom(host.room.code, profiles[1]!);

    expect(host.sessionToken).not.toBe(guest.sessionToken);
    expect(host.sessionToken.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(await service.getRoom(host.room.code))).not.toContain("session-token");
  });

  it("authenticates readiness and only starts a full ready room for the host", async () => {
    const { service } = createService();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const second = await service.joinRoom(host.room.code, profiles[1]!);
    await service.joinRoom(host.room.code, profiles[2]!);

    const updated = await service.setReady(host.room.code, second.sessionToken, true);
    expect(updated.players.find((player) => player.profile.id === "p2")?.ready).toBe(true);
    expect(updated.players.find((player) => player.profile.id === "p1")?.ready).toBe(false);
    await expect(service.startGame(host.room.code, second.sessionToken)).rejects.toThrow("Only the host");
    await expect(service.startGame(host.room.code, "invalid-token".padEnd(32, "x"))).rejects.toThrow("Invalid session");
  });

  it("creates the game on the server and rejects stale command versions", async () => {
    const { service } = createService();
    const { room, host } = await startThreePlayerGame(service);
    expect(room.gameId).toBeTruthy();

    const initial = await service.getGameView(room.gameId!, host.sessionToken);
    const vertex = initial.board.vertices.find((candidate) => candidate.building === null)!;
    const next = await service.executeCommand(
      room.gameId!,
      host.sessionToken,
      { id: "command-1", type: "placeSettlement", vertexId: vertex.id },
      initial.version,
    );

    expect(next.version).toBe(initial.version + 1);
    await expect(service.executeCommand(
      room.gameId!,
      host.sessionToken,
      { id: "command-2", type: "placeSettlement", vertexId: vertex.id },
      initial.version,
    )).rejects.toThrow("Version conflict");
  });

  it("executes player trades authoritatively without creating resource cards", async () => {
    const { service, store } = createService();
    const { room, host, second } = await startThreePlayerGame(service);
    const stored = await store.getGame(room.gameId!);
    expect(stored).not.toBeNull();
    const funded: GameState = {
      ...stored!,
      version: stored!.version + 1,
      phase: "actions",
      activePlayerIndex: 0,
      players: stored!.players.map((player) => ({
        ...player,
        resources: player.id === "p1"
          ? { ...emptyResources(), wood: 2 }
          : player.id === "p2" ? { ...emptyResources(), ore: 1 } : emptyResources(),
      })),
    };
    expect(await store.compareAndSetGame(funded.id, stored!.version, funded)).toBe(true);
    const supplyBefore = totalResourceSupply(funded);

    const proposed = await service.executeCommand(
      funded.id,
      host.sessionToken,
      {
        id: "server-trade",
        type: "proposeTrade",
        offer: { ...emptyResources(), wood: 2 },
        request: { ...emptyResources(), ore: 1 },
        targetPlayerIds: ["p2", "p3"],
      },
      funded.version,
    );
    await service.executeCommand(
      funded.id,
      second.sessionToken,
      { id: "server-accept", type: "respondTrade", tradeId: "server-trade", response: "accept" },
      proposed.version,
    );

    const finalState = await store.getGame(funded.id);
    expect(finalState).not.toBeNull();
    expect(totalResourceSupply(finalState!)).toBe(supplyBefore);
    expect(finalState!.players[0]!.resources).toMatchObject({ wood: 0, ore: 1 });
    expect(finalState!.players[1]!.resources).toMatchObject({ wood: 2, ore: 0 });
  });

  it("never reveals opponents' resources or hidden development cards", async () => {
    const { service, store } = createService();
    const { room, host } = await startThreePlayerGame(service);
    const stored = await store.getGame(room.gameId!);
    expect(stored).not.toBeNull();
    stored!.players[0]!.resources = { ...emptyResources(), wood: 3 };
    stored!.players[1]!.resources = { ...emptyResources(), ore: 2, grain: 1 };
    stored!.players[1]!.developmentCards = [
      { id: "hidden-card", kind: "monopoly", purchasedTurn: 1, revealed: false },
    ];
    const changed = { ...stored!, version: stored!.version + 1 };
    expect(await store.compareAndSetGame(changed.id, stored!.version, changed)).toBe(true);

    const view = await service.getGameView(room.gameId!, host.sessionToken);
    expect(view.players[0]!.resources.wood).toBe(3);
    expect(view.players[1]!.resources).toEqual(emptyResources());
    expect(view.players[1]!.resourceCardCount).toBe(3);
    expect(view.players[1]!.developmentCards).toEqual([]);
    expect(view.players[1]!.developmentCardCount).toBe(1);
  });

  it("stores authenticated chat, publishes it and enforces message limits", async () => {
    const { service } = createService();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });

    const message = await service.sendChat(host.room.code, host.sessionToken, "client-1", "  Olá, tripulação!  ");
    expect(message).toMatchObject({
      clientMessageId: "client-1",
      playerId: "p1",
      playerName: "Lia",
      message: "Olá, tripulação!",
    });
    await expect(service.getChat(host.room.code, host.sessionToken, 500)).resolves.toEqual([message]);
    await expect(service.sendChat(host.room.code, host.sessionToken, "client-2", "   ")).rejects.toThrow("between 1 and 280");
  });

  it("rejects chat when the room owner disabled it", async () => {
    const { service } = createService();
    const host = await service.createRoom({
      name: "Mesa",
      host: profiles[0]!,
      settings: { ...settings, chatEnabled: false },
    });
    await expect(service.sendChat(host.room.code, host.sessionToken, "client-1", "Olá")).rejects.toThrow("Chat is disabled");
  });

  it("keeps the room in the lobby when initial game persistence fails", async () => {
    class RejectInitialGameStore extends InMemoryOnlineStore {
      override async createGame() {
        return false;
      }
    }
    let id = 0;
    const service = new GameSessionService(new RejectInitialGameStore(), {
      randomCode: () => "ABC234",
      randomId: () => `generated-${++id}`,
      issueToken: () => `session-token-${++id}`.padEnd(32, "x"),
    });
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const second = await service.joinRoom(host.room.code, profiles[1]!);
    const third = await service.joinRoom(host.room.code, profiles[2]!);
    await service.setReady(host.room.code, host.sessionToken, true);
    await service.setReady(host.room.code, second.sessionToken, true);
    await service.setReady(host.room.code, third.sessionToken, true);

    await expect(service.startGame(host.room.code, host.sessionToken)).rejects.toThrow("Game state already exists");
    await expect(service.getRoom(host.room.code)).resolves.toMatchObject({ status: "lobby", gameId: null });
  });
});
