// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const entryFiles = ["api/game.ts", "api/rooms.ts", "api/ws.ts"];
const relativeImportPattern = /(?:from\s+|import\s*\()(["'])(\.\.?\/[^"']+)\1/g;

function sourceModulePath(importer: string, specifier: string): string | null {
  const sourceSpecifier = specifier.endsWith(".js")
    ? `${specifier.slice(0, -3)}.ts`
    : `${specifier}.ts`;
  const candidate = resolve(dirname(importer), sourceSpecifier);
  return existsSync(candidate) ? candidate : null;
}

describe("Vercel ESM runtime imports", () => {
  it("uses explicit JavaScript extensions throughout the function graph", () => {
    const pending = entryFiles.map((file) => resolve(projectRoot, file));
    const visited = new Set<string>();
    const invalidImports: string[] = [];

    while (pending.length > 0) {
      const file = pending.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(relativeImportPattern)) {
        const specifier = match[2]!;
        if (!specifier.endsWith(".js") && !specifier.endsWith(".json")) {
          invalidImports.push(`${relative(projectRoot, file)} -> ${specifier}`);
        }
        const dependency = sourceModulePath(file, specifier);
        if (dependency) pending.push(dependency);
      }
    }

    expect(invalidImports).toEqual([]);
  });
});
