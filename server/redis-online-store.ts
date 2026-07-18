import { createClient } from "redis";

import type { GameState } from "../src/game/application/game-engine";
import type { ChatMessage, ServerRealtimeMessage } from "../src/multiplayer/protocol";
import type { OnlineStore, StoredRoomRecord } from "./online-store";

function createConfiguredClient(url: string) {
  return createClient({ url });
}

type RedisClient = ReturnType<typeof createConfiguredClient>;

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

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

export class RedisOnlineStore implements OnlineStore {
  constructor(
    private readonly client: RedisClient,
    private readonly ttlSeconds = DEFAULT_TTL_SECONDS,
  ) {}

  async getRoom(code: string): Promise<StoredRoomRecord | null> {
    const value = await this.client.get(roomKey(code));
    return value ? parseJson(value, `room ${code}`) as StoredRoomRecord : null;
  }

  async createRoom(record: StoredRoomRecord): Promise<boolean> {
    const result = await this.client.set(roomKey(record.room.code), JSON.stringify(record), {
      EX: this.ttlSeconds,
      NX: true,
    });
    return result === "OK";
  }

  async compareAndSetRoom(code: string, expectedRevision: number, record: StoredRoomRecord): Promise<boolean> {
    const result = await this.client.eval(ROOM_CAS_SCRIPT, {
      keys: [roomKey(code)],
      arguments: [String(expectedRevision), JSON.stringify(record), String(this.ttlSeconds)],
    });
    return Number(result) === 1;
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
