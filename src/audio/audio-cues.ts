import type { GameCommand } from "@/game/application/game-engine";

export type AudioCue = "dice" | "build" | "trade" | "card" | "turn";

const COMMAND_CUES: Partial<Record<GameCommand["type"], AudioCue>> = {
  rollDice: "dice",
  placeSettlement: "build",
  placeRoad: "build",
  buildRoad: "build",
  buildSettlement: "build",
  upgradeCity: "build",
  bankTrade: "trade",
  proposeTrade: "trade",
  respondTrade: "trade",
  buyDevelopmentCard: "card",
  playDevelopmentCard: "card",
  endTurn: "turn",
};

export function audioCueForCommand(commandType: GameCommand["type"]): AudioCue | null {
  return COMMAND_CUES[commandType] ?? null;
}
