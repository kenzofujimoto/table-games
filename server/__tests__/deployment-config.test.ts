import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel Hobby deployment contract", () => {
  it("configures Vite SPA routing and the Hobby WebSocket duration", async () => {
    const config = JSON.parse(await readFile("vercel.json", "utf8")) as {
      framework?: string;
      functions?: Record<string, { maxDuration?: number }>;
      rewrites?: Array<{ source?: string; destination?: string }>;
    };

    expect(config.framework).toBe("vite");
    expect(config.functions?.["api/ws.ts"]?.maxDuration).toBe(300);
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });

  it("documents the free Redis and Blob setup without Supabase", async () => {
    const [readme, environment] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile(".env.example", "utf8"),
    ]);

    expect(readme).toContain("Vercel Hobby");
    expect(readme).toContain("Redis");
    expect(readme).toContain("Blob");
    expect(readme).toContain("beta público");
    expect(`${readme}\n${environment}`.toLowerCase()).not.toContain("supabase");
    expect(environment).toContain("REDIS_URL=");
    expect(environment).toContain("BLOB_READ_WRITE_TOKEN=");
  });
});
