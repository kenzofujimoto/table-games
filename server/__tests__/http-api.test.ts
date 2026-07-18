import { describe, expect, it } from "vitest";

import type { PlayerProfile, RoomSettings } from "../../src/multiplayer/types";
import { GameSessionService } from "../game-session-service";
import { handleGameApi, handleRoomApi } from "../http-api";
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

function setup() {
  let id = 0;
  const service = new GameSessionService(new InMemoryOnlineStore(), {
    randomCode: () => "ABC234",
    randomId: () => `generated-${++id}`,
    issueToken: () => `token-${++id}`.padEnd(32, "x"),
  });
  return service;
}

describe("HTTP multiplayer API", () => {
  it("creates and reads rooms without leaking private session data", async () => {
    const service = setup();
    const created = await handleRoomApi({
      method: "POST",
      body: { action: "create", name: "Mesa online", host: profiles[0], settings },
    }, service);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ room: { code: "ABC234" } });
    expect(created.body).toHaveProperty("sessionToken");

    const room = await handleRoomApi({ method: "GET", query: { code: "abc234" } }, service);
    expect(room.status).toBe(200);
    expect(JSON.stringify(room.body)).not.toContain("token-");
    expect(JSON.stringify(room.body)).not.toContain("sessionHashes");
  });

  it("requires bearer authentication and validates strict payloads", async () => {
    const service = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const unauthorized = await handleRoomApi({
      method: "POST",
      body: { action: "ready", roomCode: host.room.code, ready: true },
    }, service);
    const malformed = await handleRoomApi({
      method: "POST",
      headers: { authorization: `Bearer ${host.sessionToken}` },
      body: { action: "ready", roomCode: host.room.code, ready: true, playerId: "p2" },
    }, service);

    expect(unauthorized).toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });
    expect(malformed).toMatchObject({ status: 400, body: { code: "INVALID_REQUEST" } });
  });

  it("executes authenticated commands and maps stale versions to HTTP 409", async () => {
    const service = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const second = await service.joinRoom(host.room.code, profiles[1]!);
    const third = await service.joinRoom(host.room.code, profiles[2]!);
    await service.setReady(host.room.code, host.sessionToken, true);
    await service.setReady(host.room.code, second.sessionToken, true);
    await service.setReady(host.room.code, third.sessionToken, true);
    const room = await service.startGame(host.room.code, host.sessionToken);
    const initial = await service.getGameView(room.gameId!, host.sessionToken);
    const vertex = initial.board.vertices.find((candidate) => candidate.building === null)!;
    const request = {
      method: "POST" as const,
      headers: { authorization: `Bearer ${host.sessionToken}` },
      body: {
        gameId: room.gameId,
        expectedVersion: initial.version,
        command: { id: "command-1", type: "placeSettlement", vertexId: vertex.id },
      },
    };

    const accepted = await handleGameApi(request, service);
    const stale = await handleGameApi({
      ...request,
      body: { ...request.body, command: { ...request.body.command, id: "command-2" } },
    }, service);

    expect(accepted).toMatchObject({ status: 200, body: { version: initial.version + 1 } });
    expect(stale).toMatchObject({ status: 409, body: { code: "VERSION_CONFLICT" } });
  });
});
