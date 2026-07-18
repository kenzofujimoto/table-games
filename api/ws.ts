import { createServer } from "node:http";

import { WebSocket, WebSocketServer, type RawData } from "ws";

import { getGameSessionService } from "../server/game-session-service-factory";
import { errorResult } from "../server/http-api";
import { getOnlineStore } from "../server/online-store-factory";
import {
  clientRealtimeMessageSchema,
  type ServerRealtimeMessage,
} from "../src/multiplayer/protocol";

const server = createServer();
const webSockets = new WebSocketServer({ server, maxPayload: 16 * 1024 });

function send(socket: WebSocket, message: ServerRealtimeMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function parsePayload(data: RawData): unknown {
  try {
    const text = Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(data)).toString("utf8")
        : data.toString("utf8");
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error("Malformed WebSocket JSON", { cause: error });
  }
}

webSockets.on("connection", (socket) => {
  let unsubscribe: (() => Promise<void>) | null = null;

  socket.on("message", (data) => {
    void (async () => {
      try {
        const message = clientRealtimeMessageSchema.parse(parsePayload(data));
        if (message.type === "ping") {
          send(socket, { type: "pong", sentAt: message.sentAt });
          return;
        }

        const service = await getGameSessionService();
        if (message.type === "subscribe") {
          const { playerId, record } = await service.authenticate(message.roomCode, message.sessionToken);
          if (unsubscribe) await unsubscribe();
          const store = await getOnlineStore();
          unsubscribe = await store.subscribe(message.roomCode, (event) => send(socket, event));
          send(socket, { type: "connected", roomCode: message.roomCode, playerId });
          send(socket, {
            type: "presence",
            roomCode: message.roomCode,
            playerIds: record.room.players.filter((player) => player.connected).map((player) => player.profile.id),
          });
          return;
        }
        if (message.type === "command") {
          const state = await service.executeCommand(
            message.gameId,
            message.sessionToken,
            message.command,
            message.expectedVersion,
          );
          send(socket, { type: "gameUpdated", roomCode: state.roomCode, gameId: state.id, version: state.version });
          return;
        }
        await service.sendChat(
          message.roomCode,
          message.sessionToken,
          message.clientMessageId,
          message.message,
        );
      } catch (error) {
        const result = errorResult(error);
        const body = result.body as { code?: unknown; message?: unknown };
        send(socket, {
          type: "error",
          code: typeof body.code === "string" ? body.code : "INVALID_MESSAGE",
          message: typeof body.message === "string" ? body.message : "The realtime message is invalid",
        });
      }
    })();
  });

  socket.on("close", () => {
    if (unsubscribe) void unsubscribe();
  });
});

export default server;
