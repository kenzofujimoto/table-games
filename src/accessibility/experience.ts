import type { AccessibilitySettings } from "@/app/store";
import type { GameCommand } from "@/game/application/game-engine";

const CLASS_PREFERENCES = {
  colorBlind: "is-color-blind",
  highContrast: "is-high-contrast",
  lowPerformance: "is-low-performance",
} as const;

export function applyAccessibilitySettings(
  settings: AccessibilitySettings,
  root: HTMLElement = document.documentElement,
): void {
  for (const [setting, className] of Object.entries(CLASS_PREFERENCES)) {
    root.classList.toggle(className, settings[setting as keyof typeof CLASS_PREFERENCES]);
  }
  root.dataset.interfaceScale = settings.interfaceScale;
}

export function shouldConfirmGameCommand(
  commandType: GameCommand["type"],
  settings: Pick<AccessibilitySettings, "confirmBuilds">,
): boolean {
  return settings.confirmBuilds && ["buildRoad", "buildSettlement", "upgradeCity"].includes(commandType);
}
