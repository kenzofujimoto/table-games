import { createClient } from "redis";

import type { GameState } from "../src/game/application/game-engine.js";
import type { ChatMessage, ServerRealtimeMessage } from "../src/multiplayer/protocol.js";
import type { OnlineStore, PresenceLease, StoredRoomRecord } from "./online-store.js";

function createConfiguredClient(url: string) {
  return createClient({ url });
}

type RedisClient = ReturnType<typeof createConfiguredClient>;

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;
const PUBLIC_ROOMS_KEY = "auren:rooms:public";
const PUBLIC_ROOM_LIMIT = 50;

const ROOM_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if tonumber(decoded.revision) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

const GAME_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if tonumber(decoded.version) ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

function parseJson(value: string, context: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON stored for ${context}`, { cause: error });
  }
}

function roomKey(code: string): string {
  return `auren:room:${code.toUpperCase()}`;
}

function gameKey(gameId: string): string {
  return `auren:game:${gameId}`;
}

function chatKey(roomCode: string): string {
  return `auren:chat:${roomCode.toUpperCase()}`;
}

function channelKey(channel: string): string {
  return `auren:events:${channel.toUpperCase()}`;
}

function presenceKey(roomCode: string): string {
  return `auren:presence:${roomCode.toUpperCase()}`;
}

function isDiscoverable(record: StoredRoomRecord): boolean {
  const { room } = record;
  return room.settings.visibility === "public"
    && room.status === "lobby"
    && (room.settings.maxPlayers === null || room.players.length < room.settings.maxPlayers);
}

export class RedisOnlineStore implements OnlineStore {
  constructor(
    private readonly client: RedisClient,
    private readonly ttlSeconds = DEFAULT_TTL_SECONDS,
  ) {}

  async getRoom(code: string): Promise<StoredRoomRecord | null> {
    const value = await this.client.get(roomKey(code));
    return value ? parseJson(value, `room ${code}`) as StoredRoomRecord : null;
  }

  async listPublicRooms(): Promise<StoredRoomRecord[]> {
    const codes = await this.client.zRange(PUBLIC_ROOMS_KEY, 0, PUBLIC_ROOM_LIMIT - 1, { REV: true });
    if (codes.length === 0) return [];
    const values = await this.client.mGet(codes.map(roomKey));
    const staleCodes: string[] = [];
    const records = values.flatMap((value, index) => {
      if (!value) {
        staleCodes.push(codes[index]!);
        return [];
      }
      const record = parseJson(value, `room ${codes[index]}`) as StoredRoomRecord;
      if (!isDiscoverable(record)) {
        staleCodes.push(codes[index]!);
        return [];
      }
      return [record];
    });
    if (staleCodes.length > 0) await this.client.zRem(PUBLIC_ROOMS_KEY, staleCodes);
    return records;
  }

  async createRoom(record: StoredRoomRecord): Promise<boolean> {
    const result = await this.client.set(roomKey(record.room.code), JSON.stringify(record), {
      EX: this.ttlSeconds,
      NX: true,
    });
    const created = result === "OK";
    if (created && isDiscoverable(record)) {
      await this.client.zAdd(PUBLIC_ROOMS_KEY, { score: Date.parse(record.room.createdAt), value: record.room.code });
    }
    return created;
  }

  async compareAndSetRoom(code: string, expectedRevision: number, record: StoredRoomRecord): Promise<boolean> {
    const result = await this.client.eval(ROOM_CAS_SCRIPT, {
      keys: [roomKey(code)],
      arguments: [String(expectedRevision), JSON.stringify(record), String(this.ttlSeconds)],
    });
    const changed = Number(result) === 1;
    if (changed) {
      if (isDiscoverable(record)) {
        await this.client.zAdd(PUBLIC_ROOMS_KEY, { score: Date.parse(record.room.createdAt), value: record.room.code });
      } else {
        await this.client.zRem(PUBLIC_ROOMS_KEY, record.room.code);
      }
    }
    return changed;
  }

  async getGame(gameId: string): Promise<GameState | null> {
    const value = await this.client.get(gameKey(gameId));
    return value ? parseJson(value, `game ${gameId}`) as GameState : null;
  }

  async createGame(state: GameState): Promise<boolean> {
    const result = await this.client.set(gameKey(state.id), JSON.stringify(state), {
      EX: this.ttlSeconds,
      NX: true,
    });
    return result === "OK";
  }

  async compareAndSetGame(gameId: string, expectedVersion: number, state: GameState): Promise<boolean> {
    const result = await this.client.eval(GAME_CAS_SCRIPT, {
      keys: [gameKey(gameId)],
      arguments: [String(expectedVersion), JSON.stringify(state), String(this.ttlSeconds)],
    });
    return Number(result) === 1;
  }

  async touchPresence(lease: PresenceLease): Promise<void> {
    const key = presenceKey(lease.roomCode);
    await this.client.multi()
      .hSet(key, lease.connectionId, JSON.stringify({ ...lease, roomCode: lease.roomCode.toUpperCase() }))
      .expire(key, this.ttlSeconds)
      .exec();
  }

  async getPresence(roomCode: string): Promise<PresenceLease[]> {
    const values = await this.client.hGetAll(presenceKey(roomCode));
    return Object.values(values).map((value) => parseJson(value, `presence ${roomCode}`) as PresenceLease);
  }

  async removePlayerPresence(roomCode: string, playerId: string): Promise<void> {
    const key = presenceKey(roomCode);
    const values = await this.client.hGetAll(key);
    const connectionIds = Object.entries(values).flatMap(([connectionId, value]) => {
      const lease = parseJson(value, `presence ${roomCode}`) as PresenceLease;
      return lease.playerId === playerId ? [connectionId] : [];
    });
    if (connectionIds.length > 0) await this.client.hDel(key, connectionIds);
  }

  async appendChat(message: ChatMessage): Promise<void> {
    await this.client.multi()
      .rPush(chatKey(message.roomCode), JSON.stringify(message))
      .lTrim(chatKey(message.roomCode), -100, -1)
      .expire(chatKey(message.roomCode), this.ttlSeconds)
      .exec();
  }

  async getChat(roomCode: string, limit: number): Promise<ChatMessage[]> {
    const values = await this.client.lRange(chatKey(roomCode), -limit, -1);
    return values.map((value) => parseJson(value, `chat ${roomCode}`) as ChatMessage);
  }

  async publish(channel: string, event: ServerRealtimeMessage): Promise<void> {
    await this.client.publish(channelKey(channel), JSON.stringify(event));
  }

  async subscribe(channel: string, listener: (event: ServerRealtimeMessage) => void): Promise<() => Promise<void>> {
    const subscriber = this.client.duplicate();
    subscriber.on("error", (error) => console.error("Redis subscriber error", error));
    await subscriber.connect();
    const redisChannel = channelKey(channel);
    await subscriber.subscribe(redisChannel, (value) => {
      listener(parseJson(value, `channel ${channel}`) as ServerRealtimeMessage);
    });
    return async () => {
      if (subscriber.isOpen) {
        await subscriber.unsubscribe(redisChannel);
        await subscriber.quit();
      }
    };
  }
}

export async function connectRedisOnlineStore(url: string): Promise<RedisOnlineStore> {
  const client = createConfiguredClient(url);
  client.on("error", (error) => console.error("Redis connection error", error));
  await client.connect();
  return new RedisOnlineStore(client);
}
