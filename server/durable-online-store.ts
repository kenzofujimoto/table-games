import type { GameState } from "../src/game/application/game-engine";
import type { ChatMessage, ServerRealtimeMessage } from "../src/multiplayer/protocol";
import type { OnlineStore, StoredRoomRecord } from "./online-store";

export interface SnapshotArchive {
  writeRoom(record: StoredRoomRecord): Promise<void>;
  loadLatestRoom(code: string): Promise<StoredRoomRecord | null>;
  writeGame(state: GameState): Promise<void>;
  loadLatestGame(gameId: string): Promise<GameState | null>;
}

export class DurableOnlineStore implements OnlineStore {
  constructor(
    private readonly cache: OnlineStore,
    private readonly archive: SnapshotArchive,
  ) {}

  async getRoom(code: string): Promise<StoredRoomRecord | null> {
    const cached = await this.cache.getRoom(code);
    if (cached) return cached;
    const recovered = await this.archive.loadLatestRoom(code);
    if (!recovered) return null;
    await this.cache.createRoom(recovered);
    return await this.cache.getRoom(code) ?? recovered;
  }

  async createRoom(record: StoredRoomRecord): Promise<boolean> {
    const created = await this.cache.createRoom(record);
    if (created) await this.archive.writeRoom(record);
    return created;
  }

  async compareAndSetRoom(code: string, expectedRevision: number, record: StoredRoomRecord): Promise<boolean> {
    const changed = await this.cache.compareAndSetRoom(code, expectedRevision, record);
    if (changed) await this.archive.writeRoom(record);
    return changed;
  }

  async getGame(gameId: string): Promise<GameState | null> {
    const cached = await this.cache.getGame(gameId);
    if (cached) return cached;
    const recovered = await this.archive.loadLatestGame(gameId);
    if (!recovered) return null;
    await this.cache.createGame(recovered);
    return await this.cache.getGame(gameId) ?? recovered;
  }

  async createGame(state: GameState): Promise<boolean> {
    const created = await this.cache.createGame(state);
    if (created) await this.archive.writeGame(state);
    return created;
  }

  async compareAndSetGame(gameId: string, expectedVersion: number, state: GameState): Promise<boolean> {
    const changed = await this.cache.compareAndSetGame(gameId, expectedVersion, state);
    if (changed) await this.archive.writeGame(state);
    return changed;
  }

  async appendChat(message: ChatMessage): Promise<void> {
    await this.cache.appendChat(message);
  }

  async getChat(roomCode: string, limit: number): Promise<ChatMessage[]> {
    return this.cache.getChat(roomCode, limit);
  }

  async publish(channel: string, event: ServerRealtimeMessage): Promise<void> {
    await this.cache.publish(channel, event);
  }

  async subscribe(channel: string, listener: (event: ServerRealtimeMessage) => void): Promise<() => Promise<void>> {
    return this.cache.subscribe(channel, listener);
  }
}
