import type { GameState } from "@/game/application/game-engine";
import { RESOURCE_TYPES, type Player } from "@/game/domain/types";

export function resourceCardTotal(player: Player): number {
  return player.resourceCardCount
    ?? RESOURCE_TYPES.reduce((total, resource) => total + player.resources[resource], 0);
}

export function canPlayerInteract(state: GameState, playerId: string): boolean {
  if (state.phase === "discard") return state.pendingDiscards[playerId] !== undefined;
  return state.players[state.activePlayerIndex]?.id === playerId && state.phase !== "finished";
}

export function canOpenTrade(state: GameState, playerId: string): boolean {
  if (state.phase !== "actions") return false;
  if (state.players[state.activePlayerIndex]?.id === playerId) return true;
  return state.trades.some((trade) => (
    trade.status === "open" && trade.targetPlayerIds.includes(playerId)
  ));
}
