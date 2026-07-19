import { ZodError } from "zod";

import { gameApiRequestSchema, roomApiRequestSchema } from "../src/multiplayer/protocol.js";
import type { GameSessionService } from "./game-session-service.js";

export interface ApiRequest {
  method: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

interface ApiErrorBody {
  code: string;
  message: string;
}

class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function bearerToken(headers: Record<string, string | undefined> | undefined): string {
  const authorization = headers?.authorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiFault(401, "UNAUTHORIZED", "A valid session token is required");
  return match[1];
}

export function errorResult(error: unknown): ApiResult {
  if (error instanceof ApiFault) {
    return { status: error.status, body: { code: error.code, message: error.message } satisfies ApiErrorBody };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: { code: "INVALID_REQUEST", message: "The request payload is invalid" } satisfies ApiErrorBody,
    };
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (message.includes("Invalid session")) {
    return { status: 401, body: { code: "UNAUTHORIZED", message: "The session token is invalid" } satisfies ApiErrorBody };
  }
  if (message.includes("was not found")) {
    return { status: 404, body: { code: "NOT_FOUND", message } satisfies ApiErrorBody };
  }
  if (message.includes("Version conflict")) {
    return { status: 409, body: { code: "VERSION_CONFLICT", message } satisfies ApiErrorBody };
  }
  if (message.includes("Only the host")) {
    return { status: 403, body: { code: "FORBIDDEN", message } satisfies ApiErrorBody };
  }
  if (error instanceof Error) {
    return { status: 409, body: { code: "INVALID_ACTION", message } satisfies ApiErrorBody };
  }
  return { status: 500, body: { code: "INTERNAL_ERROR", message: "Unexpected server error" } satisfies ApiErrorBody };
}

export async function handleRoomApi(request: ApiRequest, service: GameSessionService): Promise<ApiResult> {
  try {
    if (request.method === "GET") {
      const code = request.query?.code?.trim().toUpperCase();
      if (!code || code.length !== 6) throw new ApiFault(400, "INVALID_REQUEST", "A six-character room code is required");
      const room = await service.getRoom(code);
      if (!room) throw new ApiFault(404, "NOT_FOUND", "Room was not found");
      return { status: 200, body: room };
    }
    if (request.method !== "POST") throw new ApiFault(405, "METHOD_NOT_ALLOWED", "Method not allowed");

    const payload = roomApiRequestSchema.parse(request.body);
    if (payload.action === "create") {
      const session = await service.createRoom({
        name: payload.name,
        host: payload.host,
        settings: payload.settings,
        ...(payload.gameKey ? { gameKey: payload.gameKey } : {}),
      });
      return { status: 201, body: session };
    }
    if (payload.action === "join") {
      return { status: 200, body: await service.joinRoom(payload.roomCode, payload.profile) };
    }
    const token = bearerToken(request.headers);
    if (payload.action === "ready") {
      return { status: 200, body: await service.setReady(payload.roomCode, token, payload.ready) };
    }
    if (payload.action === "leave") {
      return { status: 200, body: await service.leaveRoom(payload.roomCode, token) };
    }
    return { status: 200, body: await service.startGame(payload.roomCode, token) };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleGameApi(request: ApiRequest, service: GameSessionService): Promise<ApiResult> {
  try {
    const token = bearerToken(request.headers);
    if (request.method === "GET") {
      const gameId = request.query?.id;
      if (!gameId) throw new ApiFault(400, "INVALID_REQUEST", "A game id is required");
      return { status: 200, body: await service.getGameView(gameId, token) };
    }
    if (request.method !== "POST") throw new ApiFault(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const payload = gameApiRequestSchema.parse(request.body);
    if ("action" in payload) {
      return {
        status: 200,
        body: await service.advanceExpiredGame(payload.gameId, token, payload.expectedVersion),
      };
    }
    const state = await service.executeCommand(payload.gameId, token, payload.command, payload.expectedVersion);
    return { status: 200, body: state };
  } catch (error) {
    return errorResult(error);
  }
}
