// @vitest-environment node

import type { AddressInfo } from "node:net";

import WebSocket, { type RawData } from "ws";
import { afterAll, describe, expect, it } from "vitest";

import server from "../../api/ws";
import type { ServerRealtimeMessage } from "../../src/multiplayer/protocol";
import type { RoomSettings } from "../../src/multiplayer/types";
import { getGameSessionService } from "../game-session-service-factory";

function decodeMessage(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
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

afterAll(async () => {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

describe("WebSocket API", () => {
  it("authenticates a room subscription and answers heartbeats", async () => {
    const service = await getGameSessionService();
    const session = await service.createRoom({
      name: "Mesa WebSocket",
      host: { id: "ws-player", name: "Lia", color: "ember", avatar: "compass", crest: "sun" },
      settings,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerRealtimeMessage[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket integration timed out")), 3_000);
      socket.on("open", () => {
        socket.send(JSON.stringify({
          type: "subscribe",
          roomCode: session.room.code,
          sessionToken: session.sessionToken,
        }));
        socket.send(JSON.stringify({ type: "ping", sentAt: 1234 }));
      });
      socket.on("message", (data) => {
        messages.push(JSON.parse(decodeMessage(data)) as ServerRealtimeMessage);
        if (messages.some((message) => message.type === "connected") && messages.some((message) => message.type === "pong")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    expect(messages).toContainEqual({ type: "connected", roomCode: session.room.code, playerId: "ws-player" });
    expect(messages).toContainEqual({ type: "pong", sentAt: 1234 });
    socket.close();
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
  });
});
