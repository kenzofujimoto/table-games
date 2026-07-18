import { applyGameCommand, type GameCommand, type GameState } from "@/game/application/game-engine";

import {
  gameRoomSchema,
  playerProfileSchema,
  roomSettingsSchema,
  type CreateRoomInput,
  type GameRepository,
  type GameRoom,
  type PlayerProfile,
  type RepositoryEvent,
} from "./types";

const ROOMS_KEY = "auren:rooms:v1";
const GAMES_KEY = "auren:games:v1";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface RepositoryOptions {
  storage: Storage;
  random?: () => number;
  channelFactory?: (name: string) => BroadcastChannel;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function safeParseRecord(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export class LocalGameRepository implements GameRepository {
  readonly kind = "local" as const;
  private readonly storage: Storage;
  private readonly random: () => number;
  private readonly channel: BroadcastChannel | null;
  private readonly listeners = new Map<string, Set<(event: RepositoryEvent) => void>>();

  constructor(options: RepositoryOptions) {
    this.storage = options.storage;
    this.random = options.random ?? Math.random;
    const createChannel = options.channelFactory ?? (typeof BroadcastChannel === "undefined"
      ? null
      : (name: string) => new BroadcastChannel(name));
    this.channel = createChannel ? createChannel("auren-realtime") : null;
    if (this.channel) {
      this.channel.onmessage = (message: MessageEvent<unknown>) => {
        if (this.isRepositoryEvent(message.data)) this.notifyLocal(message.data);
      };
    }
  }

  private isRepositoryEvent(value: unknown): value is RepositoryEvent {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (candidate.kind === "room" || candidate.kind === "game") && typeof candidate.roomCode === "string";
  }

  private rooms(): Record<string, GameRoom> {
    const stored = safeParseRecord(this.storage.getItem(ROOMS_KEY));
    return Object.entries(stored).reduce<Record<string, GameRoom>>((rooms, [code, value]) => {
      const parsed = gameRoomSchema.safeParse(value);
      if (parsed.success) rooms[code] = parsed.data;
      return rooms;
    }, {});
  }

  private persistRooms(rooms: Record<string, GameRoom>): void {
    this.storage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  }

  private emit(event: RepositoryEvent): void {
    this.notifyLocal(event);
    this.channel?.postMessage(event);
  }

  private notifyLocal(event: RepositoryEvent): void {
    this.listeners.get(event.roomCode)?.forEach((listener) => listener(event));
  }

  private generateCode(existing: Record<string, GameRoom>): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = Array.from({ length: 6 }, () => {
        const index = Math.min(CODE_ALPHABET.length - 1, Math.floor(this.random() * CODE_ALPHABET.length));
        return CODE_ALPHABET[index]!;
      }).join("");
      if (!existing[code]) return code;
    }
    throw new Error("Could not generate a unique room code");
  }

  async createRoom(input: CreateRoomInput): Promise<GameRoom> {
    const profile = playerProfileSchema.parse(input.host);
    const settings = roomSettingsSchema.parse(input.settings);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 48) throw new Error("Room name must have between 2 and 48 characters");
    const rooms = this.rooms();
    const code = this.generateCode(rooms);
    const now = new Date().toISOString();
    const room: GameRoom = {
      id: crypto.randomUUID(),
      code,
      name,
      hostId: profile.id,
      status: "lobby",
      settings,
      players: [{ profile, ready: false, connected: true, seat: 0, joinedAt: now }],
      createdAt: now,
      gameId: null,
    };
    rooms[code] = room;
    this.persistRooms(rooms);
    this.emit({ kind: "room", roomCode: code });
    return room;
  }

  async getRoom(code: string): Promise<GameRoom | null> {
    return this.rooms()[normalizeCode(code)] ?? null;
  }

  async joinRoom(code: string, rawProfile: PlayerProfile): Promise<GameRoom> {
    const profile = playerProfileSchema.parse(rawProfile);
    const normalized = normalizeCode(code);
    const rooms = this.rooms();
    const room = rooms[normalized];
    if (!room) throw new Error("Room was not found");
    if (room.status !== "lobby") throw new Error("The game has already started");
    if (room.players.some((player) => player.profile.id === profile.id)) throw new Error("Player is already in the room");
    if (room.players.length >= room.settings.maxPlayers) throw new Error("Room is full");
    if (room.players.some((player) => player.profile.color === profile.color)) throw new Error("Color is already in use");

    const next: GameRoom = {
      ...room,
      players: [...room.players, {
        profile,
        ready: false,
        connected: true,
        seat: room.players.length,
        joinedAt: new Date().toISOString(),
      }],
    };
    rooms[normalized] = next;
    this.persistRooms(rooms);
    this.emit({ kind: "room", roomCode: normalized });
    return next;
  }

  async setReady(code: string, playerId: string, ready: boolean): Promise<GameRoom> {
    const normalized = normalizeCode(code);
    const rooms = this.rooms();
    const room = rooms[normalized];
    if (!room) throw new Error("Room was not found");
    if (!room.players.some((player) => player.profile.id === playerId)) throw new Error("Player is not in the room");
    const next = {
      ...room,
      players: room.players.map((player) => player.profile.id === playerId ? { ...player, ready } : player),
    };
    rooms[normalized] = next;
    this.persistRooms(rooms);
    this.emit({ kind: "room", roomCode: normalized });
    return next;
  }

  async startGame(code: string, actorId: string): Promise<GameRoom> {
    const normalized = normalizeCode(code);
    const rooms = this.rooms();
    const room = rooms[normalized];
    if (!room) throw new Error("Room was not found");
    if (room.hostId !== actorId) throw new Error("Only the host can start the game");
    if (room.players.length < 3 || room.players.length !== room.settings.maxPlayers) throw new Error("The room needs every seat filled");
    if (!room.players.every((player) => player.ready)) throw new Error("Every player must be ready");
    const next: GameRoom = { ...room, status: "playing", gameId: crypto.randomUUID() };
    rooms[normalized] = next;
    this.persistRooms(rooms);
    this.emit({ kind: "room", roomCode: normalized });
    return next;
  }

  async saveGame(state: GameState): Promise<void> {
    const games = safeParseRecord(this.storage.getItem(GAMES_KEY));
    games[state.id] = state;
    this.storage.setItem(GAMES_KEY, JSON.stringify(games));
    this.emit({ kind: "game", roomCode: state.roomCode });
  }

  async loadGame(gameId: string): Promise<GameState | null> {
    const value = safeParseRecord(this.storage.getItem(GAMES_KEY))[gameId];
    return value && typeof value === "object" ? value as GameState : null;
  }

  async executeCommand(state: GameState, command: GameCommand): Promise<GameState> {
    const next = applyGameCommand(state, command);
    await this.saveGame(next);
    return next;
  }

  subscribe(roomCode: string, listener: (event: RepositoryEvent) => void): () => void {
    const normalized = normalizeCode(roomCode);
    const listeners = this.listeners.get(normalized) ?? new Set();
    listeners.add(listener);
    this.listeners.set(normalized, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(normalized);
    };
  }
}

export function createBrowserLocalRepository(): LocalGameRepository {
  return new LocalGameRepository({ storage: window.localStorage });
}
