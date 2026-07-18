import { BlobSnapshotArchive } from "./blob-snapshot-archive.js";
import { DurableOnlineStore } from "./durable-online-store.js";
import { InMemoryOnlineStore } from "./in-memory-online-store.js";
import type { OnlineStore } from "./online-store.js";
import { connectRedisOnlineStore } from "./redis-online-store.js";

let storePromise: Promise<OnlineStore> | null = null;

function redisUrl(): string | null {
  return process.env.REDIS_URL ?? process.env.REDIS_PRIVATE_URL ?? null;
}

async function createOnlineStore(): Promise<OnlineStore> {
  const url = redisUrl();
  if (!url) {
    if (process.env.VERCEL === "1") {
      throw new Error("REDIS_URL is required. Connect the free Redis Marketplace integration to this Vercel project.");
    }
    return new InMemoryOnlineStore();
  }
  const cache = await connectRedisOnlineStore(url);
  const archive = new BlobSnapshotArchive({
    ...(process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}),
  });
  return new DurableOnlineStore(cache, archive);
}

export function getOnlineStore(): Promise<OnlineStore> {
  storePromise ??= createOnlineStore();
  return storePromise;
}
