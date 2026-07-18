import type { AchievementState, Board, Player } from "./types";

export interface Score {
  visible: number;
  hidden: number;
  total: number;
}

export function calculateScore(player: Player, board: Board, achievements: AchievementState): Score {
  const buildings = board.vertices.reduce((score, vertex) => {
    if (vertex.building?.playerId !== player.id) {
      return score;
    }
    return score + (vertex.building.kind === "city" ? 2 : 1);
  }, 0);
  const awards = (achievements.longestRoadPlayerId === player.id ? 2 : 0) +
    (achievements.largestArmyPlayerId === player.id ? 2 : 0);
  const victoryCards = player.developmentCards.filter((card) => card.kind === "victoryPoint");
  const revealedCards = victoryCards.filter((card) => card.revealed).length + player.revealedVictoryPoints;
  const hidden = victoryCards.filter((card) => !card.revealed).length;
  const visible = buildings + awards + revealedCards;
  return { visible, hidden, total: visible + hidden };
}

export function hasWon(
  player: Player,
  board: Board,
  achievements: AchievementState,
  targetScore: number,
  activePlayerId: string,
): boolean {
  return player.id === activePlayerId && calculateScore(player, board, achievements).total >= targetScore;
}
