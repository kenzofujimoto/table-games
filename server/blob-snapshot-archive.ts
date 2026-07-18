import { get, list, put } from "@vercel/blob";

import type { GameState } from "../src/game/application/game-engine.js";
import type { SnapshotArchive } from "./durable-online-store.js";
import type { StoredRoomRecord } from "./online-store.js";

const VERSION_WIDTH = 10;

interface BlobSnapshotOptions {
  token?: string;
}

function versionName(value: number): string {
  return String(value).padStart(VERSION_WIDTH, "0");
}

async function streamToJson<T>(pathname: string, token?: string): Promise<T | null> {
  const result = await get(pathname, {
    access: "private",
    useCache: false,
    ...(token ? { token } : {}),
  });
  if (!result || result.statusCode !== 200) return null;
  const text = await new Response(result.stream).text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Invalid snapshot JSON at ${pathname}`, { cause: error });
  }
}

export class BlobSnapshotArchive implements SnapshotArchive {
  private readonly token: string | undefined;

  constructor(options: BlobSnapshotOptions = {}) {
    this.token = options.token;
  }

  async writeRoom(record: StoredRoomRecord): Promise<void> {
    await this.write(`auren/rooms/${record.room.code}/${versionName(record.revision)}.json`, record);
  }

  async loadLatestRoom(code: string): Promise<StoredRoomRecord | null> {
    const pathname = await this.latestPathname(`auren/rooms/${code.toUpperCase()}/`);
    return pathname ? streamToJson<StoredRoomRecord>(pathname, this.token) : null;
  }

  async writeGame(state: GameState): Promise<void> {
    await this.write(`auren/games/${state.id}/${versionName(state.version)}.json`, state);
  }

  async loadLatestGame(gameId: string): Promise<GameState | null> {
    const pathname = await this.latestPathname(`auren/games/${gameId}/`);
    return pathname ? streamToJson<GameState>(pathname, this.token) : null;
  }

  private async write(pathname: string, value: unknown): Promise<void> {
    await put(pathname, JSON.stringify(value), {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      ...(this.token ? { token: this.token } : {}),
    });
  }

  private async latestPathname(prefix: string): Promise<string | null> {
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
        ...(this.token ? { token: this.token } : {}),
      });
      pathnames.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return pathnames.sort().at(-1) ?? null;
  }
}
