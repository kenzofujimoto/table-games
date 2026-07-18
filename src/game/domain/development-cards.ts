import type { DevelopmentCard, DevelopmentCardKind, Player, Resource } from "./types.js";

export function canPlayDevelopmentCard(
  card: DevelopmentCard,
  currentTurn: number,
  usedDevelopmentCardThisTurn: boolean,
): boolean {
  return card.kind !== "victoryPoint" && card.purchasedTurn < currentTurn && !usedDevelopmentCardThisTurn;
}

export function drawDevelopmentCard(
  deck: DevelopmentCardKind[],
  random: () => number = Math.random,
): { card: DevelopmentCardKind; remainingDeck: DevelopmentCardKind[] } {
  if (deck.length === 0) {
    throw new Error("Development deck is empty");
  }
  const index = Math.min(deck.length - 1, Math.floor(random() * deck.length));
  const card = deck[index];
  if (!card) {
    throw new Error("Could not draw a development card");
  }
  return { card, remainingDeck: deck.filter((_, candidateIndex) => candidateIndex !== index) };
}

export function applyMonopoly(players: Player[], activePlayerId: string, resource: Resource): Player[] {
  const total = players
    .filter((player) => player.id !== activePlayerId)
    .reduce((amount, player) => amount + player.resources[resource], 0);

  return players.map((player) => ({
    ...player,
    resources: {
      ...player.resources,
      [resource]: player.id === activePlayerId ? player.resources[resource] + total : 0,
    },
  }));
}

export function createDevelopmentDeck(): DevelopmentCardKind[] {
  return [
    ...Array<DevelopmentCardKind>(14).fill("knight"),
    ...Array<DevelopmentCardKind>(5).fill("victoryPoint"),
    ...Array<DevelopmentCardKind>(2).fill("roadBuilding"),
    ...Array<DevelopmentCardKind>(2).fill("yearOfPlenty"),
    ...Array<DevelopmentCardKind>(2).fill("monopoly"),
  ];
}
