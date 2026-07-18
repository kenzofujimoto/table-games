import type { GameState } from "../src/game/application/game-engine";
import type { ChatMessage, ServerRealtimeMessage } from "../src/multiplayer/protocol";
import type { GameRoom } from "../src/multiplayer/types";

export interface StoredRoomRecord {
  revision: number;
  room: GameRoom;
  sessionHashes: Record<string, string>;
}

export interface OnlineStore {
  getRoom(code: string): Promise<StoredRoomRecord | null>;
  createRoom(record: StoredRoomRecord): Promise<boolean>;
  compareAndSetRoom(code: string, expectedRevision: number, record: StoredRoomRecord): Promise<boolean>;
  getGame(gameId: string): Promise<GameState | null>;
  createGame(state: GameState): Promise<boolean>;
  compareAndSetGame(gameId: string, expectedVersion: number, state: GameState): Promise<boolean>;
  appendChat(message: ChatMessage): Promise<void>;
  getChat(roomCode: string, limit: number): Promise<ChatMessage[]>;
  publish(channel: string, event: ServerRealtimeMessage): Promise<void>;
  subscribe(channel: string, listener: (event: ServerRealtimeMessage) => void): Promise<() => Promise<void>>;
}
