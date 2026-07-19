import type { GameState, TradeOffer } from "@/game/application/game-engine";
import { RESOURCE_TYPES, type Player, type ResourceCounts } from "@/game/domain/types";

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
  return pendingTradeForViewer(state, playerId) !== null;
}

export function pendingTradeForViewer(state: GameState, playerId: string): TradeOffer | null {
  if (state.phase !== "actions") return null;
  return state.trades.find((trade) => (
    trade.status === "open"
    && trade.targetPlayerIds.includes(playerId)
    && !(trade.rejectedPlayerIds ?? []).includes(playerId)
  )) ?? null;
}

export function canAcceptTrade(
  state: GameState,
  trade: TradeOffer,
  playerId: string,
): { canAccept: boolean; missing: Partial<ResourceCounts> } {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || pendingTradeForViewer(state, playerId)?.id !== trade.id) {
    return { canAccept: false, missing: {} };
  }
  const missing = RESOURCE_TYPES.reduce<Partial<ResourceCounts>>((result, resource) => {
    const shortage = Math.max(0, trade.request[resource] - player.resources[resource]);
    if (shortage > 0) result[resource] = shortage;
    return result;
  }, {});
  return { canAccept: Object.keys(missing).length === 0, missing };
}
