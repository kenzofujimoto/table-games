import { describe, expect, it } from "vitest";

import type { RoomSettings } from "../../src/multiplayer/types";
import { GameSessionService } from "../game-session-service";
import { InMemoryOnlineStore } from "../in-memory-online-store";

const profiles = [
  { id: "p1", name: "Lia", color: "ember" as const, avatar: "compass", crest: "sun" },
  { id: "p2", name: "Noah", color: "tide" as const, avatar: "fox", crest: "wave" },
];

function setup(turnSeconds = 30) {
  const settings: RoomSettings = {
    visibility: "private",
    maxPlayers: 2,
    targetScore: 10,
    turnSeconds,
    mapShape: "classic",
    terrainDistribution: "random",
    numberDistribution: "random",
    ports: "random",
    previewMap: true,
    allowSpectators: false,
    chatEnabled: true,
    confirmEndTurn: true,
  };
  let currentTime = new Date("2026-07-18T12:00:00.000Z");
  let id = 0;
  const service = new GameSessionService(new InMemoryOnlineStore(), {
    now: () => currentTime,
    randomCode: () => "ABC234",
    randomId: () => `generated-${++id}`,
    issueToken: () => `session-token-${++id}`.padEnd(32, "x"),
  });
  return {
    service,
    settings,
    advance: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

async function start(service: GameSessionService, settings: RoomSettings) {
  const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
  const guest = await service.joinRoom(host.room.code, profiles[1]!);
  await service.setReady(host.room.code, host.sessionToken, true);
  await service.setReady(host.room.code, guest.sessionToken, true);
  const room = await service.startGame(host.room.code, host.sessionToken);
  return { host, guest, room };
}

describe("server-authoritative game timer", () => {
  it("ignores early ticks and applies an expired phase exactly once", async () => {
    const { service, settings, advance } = setup();
    const { host, guest, room } = await start(service, settings);
    const initial = await service.getGameView(room.gameId!, host.sessionToken);

    const early = await service.advanceExpiredGame(room.gameId!, guest.sessionToken, initial.version);
    expect(early.version).toBe(initial.version);
    expect(early.phase).toBe("setupSettlement");

    advance(30_000);
    const advanced = await service.advanceExpiredGame(room.gameId!, guest.sessionToken, initial.version);
    expect(advanced.version).toBe(initial.version + 1);
    expect(advanced.phase).toBe("setupRoad");
    await expect(service.advanceExpiredGame(room.gameId!, guest.sessionToken, initial.version)).rejects.toThrow("Version conflict");
  });

  it("grants bounded grace when the active player is reconnecting", async () => {
    const { service, settings, advance } = setup(60);
    const { host, guest, room } = await start(service, settings);
    await service.connectPresence(room.code, host.sessionToken, "host-device");
    await service.connectPresence(room.code, guest.sessionToken, "guest-device");
    const initial = await service.getGameView(room.gameId!, guest.sessionToken);

    advance(60_000);
    await service.heartbeatPresence(room.code, "p2", "guest-device");
    const grace = await service.advanceExpiredGame(room.gameId!, guest.sessionToken, initial.version);

    expect(grace.phase).toBe("setupSettlement");
    expect(grace.version).toBe(initial.version + 1);
    expect(grace.phaseDeadlineAt).toBe("2026-07-18T12:02:00.000Z");
    expect(grace.disconnectGraceUsedMs.p1).toBe(60_000);
  });
});
