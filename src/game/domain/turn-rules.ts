import type { TurnPhase } from "./types";

export function cardsToDiscard(resourceCardCount: number): number {
  return resourceCardCount > 7 ? Math.floor(resourceCardCount / 2) : 0;
}

export function rollDice(random: () => number = Math.random): { first: number; second: number; total: number } {
  const die = () => Math.min(6, Math.floor(random() * 6) + 1);
  const first = die();
  const second = die();
  return { first, second, total: first + second };
}

type TurnAction = "roll" | "build" | "trade" | "playDevelopmentCard" | "endTurn";

interface TurnActionContext {
  action: TurnAction;
  actorId: string;
  activePlayerId: string;
  phase: TurnPhase;
}

export function validateTurnAction(context: TurnActionContext): true {
  if (context.actorId !== context.activePlayerId) {
    throw new Error("It is not this player's turn");
  }
  if (context.action === "roll" && context.phase !== "roll") {
    throw new Error("Dice cannot be rolled in the current phase");
  }
  if (["build", "trade", "playDevelopmentCard", "endTurn"].includes(context.action) && context.phase === "roll") {
    const label = context.action === "build" ? "building" : "taking this action";
    throw new Error(`Roll the dice before ${label}`);
  }
  if (["discard", "robber", "finished"].includes(context.phase)) {
    throw new Error("Resolve the current phase first");
  }
  return true;
}
