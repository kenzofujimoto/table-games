import { z } from "zod";

import type { GameCommand, GameState } from "../game/application/game-engine.js";
import { AUREN_GAME_ID } from "../games/game-registry.js";

import type { ChatMessage } from "./protocol.js";

export const playerColors = ["ember", "tide", "moss", "amethyst"] as const;

export const playerProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(24),
  color: z.enum(playerColors),
  avatar: z.string().min(1).max(32),
  crest: z.string().min(1).max(32),
});

export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export const roomSettingsSchema = z.object({
  visibility: z.enum(["public", "private"]),
  maxPlayers: z.number().int().min(2).nullable(),
  targetScore: z.number().int().min(5).max(20),
  turnSeconds: z.number().int().min(30).max(600),
  mapShape: z.enum(["classic", "archipelago", "wide"]),
  terrainDistribution: z.enum(["classic", "random"]),
  numberDistribution: z.enum(["classic", "random"]),
  ports: z.enum(["fixed", "random"]),
  previewMap: z.boolean(),
  allowSpectators: z.boolean(),
  chatEnabled: z.boolean(),
  confirmEndTurn: z.boolean(),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const roomPlayerSchema = z.object({
  profile: playerProfileSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  seat: z.number().int().nonnegative(),
  joinedAt: z.string(),
});

export type RoomPlayer = z.infer<typeof roomPlayerSchema>;

export const gameRoomSchema = z.object({
  id: z.string().min(1),
  gameKey: z.string().min(1).max(64).default(AUREN_GAME_ID),
  code: z.string().length(6),
  name: z.string().min(2).max(48),
  hostId: z.string().min(1),
  status: z.enum(["lobby", "playing", "finished"]),
  settings: roomSettingsSchema,
  players: z.array(roomPlayerSchema),
  createdAt: z.string(),
  gameId: z.string().nullable(),
});

export type GameRoom = z.infer<typeof gameRoomSchema>;

export type RepositoryEvent =
  | { kind: "room"; roomCode: string }
  | { kind: "game"; roomCode: string }
  | { kind: "chat"; roomCode: string; message: ChatMessage }
  | { kind: "connection"; roomCode: string; connected: boolean };

export interface RepositorySession {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface CreateRoomInput {
  name: string;
  host: PlayerProfile;
  settings: RoomSettings;
  gameKey?: string;
}

export interface GameRepository {
  readonly kind: "local" | "online";
  createRoom(input: CreateRoomInput): Promise<GameRoom>;
  getRoom(code: string): Promise<GameRoom | null>;
  joinRoom(code: string, profile: PlayerProfile): Promise<GameRoom>;
  setReady(code: string, playerId: string, ready: boolean): Promise<GameRoom>;
  startGame(code: string, actorId: string): Promise<GameRoom>;
  saveGame(state: GameState): Promise<void>;
  loadGame(gameId: string): Promise<GameState | null>;
  executeCommand(state: GameState, command: GameCommand): Promise<GameState>;
  sendChat(roomCode: string, author: PlayerProfile, message: string): Promise<void>;
  subscribe(roomCode: string, listener: (event: RepositoryEvent) => void): () => void;
}
