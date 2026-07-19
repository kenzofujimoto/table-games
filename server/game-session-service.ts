import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  applyGameCommand,
  createGame,
  type GameCommand,
  type GameState,
} from "../src/game/application/game-engine.js";
import { emptyResources, type Player } from "../src/game/domain/types.js";
import {
  AUREN_GAME_ID,
  getGameManifest,
  validatePlayerCount,
  validateRoomCapacity,
} from "../src/games/game-registry.js";
import {
  clientGameCommandSchema,
  type ChatMessage,
  type ClientGameCommand,
} from "../src/multiplayer/protocol.js";
import {
  gameRoomSchema,
  playerProfileSchema,
  roomSettingsSchema,
  type CreateRoomInput,
  type GameRoom,
  type PlayerPresence,
  type PlayerProfile,
} from "../src/multiplayer/types.js";
import type { OnlineStore, StoredRoomRecord } from "./online-store.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_UPDATE_ATTEMPTS = 5;
const PRESENCE_LEASE_MS = 45_000;
const RECONNECT_GRACE_MS = 60_000;

interface ServiceDependencies {
  now?: () => Date;
  randomCode?: () => string;
  randomId?: () => string;
  issueToken?: () => string;
}

export interface RoomSession {
  room: GameRoom;
  sessionToken: string;
}

function defaultCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!).join("");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function playerFromProfile(profile: PlayerProfile): Player {
  return {
    id: profile.id,
    name: profile.name,
    color: profile.color,
    avatar: profile.avatar,
    connected: true,
    connectionStatus: "online",
    control: "human",
    lastSeenAt: null,
    ready: true,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  };
}

function totalResourceCards(player: Player): number {
  return Object.values(player.resources).reduce((total, count) => total + count, 0);
}

export function sanitizeGameState(state: GameState, viewerId: string): GameState {
  const view = structuredClone(state);
  view.developmentDeck = Array.from({ length: state.developmentDeck.length }, () => "knight");
  view.players = view.players.map((player) => {
    const source = state.players.find((candidate) => candidate.id === player.id)!;
    const resourceCardCount = totalResourceCards(source);
    const developmentCardCount = source.developmentCards.length;
    if (player.id === viewerId) return { ...player, resourceCardCount, developmentCardCount };
    return {
      ...player,
      resources: emptyResources(),
      resourceCardCount,
      developmentCards: player.developmentCards.filter((card) => card.revealed),
      developmentCardCount,
    };
  });
  return view;
}

export class GameSessionService {
  private readonly now: () => Date;
  private readonly randomCode: () => string;
  private readonly randomId: () => string;
  private readonly issueToken: () => string;

  constructor(private readonly store: OnlineStore, dependencies: ServiceDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.randomCode = dependencies.randomCode ?? defaultCode;
    this.randomId = dependencies.randomId ?? randomUUID;
    this.issueToken = dependencies.issueToken ?? (() => randomBytes(32).toString("base64url"));
  }

  private async playerPresence(room: GameRoom): Promise<PlayerPresence[]> {
    const leases = await this.store.getPresence(room.code);
    const now = this.now().getTime();
    return room.players.map((player) => {
      const playerLeases = leases.filter((lease) => lease.playerId === player.profile.id);
      const latest = playerLeases.reduce<(typeof playerLeases)[number] | null>((current, lease) => (
        current === null || Date.parse(lease.lastSeenAt) > Date.parse(current.lastSeenAt) ? lease : current
      ), null);
      const online = playerLeases.some((lease) => Date.parse(lease.expiresAt) > now);
      const lastSeenAt = latest?.lastSeenAt ?? player.lastSeenAt ?? null;
      const withinGrace = lastSeenAt !== null && now - Date.parse(lastSeenAt) <= RECONNECT_GRACE_MS;
      const status = player.control === "autopilot"
        ? "autopilot" as const
        : online
          ? "online" as const
          : withinGrace
            ? "reconnecting" as const
            : "offline" as const;
      return { playerId: player.profile.id, status, lastSeenAt };
    });
  }

  private async hydrateRoomPresence(room: GameRoom): Promise<GameRoom> {
    const presence = await this.playerPresence(room);
    return {
      ...room,
      players: room.players.map((player) => {
        const current = presence.find((candidate) => candidate.playerId === player.profile.id)!;
        return {
          ...player,
          connected: current.status === "online",
          connectionStatus: current.status,
          lastSeenAt: current.lastSeenAt,
          control: player.control ?? "human",
        };
      }),
    };
  }

  private async publishPresence(room: GameRoom): Promise<PlayerPresence[]> {
    const players = await this.playerPresence(room);
    await this.store.publish(room.code, { type: "presence", roomCode: room.code, players });
    return players;
  }

