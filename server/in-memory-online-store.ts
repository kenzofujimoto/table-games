import type { GameState } from "../src/game/application/game-engine.js";
import type { ChatMessage, ServerRealtimeMessage } from "../src/multiplayer/protocol.js";
import type { OnlineStore, PresenceLease, StoredRoomRecord } from "./online-store.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryOnlineStore implements OnlineStore {
  private readonly rooms = new Map<string, StoredRoomRecord>();
  private readonly games = new Map<string, GameState>();
  private readonly chat = new Map<string, ChatMessage[]>();
  private readonly presence = new Map<string, Map<string, PresenceLease>>();
  private readonly listeners = new Map<string, Set<(event: ServerRealtimeMessage) => void>>();

  async getRoom(code: string): Promise<StoredRoomRecord | null> {
    const record = this.rooms.get(code.toUpperCase());
    return record ? clone(record) : null;
  }

  async createRoom(record: StoredRoomRecord): Promise<boolean> {
    if (this.rooms.has(record.room.code)) return false;
    this.rooms.set(record.room.code, clone(record));
    return true;
  }

  async compareAndSetRoom(code: string, expectedRevision: number, record: StoredRoomRecord): Promise<boolean> {
    const current = this.rooms.get(code.toUpperCase());
    if (!current || current.revision !== expectedRevision || record.revision !== expectedRevision + 1) return false;
    this.rooms.set(code.toUpperCase(), clone(record));
    return true;
  }

  async getGame(gameId: string): Promise<GameState | null> {
    const state = this.games.get(gameId);
    return state ? clone(state) : null;
  }

  async createGame(state: GameState): Promise<boolean> {
    if (this.games.has(state.id)) return false;
    this.games.set(state.id, clone(state));
    return true;
  }

  async compareAndSetGame(gameId: string, expectedVersion: number, state: GameState): Promise<boolean> {
    const current = this.games.get(gameId);
    if (!current || current.version !== expectedVersion || state.version !== expectedVersion + 1) return false;
    this.games.set(gameId, clone(state));
    return true;
  }

  async touchPresence(lease: PresenceLease): Promise<void> {
    const code = lease.roomCode.toUpperCase();
    const connections = this.presence.get(code) ?? new Map<string, PresenceLease>();
    connections.set(lease.connectionId, clone({ ...lease, roomCode: code }));
    this.presence.set(code, connections);
  }

  async getPresence(roomCode: string): Promise<PresenceLease[]> {
    return clone([...this.presence.get(roomCode.toUpperCase())?.values() ?? []]);
  }

  async removePlayerPresence(roomCode: string, playerId: string): Promise<void> {
    const code = roomCode.toUpperCase();
    const connections = this.presence.get(code);
    if (!connections) return;
    for (const [connectionId, lease] of connections) {
      if (lease.playerId === playerId) connections.delete(connectionId);
    }
    if (connections.size === 0) this.presence.delete(code);
  }

  async appendChat(message: ChatMessage): Promise<void> {
    const messages = this.chat.get(message.roomCode) ?? [];
    this.chat.set(message.roomCode, [...messages.slice(-99), clone(message)]);
  }

  async getChat(roomCode: string, limit: number): Promise<ChatMessage[]> {
    return clone((this.chat.get(roomCode.toUpperCase()) ?? []).slice(-limit));
  }

  async publish(channel: string, event: ServerRealtimeMessage): Promise<void> {
    this.listeners.get(channel)?.forEach((listener) => listener(clone(event)));
  }

  async subscribe(channel: string, listener: (event: ServerRealtimeMessage) => void): Promise<() => Promise<void>> {
    const listeners = this.listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
    return async () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(channel);
    };
  }
}
