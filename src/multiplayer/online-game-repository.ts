import type { GameCommand, GameState } from "@/game/application/game-engine";
import { z } from "zod";

import { RealtimeClient } from "./realtime-client";
import {
  gameRoomSchema,
  type CreateRoomInput,
  type GameRepository,
  type GameRoom,
  type PlayerProfile,
  type RepositoryEvent,
  type RepositorySession,
} from "./types";

const SESSION_KEY = "auren:online-sessions:v1";

const roomSessionResponseSchema = z.object({
  room: gameRoomSchema,
  sessionToken: z.string().min(32).max(256),
}).strict();

const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).loose();

interface StoredSession {
  playerId: string;
  sessionToken: string;
}

interface OnlineRepositoryOptions {
  storage: Storage;
  fetcher?: typeof fetch;
  baseUrl?: string;
  realtime?: RealtimeClient;
}

export class RepositoryApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function readSessions(storage: Storage): Record<string, StoredSession> {
  try {
    const value: unknown = JSON.parse(storage.getItem(SESSION_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, StoredSession>>((sessions, [code, session]) => {
      if (
        typeof session === "object"
        && session !== null
        && "playerId" in session
        && "sessionToken" in session
        && typeof session.playerId === "string"
        && typeof session.sessionToken === "string"
      ) {
        sessions[code] = { playerId: session.playerId, sessionToken: session.sessionToken };
      }
      return sessions;
    }, {});
  } catch {
    return {};
  }
}

function realtimeUrl(): string {
  const configured = import.meta.env.VITE_REALTIME_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws`;
}

function parseGameState(value: unknown): GameState {
  if (
    typeof value !== "object"
    || value === null
    || !("id" in value)
    || !("roomCode" in value)
    || !("version" in value)
    || !("players" in value)
    || !("board" in value)
    || typeof value.id !== "string"
    || typeof value.roomCode !== "string"
    || typeof value.version !== "number"
    || !Array.isArray(value.players)
    || typeof value.board !== "object"
    || value.board === null
  ) {
    throw new Error("The server returned an invalid game state");
  }
  return value as GameState;
}

export class OnlineGameRepository implements GameRepository {
  readonly kind = "online" as const;
  private readonly storage: Storage;
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly realtime: RealtimeClient;

  constructor(options: OnlineRepositoryOptions) {
    this.storage = options.storage;
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = options.baseUrl ?? "";
    this.realtime = options.realtime ?? new RealtimeClient({ url: realtimeUrl() });
  }

  getSession(code: string): RepositorySession | null {
    const roomCode = code.toUpperCase();
    const session = readSessions(this.storage)[roomCode];
    return session ? { roomCode, ...session } : null;
  }

  async createRoom(input: CreateRoomInput): Promise<GameRoom> {
    const value = await this.request("/api/rooms", {
      method: "POST",
      body: { action: "create", ...input },
    });
    const session = roomSessionResponseSchema.parse(value);
    this.saveSession(session.room.code, input.host.id, session.sessionToken);
    return session.room;
  }

  async getRoom(code: string): Promise<GameRoom | null> {
    const normalized = code.trim().toUpperCase();
    try {
      return gameRoomSchema.parse(await this.request(`/api/rooms?code=${encodeURIComponent(normalized)}`));
    } catch (error) {
      if (error instanceof RepositoryApiError && error.status === 404) return null;
      throw error;
    }
  }

  async joinRoom(code: string, profile: PlayerProfile): Promise<GameRoom> {
    const value = await this.request("/api/rooms", {
      method: "POST",
      body: { action: "join", roomCode: code, profile },
    });
    const session = roomSessionResponseSchema.parse(value);
    this.saveSession(session.room.code, profile.id, session.sessionToken);
    return session.room;
  }

  async setReady(code: string, playerId: string, ready: boolean): Promise<GameRoom> {
    const session = this.requireSession(code, playerId);
    return gameRoomSchema.parse(await this.request("/api/rooms", {
      method: "POST",
      token: session.sessionToken,
      body: { action: "ready", roomCode: code, ready },
    }));
  }

  async startGame(code: string, actorId: string): Promise<GameRoom> {
    const session = this.requireSession(code, actorId);
    const room = gameRoomSchema.parse(await this.request("/api/rooms", {
      method: "POST",
      token: session.sessionToken,
      body: { action: "start", roomCode: code },
    }));
    return room;
  }

  async saveGame(): Promise<void> {
    throw new Error("Online game state is managed by the authoritative server");
  }

  async loadGame(gameId: string): Promise<GameState | null> {
    const session = Object.entries(readSessions(this.storage)).at(-1);
    if (!session) throw new Error("No online session is available for this game");
    try {
      return parseGameState(await this.request(`/api/game?id=${encodeURIComponent(gameId)}`, {
        token: session[1].sessionToken,
      }));
    } catch (error) {
      if (error instanceof RepositoryApiError && error.status === 404) return null;
      throw error;
    }
  }

  async executeCommand(state: GameState, command: GameCommand): Promise<GameState> {
    const session = this.requireSession(state.roomCode);
    const clientCommand: Record<string, unknown> = { ...command };
    delete clientCommand.actorId;
    const value = await this.request("/api/game", {
      method: "POST",
      token: session.sessionToken,
      body: { gameId: state.id, expectedVersion: state.version, command: clientCommand },
    });
    return parseGameState(value);
  }

  async sendChat(roomCode: string, author: PlayerProfile, message: string): Promise<void> {
    const session = this.requireSession(roomCode, author.id);
    this.realtime.sendChat(roomCode.toUpperCase(), session.sessionToken, crypto.randomUUID(), message.trim());
  }

  subscribe(roomCode: string, listener: (event: RepositoryEvent) => void): () => void {
    const session = this.getSession(roomCode);
    if (!session) return () => undefined;
    const unsubscribeRealtime = this.realtime.subscribe(roomCode, session.sessionToken, (message) => {
      if (message.type === "roomUpdated") listener({ kind: "room", roomCode: message.roomCode });
      else if (message.type === "gameUpdated") listener({ kind: "game", roomCode: message.roomCode });
      else if (message.type === "chat") listener({ kind: "chat", roomCode: message.payload.roomCode, message: message.payload });
      else if (message.type === "connected") listener({ kind: "connection", roomCode: message.roomCode, connected: true });
      else if (message.type === "error") console.warn(`Realtime ${message.code}: ${message.message}`);
    });
    const poll = window.setInterval(() => listener({ kind: "room", roomCode: roomCode.toUpperCase() }), 5_000);
    return () => {
      unsubscribeRealtime();
      window.clearInterval(poll);
    };
  }

  private saveSession(code: string, playerId: string, sessionToken: string): void {
    const sessions = readSessions(this.storage);
    sessions[code.toUpperCase()] = { playerId, sessionToken };
    this.storage.setItem(SESSION_KEY, JSON.stringify(sessions));
  }

  private requireSession(code: string, playerId?: string): RepositorySession {
    const session = this.getSession(code);
    if (!session) throw new Error("No session is available for this room");
    if (playerId && session.playerId !== playerId) throw new Error("The active profile does not own this room session");
    return session;
  }

  private async request(
    path: string,
    options: { method?: "GET" | "POST"; token?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    const value: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(value);
      throw new RepositoryApiError(
        parsed.success ? parsed.data.code : "REQUEST_FAILED",
        parsed.success ? parsed.data.message : `Request failed with status ${response.status}`,
        response.status,
      );
    }
    return value;
  }
}

export function createBrowserOnlineRepository(): OnlineGameRepository {
  return new OnlineGameRepository({ storage: window.localStorage });
}