  private async setGamePlayerControl(room: GameRoom, playerId: string, control: "human" | "autopilot"): Promise<void> {
    if (!room.gameId) return;
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      const state = await this.store.getGame(room.gameId);
      if (!state) return;
      const player = state.players.find((candidate) => candidate.id === playerId);
      if (!player || (player.control ?? "human") === control) return;
      const next: GameState = {
        ...state,
        version: state.version + 1,
        players: state.players.map((candidate) => candidate.id === playerId
          ? {
              ...candidate,
              control,
              connected: control === "human",
              connectionStatus: control === "human" ? "online" : "autopilot",
            }
          : candidate),
      };
      if (await this.store.compareAndSetGame(state.id, state.version, next)) {
        await this.store.publish(room.code, {
          type: "gameUpdated",
          roomCode: room.code,
          gameId: state.id,
          version: next.version,
        });
        return;
      }
    }
    throw new Error("Game update conflict: try again");
  }

  async createRoom(input: CreateRoomInput): Promise<RoomSession> {
    const host = playerProfileSchema.parse(input.host);
    const settings = roomSettingsSchema.parse(input.settings);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 48) throw new Error("Room name must have between 2 and 48 characters");
    const gameKey = input.gameKey ?? AUREN_GAME_ID;
    const manifest = getGameManifest(gameKey);
    if (!validateRoomCapacity(manifest, settings.maxPlayers)) throw new Error("Invalid room capacity for this game");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = normalizeCode(this.randomCode());
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("Generated room code is invalid");
      const token = this.issueToken();
      const now = this.now().toISOString();
      const room = gameRoomSchema.parse({
        id: this.randomId(),
        gameKey,
        code,
        name,
        hostId: host.id,
        status: "lobby",
        settings,
        players: [{
          profile: host,
          ready: false,
          connected: false,
          connectionStatus: "reconnecting",
          control: "human",
          lastSeenAt: null,
          seat: 0,
          joinedAt: now,
        }],
        createdAt: now,
        gameId: null,
      });
      const created = await this.store.createRoom({
        revision: 0,
        room,
        sessionHashes: { [host.id]: hashToken(token) },
      });
      if (created) {
        await this.store.publish(code, { type: "roomUpdated", roomCode: code });
        return { room, sessionToken: token };
      }
    }
    throw new Error("Could not generate a unique room code");
  }

  async getRoom(code: string): Promise<GameRoom | null> {
    const normalized = normalizeCode(code);
    const record = await this.store.getRoom(normalized);
    if (!record) return null;
    let room = record.room;
    if (room.status === "lobby") {
      const presence = await this.playerPresence(room);
      const host = presence.find((player) => player.playerId === room.hostId);
      const successor = room.players.find((player) => (
        player.profile.id !== room.hostId
        && presence.find((candidate) => candidate.playerId === player.profile.id)?.status === "online"
      ));
      if (host?.status === "offline" && successor) {
        const changed = await this.updateRoom(normalized, (current) => ({
          ...current,
          revision: current.revision + 1,
          room: { ...current.room, hostId: successor.profile.id },
        }));
        room = changed.room;
        await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
      }
    }
    return this.hydrateRoomPresence(room);
  }

  async joinRoom(code: string, rawProfile: PlayerProfile): Promise<RoomSession> {
    const normalized = normalizeCode(code);
    const profile = playerProfileSchema.parse(rawProfile);
    const token = this.issueToken();
    const tokenHash = hashToken(token);
    const record = await this.updateRoom(normalized, (current) => {
      const room = current.room;
      if (room.status !== "lobby") throw new Error("The game has already started");
      if (room.players.some((player) => player.profile.id === profile.id)) throw new Error("Player is already in the room");
      if (room.settings.maxPlayers !== null && room.players.length >= room.settings.maxPlayers) throw new Error("Room is full");
      if (room.players.some((player) => player.profile.color === profile.color)) throw new Error("Color is already in use");
      return {
        ...current,
        revision: current.revision + 1,
        room: {
          ...room,
          players: [...room.players, {
            profile,
            ready: false,
            connected: false,
            connectionStatus: "reconnecting",
            control: "human",
            lastSeenAt: null,
            seat: room.players.length,
            joinedAt: this.now().toISOString(),
          }],
        },
        sessionHashes: { ...current.sessionHashes, [profile.id]: tokenHash },
      };
    });
    await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
    return { room: record.room, sessionToken: token };
  }

  async connectPresence(code: string, token: string, connectionId: string): Promise<PlayerPresence[]> {
    const normalized = normalizeCode(code);
    const authenticated = await this.authenticate(normalized, token);
    let room = authenticated.record.room;
    const player = room.players.find((candidate) => candidate.profile.id === authenticated.playerId)!;
    if (player.control === "autopilot") {
      const changed = await this.updateRoom(normalized, (current) => ({
        ...current,
        revision: current.revision + 1,
        room: {
          ...current.room,
          players: current.room.players.map((candidate) => candidate.profile.id === authenticated.playerId
            ? { ...candidate, control: "human", connectionStatus: "online" }
            : candidate),
        },
      }));
      room = changed.room;
      await this.setGamePlayerControl(room, authenticated.playerId, "human");
      await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
    }
    const lastSeenAt = this.now().toISOString();
    await this.store.touchPresence({
      roomCode: normalized,
      playerId: authenticated.playerId,
      connectionId,
      lastSeenAt,
      expiresAt: new Date(this.now().getTime() + PRESENCE_LEASE_MS).toISOString(),
    });
    return this.publishPresence(room);
  }

  async heartbeatPresence(code: string, playerId: string, connectionId: string): Promise<PlayerPresence[]> {
    const normalized = normalizeCode(code);
    const record = await this.store.getRoom(normalized);
    if (!record?.room.players.some((player) => player.profile.id === playerId)) {
      throw new Error("Player is not in the room");
    }
    const lastSeenAt = this.now().toISOString();
    await this.store.touchPresence({
      roomCode: normalized,
      playerId,
      connectionId,
      lastSeenAt,
      expiresAt: new Date(this.now().getTime() + PRESENCE_LEASE_MS).toISOString(),
    });
    return this.publishPresence(record.room);
  }

  async leaveRoom(code: string, token: string): Promise<GameRoom> {
    const normalized = normalizeCode(code);
    const authenticated = await this.authenticate(normalized, token);
    if (authenticated.record.room.status === "lobby") {
      const changed = await this.updateRoom(normalized, (current) => {
        const players = current.room.players.filter((player) => player.profile.id !== authenticated.playerId);
        const { [authenticated.playerId]: _removed, ...sessionHashes } = current.sessionHashes;
        void _removed;
        return {
          ...current,
          revision: current.revision + 1,
          sessionHashes,
          room: {
            ...current.room,
            hostId: current.room.hostId === authenticated.playerId
              ? players[0]?.profile.id ?? current.room.hostId
              : current.room.hostId,
            players: players.map((player, seat) => ({ ...player, seat })),
          },
        };
      });
      await this.store.removePlayerPresence(normalized, authenticated.playerId);
      await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
      await this.publishPresence(changed.room);
      return this.hydrateRoomPresence(changed.room);
    }

    const changed = await this.updateRoom(normalized, (current) => ({
      ...current,
      revision: current.revision + 1,
      room: {
        ...current.room,
        players: current.room.players.map((player) => player.profile.id === authenticated.playerId
          ? { ...player, connected: false, connectionStatus: "autopilot", control: "autopilot" }
          : player),
      },
    }));
    await this.store.removePlayerPresence(normalized, authenticated.playerId);
    await this.setGamePlayerControl(changed.room, authenticated.playerId, "autopilot");
    await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
    await this.publishPresence(changed.room);
    return this.hydrateRoomPresence(changed.room);
  }

  async authenticate(code: string, token: string): Promise<{ playerId: string; record: StoredRoomRecord }> {
    const normalized = normalizeCode(code);
    const record = await this.store.getRoom(normalized);
    if (!record) throw new Error("Room was not found");
    const presentedHash = hashToken(token);
    const playerId = Object.entries(record.sessionHashes)
      .find(([, expectedHash]) => tokensMatch(presentedHash, expectedHash))?.[0];
    if (!playerId) throw new Error("Invalid session token");
    return { playerId, record };
  }

  async setReady(code: string, token: string, ready: boolean): Promise<GameRoom> {
    const normalized = normalizeCode(code);
    const authenticated = await this.authenticate(normalized, token);
    const record = await this.updateRoom(normalized, (current) => ({
      ...current,
      revision: current.revision + 1,
      room: {
        ...current.room,
        players: current.room.players.map((player) => player.profile.id === authenticated.playerId
          ? { ...player, ready }
          : player),
      },
    }));
    await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
    return record.room;
  }

  async startGame(code: string, token: string): Promise<GameRoom> {
    const normalized = normalizeCode(code);
    const authenticated = await this.authenticate(normalized, token);
    const gameId = this.randomId();
    const current = authenticated.record;
    if (current.room.hostId !== authenticated.playerId) throw new Error("Only the host can start the game");
    if (current.room.status !== "lobby") throw new Error("The game has already started");
    const manifest = getGameManifest(current.room.gameKey);
    if (current.room.settings.maxPlayers !== null && current.room.players.length !== current.room.settings.maxPlayers) throw new Error("The room needs every seat filled");
    if (!validatePlayerCount(manifest, current.room.players.length)) throw new Error("The room does not have a valid player count");
    if (!current.room.players.every((player) => player.ready)) throw new Error("Every player must be ready");

    if (current.room.gameKey !== AUREN_GAME_ID) throw new Error("The selected game engine is not available");
    const state = createGame({
      id: gameId,
      roomCode: normalized,
      seed: `${normalized}-${this.randomId()}`,
      players: current.room.players.map((player) => playerFromProfile(player.profile)),
      targetScore: current.room.settings.targetScore,
      turnSeconds: current.room.settings.turnSeconds,
    });
    state.config.confirmEndTurn = current.room.settings.confirmEndTurn;
    state.config.chatEnabled = current.room.settings.chatEnabled;
    if (!await this.store.createGame(state)) throw new Error("Game state already exists");
    const record: StoredRoomRecord = {
      ...current,
      revision: current.revision + 1,
      room: { ...current.room, status: "playing", gameId },
    };
    if (!await this.store.compareAndSetRoom(normalized, current.revision, record)) {
      throw new Error("Room update conflict: try again");
    }
    await this.store.publish(normalized, { type: "roomUpdated", roomCode: normalized });
    await this.store.publish(normalized, { type: "gameUpdated", roomCode: normalized, gameId, version: state.version });
    return record.room;
  }

  async getGameView(gameId: string, token: string): Promise<GameState> {
    const state = await this.store.getGame(gameId);
    if (!state) throw new Error("Game was not found");
    const { playerId, record } = await this.authenticate(state.roomCode, token);
    const presence = await this.playerPresence(record.room);
    const hydrated: GameState = {
      ...state,
      players: state.players.map((player) => {
        const current = presence.find((candidate) => candidate.playerId === player.id);
        const roomPlayer = record.room.players.find((candidate) => candidate.profile.id === player.id);
        return {
          ...player,
          connected: current?.status === "online",
          connectionStatus: current?.status ?? "offline",
          lastSeenAt: current?.lastSeenAt ?? null,
          control: roomPlayer?.control ?? player.control ?? "human",
        };
      }),
    };
    return sanitizeGameState(hydrated, playerId);
  }

  async executeCommand(
    gameId: string,
    token: string,
    rawCommand: ClientGameCommand,
    expectedVersion: number,
  ): Promise<GameState> {
    const command = clientGameCommandSchema.parse(rawCommand);
    const state = await this.store.getGame(gameId);
    if (!state) throw new Error("Game was not found");
    const { playerId } = await this.authenticate(state.roomCode, token);
    if (state.version !== expectedVersion) throw new Error("Version conflict: reload the latest game state");
    const authoritativeCommand = { ...command, actorId: playerId } as GameCommand;
    const next = applyGameCommand(state, authoritativeCommand);
    if (!await this.store.compareAndSetGame(gameId, expectedVersion, next)) {
      throw new Error("Version conflict: reload the latest game state");
    }
    await this.store.publish(state.roomCode, {
      type: "gameUpdated",
      roomCode: state.roomCode,
      gameId,
      version: next.version,
    });
    return sanitizeGameState(next, playerId);
  }

  async sendChat(code: string, token: string, clientMessageId: string, rawMessage: string): Promise<ChatMessage> {
    const normalized = normalizeCode(code);
    const { playerId, record } = await this.authenticate(normalized, token);
    if (!record.room.settings.chatEnabled) throw new Error("Chat is disabled for this room");
    const message = rawMessage.trim();
    if (message.length < 1 || message.length > 280) throw new Error("Chat messages must have between 1 and 280 characters");
    const player = record.room.players.find((candidate) => candidate.profile.id === playerId)!;
    const chatMessage: ChatMessage = {
      id: this.randomId(),
      clientMessageId,
      roomCode: normalized,
      playerId,
      playerName: player.profile.name,
      message,
      createdAt: this.now().toISOString(),
    };
    await this.store.appendChat(chatMessage);
    await this.store.publish(normalized, { type: "chat", payload: chatMessage });
    return chatMessage;
  }

  async getChat(code: string, token: string, limit = 50): Promise<ChatMessage[]> {
    const normalized = normalizeCode(code);
    await this.authenticate(normalized, token);
    return this.store.getChat(normalized, Math.min(Math.max(limit, 1), 100));
  }

  private async updateRoom(
    code: string,
    update: (record: StoredRoomRecord) => StoredRoomRecord,
  ): Promise<StoredRoomRecord> {
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      const current = await this.store.getRoom(code);
      if (!current) throw new Error("Room was not found");
      const next = update(current);
      if (await this.store.compareAndSetRoom(code, current.revision, next)) return next;
    }
    throw new Error("Room update conflict: try again");
  }
}
