/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("accessible player identity styles", () => {
  it("adds patterns without replacing each player's established colors", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    for (const color of ["ember", "tide", "moss", "amethyst"]) {
      expect(css).not.toMatch(new RegExp(`\\.is-color-blind \\.road--${color}\\s*\\{[^}]*stroke:`));
      expect(css).not.toMatch(new RegExp(`\\.is-color-blind \\.building--${color}\\s*\\{[^}]*fill:`));
      expect(css).not.toMatch(new RegExp(`\\.is-color-blind \\.avatar-token--${color}\\s*\\{[^}]*background:`));
    }

    expect(css).toContain(".is-color-blind .road--tide");
    expect(css).toContain("stroke-dasharray");
  });
});
