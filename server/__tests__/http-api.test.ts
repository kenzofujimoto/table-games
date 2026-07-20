import { describe, expect, it, vi } from "vitest";

import type { PlayerProfile, RoomSettings } from "../../src/multiplayer/types";
import { GameSessionService } from "../game-session-service";
import { errorResult, handleGameApi, handleRoomApi } from "../http-api";
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
  it("returns a discoverable list of public lobbies without requiring a room code", async () => {
    const service = setup();
    await service.createRoom({
      name: "Mesa aberta",
      host: profiles[0]!,
      settings: { ...settings, visibility: "public" },
    });

    const result = await handleRoomApi({ method: "GET", query: { visibility: "public" } }, service);

    expect(result).toMatchObject({
      status: 200,
      body: [{ code: "ABC234", name: "Mesa aberta", playerCount: 1, maxPlayers: 3 }],
    });
  });

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

  it("forwards the selected game when creating a two-player room", async () => {
    const service = setup();
    const createRoom = vi.spyOn(service, "createRoom");
    const twoPlayerSettings = { ...settings, maxPlayers: 2 };

    const created = await handleRoomApi({
      method: "POST",
      body: {
        action: "create",
        gameKey: "auren",
        name: "Duelo online",
        host: profiles[0],
        settings: twoPlayerSettings,
      },
    }, service);

    expect(created.status).toBe(201);
    expect(createRoom).toHaveBeenCalledWith({
      gameKey: "auren",
      name: "Duelo online",
      host: profiles[0],
      settings: twoPlayerSettings,
    });
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

  it("handles game reads, missing parameters and unsupported methods", async () => {
    const service = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const second = await service.joinRoom(host.room.code, profiles[1]!);
    const third = await service.joinRoom(host.room.code, profiles[2]!);
    await service.setReady(host.room.code, host.sessionToken, true);
    await service.setReady(host.room.code, second.sessionToken, true);
    await service.setReady(host.room.code, third.sessionToken, true);
    const room = await service.startGame(host.room.code, host.sessionToken);
    const headers = { authorization: `Bearer ${host.sessionToken}` };

    const game = await handleGameApi({ method: "GET", headers, query: { id: room.gameId! } }, service);
    const missingId = await handleGameApi({ method: "GET", headers }, service);
    const unsupportedGame = await handleGameApi({ method: "DELETE", headers }, service);
    const invalidRoom = await handleRoomApi({ method: "GET", query: { code: "BAD" } }, service);
    const unsupportedRoom = await handleRoomApi({ method: "PATCH" }, service);

    expect(game).toMatchObject({ status: 200, body: { id: room.gameId } });
    expect(missingId).toMatchObject({ status: 400, body: { code: "INVALID_REQUEST" } });
    expect(unsupportedGame).toMatchObject({ status: 405, body: { code: "METHOD_NOT_ALLOWED" } });
    expect(invalidRoom.status).toBe(400);
    expect(unsupportedRoom.status).toBe(405);
  });

  it("routes join, readiness and start actions through the authenticated boundary", async () => {
    const service = setup();
    const host = await service.createRoom({ name: "Mesa", host: profiles[0]!, settings });
    const joined = await handleRoomApi({
      method: "POST",
      body: { action: "join", roomCode: host.room.code, profile: profiles[1] },
    }, service);
    const second = joined.body as { sessionToken: string };
    const third = await service.joinRoom(host.room.code, profiles[2]!);
    const hostReady = await handleRoomApi({
      method: "POST",
      headers: { authorization: `Bearer ${host.sessionToken}` },
      body: { action: "ready", roomCode: host.room.code, ready: true },
    }, service);
    await service.setReady(host.room.code, second.sessionToken, true);
    await service.setReady(host.room.code, third.sessionToken, true);
    const started = await handleRoomApi({
      method: "POST",
      headers: { authorization: `Bearer ${host.sessionToken}` },
      body: { action: "start", roomCode: host.room.code },
    }, service);

    expect(joined.status).toBe(200);
    expect(hostReady.status).toBe(200);
    expect((hostReady.body as { players: Array<{ ready: boolean }> }).players[0]?.ready).toBe(true);
    expect(started).toMatchObject({ status: 200, body: { status: "playing" } });
  });

  it("maps known domain failures and hides non-error internals", () => {
    expect(errorResult(new Error("Invalid session token"))).toMatchObject({ status: 401, body: { code: "UNAUTHORIZED" } });
    expect(errorResult(new Error("Game was not found"))).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    expect(errorResult(new Error("Only the host can start"))).toMatchObject({ status: 403, body: { code: "FORBIDDEN" } });
    expect(errorResult(new Error("Every player must be ready"))).toMatchObject({ status: 409, body: { code: "INVALID_ACTION" } });
    expect(errorResult({ secret: "do not expose" })).toEqual({
      status: 500,
      body: { code: "INTERNAL_ERROR", message: "Unexpected server error" },
    });
  });
});
