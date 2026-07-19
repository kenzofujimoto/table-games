import { afterEach, describe, expect, it } from "vitest";

import type { AccessibilitySettings } from "@/app/store";

import { applyAccessibilitySettings, shouldConfirmGameCommand } from "../experience";

const settings: AccessibilitySettings = {
  music: false,
  effects: true,
  volume: 70,
  interfaceScale: "large",
  colorBlind: true,
  highContrast: true,
  lowPerformance: true,
  confirmBuilds: true,
};

describe("experience preferences", () => {
  afterEach(() => {
    document.documentElement.className = "";
    delete document.documentElement.dataset.interfaceScale;
  });

  it("applies every visual accessibility preference to the document", () => {
    applyAccessibilitySettings(settings);

    expect(document.documentElement).toHaveClass("is-color-blind", "is-high-contrast", "is-low-performance");
    expect(document.documentElement).toHaveAttribute("data-interface-scale", "large");
  });

  it("removes stale preferences when they are disabled", () => {
    applyAccessibilitySettings(settings);
    applyAccessibilitySettings({ ...settings, colorBlind: false, highContrast: false, lowPerformance: false, interfaceScale: "compact" });

    expect(document.documentElement).not.toHaveClass("is-color-blind", "is-high-contrast", "is-low-performance");
    expect(document.documentElement).toHaveAttribute("data-interface-scale", "compact");
  });

  it("confirms only resource-spending construction commands", () => {
    expect(shouldConfirmGameCommand("buildRoad", settings)).toBe(true);
    expect(shouldConfirmGameCommand("buildSettlement", settings)).toBe(true);
    expect(shouldConfirmGameCommand("upgradeCity", settings)).toBe(true);
    expect(shouldConfirmGameCommand("placeRoad", settings)).toBe(false);
    expect(shouldConfirmGameCommand("rollDice", settings)).toBe(false);
    expect(shouldConfirmGameCommand("buildRoad", { ...settings, confirmBuilds: false })).toBe(false);
  });
});
