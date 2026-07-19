import { describe, expect, it } from "vitest";

import type { RoomSettings } from "../../src/multiplayer/types";
import { GameSessionService } from "../game-session-service";
import { InMemoryOnlineStore } from "../in-memory-online-store";

const settings: RoomSettings = {
  visibility: "private",
  maxPlayers: 2,
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

const profiles = [
  { id: "p1", name: "Lia", color: "ember" as const, avatar: "compass", crest: "sun" },
  { id: "p2", name: "Noah", color: "tide" as const, avatar: "fox", crest: "wave" },
];

function setup() {
  const store = new InMemoryOnlineStore();
  let currentTime = new Date("2026-07-18T12:00:00.000Z");
  let id = 0;
  const service = new GameSessionService(store, {
    now: () => currentTime,
    randomCode: () => "ABC234",
    randomId: () => `generated-${++id}`,
    issueToken: () => `session-token-${++id}`.padEnd(32, "x"),
  });
  return {
    service,
    store,
    advance: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

describe("authoritative presence", () => {
  it("moves from online through reconnecting to offline without trusting socket close", async () => {
    const { service, advance } = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });

    await service.connectPresence(host.room.code, host.sessionToken, "connection-a");
    await expect(service.getRoom(host.room.code)).resolves.toMatchObject({
      players: [{ connected: true, connectionStatus: "online" }],
    });

    advance(50_000);
    await expect(service.getRoom(host.room.code)).resolves.toMatchObject({
      players: [{ connected: false, connectionStatus: "reconnecting" }],
    });

    advance(20_000);
    await expect(service.getRoom(host.room.code)).resolves.toMatchObject({
      players: [{ connected: false, connectionStatus: "offline" }],
    });
  });

  it("keeps a player online while any browser tab still owns a live lease", async () => {
    const { service, advance } = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    await service.connectPresence(host.room.code, host.sessionToken, "connection-a");
    advance(20_000);
    await service.connectPresence(host.room.code, host.sessionToken, "connection-b");
    advance(30_000);

    await expect(service.getRoom(host.room.code)).resolves.toMatchObject({
      players: [{ connected: true, connectionStatus: "online" }],
    });
  });

  it("removes an intentional lobby departure and transfers host ownership", async () => {
    const { service } = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const guest = await service.joinRoom(host.room.code, profiles[1]!);

    const room = await service.leaveRoom(host.room.code, host.sessionToken);

    expect(room.players.map((player) => player.profile.id)).toEqual(["p2"]);
    expect(room.hostId).toBe("p2");
    await expect(service.authenticate(room.code, host.sessionToken)).rejects.toThrow("Invalid session");
    await expect(service.authenticate(room.code, guest.sessionToken)).resolves.toMatchObject({ playerId: "p2" });
  });

  it("transfers a crashed lobby host only after reconnection grace expires", async () => {
    const { service, advance } = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const guest = await service.joinRoom(host.room.code, profiles[1]!);
    await service.connectPresence(host.room.code, host.sessionToken, "host-device");
    await service.connectPresence(host.room.code, guest.sessionToken, "guest-device");

    advance(50_000);
    await service.heartbeatPresence(host.room.code, "p2", "guest-device");
    expect((await service.getRoom(host.room.code))?.hostId).toBe("p1");

    advance(20_000);
    await service.heartbeatPresence(host.room.code, "p2", "guest-device");
    expect((await service.getRoom(host.room.code))?.hostId).toBe("p2");
  });

  it("preserves a playing seat under autopilot and lets the authenticated player reclaim it", async () => {
    const { service } = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const guest = await service.joinRoom(host.room.code, profiles[1]!);
    await service.setReady(host.room.code, host.sessionToken, true);
    await service.setReady(host.room.code, guest.sessionToken, true);
    const playing = await service.startGame(host.room.code, host.sessionToken);

    const abandoned = await service.leaveRoom(playing.code, guest.sessionToken);
    expect(abandoned.players).toHaveLength(2);
    expect(abandoned.players.find((player) => player.profile.id === "p2")?.control).toBe("autopilot");
    await expect(service.getGameView(playing.gameId!, guest.sessionToken)).resolves.toMatchObject({
      players: [{ id: "p1" }, { id: "p2", control: "autopilot" }],
    });

    await service.connectPresence(playing.code, guest.sessionToken, "returning-device");
    await expect(service.getGameView(playing.gameId!, guest.sessionToken)).resolves.toMatchObject({
      players: [{ id: "p1" }, { id: "p2", control: "human", connectionStatus: "online" }],
    });
  });
});
