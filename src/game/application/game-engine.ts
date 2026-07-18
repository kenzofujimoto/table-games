import { determineLargestArmy, determineLongestRoadOwner } from "../domain/achievements";
import { generateBoard } from "../domain/board-generator";
import { drawDevelopmentCard, createDevelopmentDeck } from "../domain/development-cards";
import { BUILD_COSTS, canAfford, payCost, totalResources } from "../domain/economy";
import { canBuildRoad, canBuildSettlement } from "../domain/placement";
import { distributeProduction } from "../domain/production";
import { hasWon } from "../domain/scoring";
import { cardsToDiscard, rollDice } from "../domain/turn-rules";
import {
  RESOURCE_TYPES,
  emptyResources,
  type AchievementState,
  type Board,
  type DevelopmentCardKind,
  type Player,
  type Resource,
  type ResourceCounts,
  type TurnPhase,
} from "../domain/types";

export interface GameConfig {
  targetScore: number;
  turnSeconds: number;
  confirmEndTurn: boolean;
  chatEnabled: boolean;
}

export interface DiceResult {
  first: number;
  second: number;
  total: number;
}

export type GameEventType =
  | "gameStarted"
  | "settlementBuilt"
  | "roadBuilt"
  | "cityBuilt"
  | "diceRolled"
  | "resourcesProduced"
  | "resourcesDiscarded"
  | "robberMoved"
  | "resourceStolen"
  | "bankTrade"
  | "developmentCardBought"
  | "turnEnded"
  | "victory";

export interface GameEvent {
  id: string;
  type: GameEventType;
  actorId: string | null;
  message: string;
  turn: number;
}

export interface GameState {
  id: string;
  roomCode: string;
  seed: string;
  version: number;
  config: GameConfig;
  board: Board;
  players: Player[];
  bank: ResourceCounts;
  developmentDeck: DevelopmentCardKind[];
  phase: TurnPhase;
  activePlayerIndex: number;
  turnNumber: number;
  setupStep: number;
  pendingSetupVertexId: string | null;
  pendingDiscards: Record<string, number>;
  dice: DiceResult | null;
  achievements: AchievementState;
  usedDevelopmentCardThisTurn: boolean;
  events: GameEvent[];
  appliedCommandIds: string[];
  winnerId: string | null;
}

interface BaseCommand {
  id: string;
  actorId: string;
}

export type GameCommand =
  | (BaseCommand & { type: "placeSettlement"; vertexId: string })
  | (BaseCommand & { type: "placeRoad"; edgeId: string })
  | (BaseCommand & { type: "rollDice" })
  | (BaseCommand & { type: "discardResources"; resources: ResourceCounts })
  | (BaseCommand & { type: "moveRobber"; tileId: string; victimId: string | null })
  | (BaseCommand & { type: "buildRoad"; edgeId: string })
  | (BaseCommand & { type: "buildSettlement"; vertexId: string })
  | (BaseCommand & { type: "upgradeCity"; vertexId: string })
  | (BaseCommand & { type: "bankTrade"; give: Resource; receive: Resource; ratio: 2 | 3 | 4 })
  | (BaseCommand & { type: "buyDevelopmentCard" })
  | (BaseCommand & { type: "endTurn" });

interface EngineDependencies {
  random?: () => number;
}

interface CreateGameInput {
  id: string;
  roomCode: string;
  seed: string;
  players: Player[];
  targetScore: number;
  turnSeconds?: number;
}

function clonePlayers(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    resources: { ...player.resources },
    remainingPieces: { ...player.remainingPieces },
    developmentCards: player.developmentCards.map((card) => ({ ...card })),
  }));
}

function cloneBoard(board: Board): Board {
  return {
    ...board,
    tiles: board.tiles.map((tile) => ({ ...tile, vertexIds: [...tile.vertexIds] })),
    vertices: board.vertices.map((vertex) => ({
      ...vertex,
      tileIds: [...vertex.tileIds],
      building: vertex.building ? { ...vertex.building } : null,
    })),
    edges: board.edges.map((edge) => ({ ...edge, vertexIds: [...edge.vertexIds] as [string, string] })),
    ports: board.ports.map((port) => ({ ...port })),
  };
}

function event(state: GameState, type: GameEventType, actorId: string | null, message: string): GameEvent {
  return { id: `event-${state.version + 1}-${state.events.length}`, type, actorId, message, turn: state.turnNumber };
}

function activePlayer(state: GameState): Player {
  const player = state.players[state.activePlayerIndex];
  if (!player) throw new Error("Active player was not found");
  return player;
}

function assertActivePlayer(state: GameState, actorId: string): void {
  if (activePlayer(state).id !== actorId) {
    throw new Error("It is not this player's turn");
  }
}

function setupOrder(playerCount: number): number[] {
  const normal = Array.from({ length: playerCount }, (_, index) => index);
  return [...normal, ...[...normal].reverse()];
}

function withCommandApplied(state: GameState, commandId: string): GameState {
  return {
    ...state,
    version: state.version + 1,
    appliedCommandIds: [...state.appliedCommandIds.slice(-99), commandId],
  };
}

function returnCostToBank(bank: ResourceCounts, cost: Partial<ResourceCounts>): ResourceCounts {
  return RESOURCE_TYPES.reduce<ResourceCounts>((next, resource) => {
    next[resource] += cost[resource] ?? 0;
    return next;
  }, { ...bank });
}

function grantSecondSettlementResources(state: GameState, player: Player, vertexId: string): void {
  const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex) return;
  for (const tileId of vertex.tileIds) {
    const resource = state.board.tiles.find((tile) => tile.id === tileId)?.resource;
    if (resource && state.bank[resource] > 0) {
      player.resources[resource] += 1;
      state.bank[resource] -= 1;
    }
  }
}

function refreshAchievements(state: GameState): void {
  state.achievements = {
    longestRoadPlayerId: determineLongestRoadOwner(
      state.board,
      state.players,
      state.achievements.longestRoadPlayerId,
    ),
    largestArmyPlayerId: determineLargestArmy(state.players, state.achievements.largestArmyPlayerId),
  };
}

function evaluateVictory(state: GameState, actorId: string): void {
  const player = state.players.find((candidate) => candidate.id === actorId);
  if (player && hasWon(player, state.board, state.achievements, state.config.targetScore, actorId)) {
    state.winnerId = actorId;
    state.phase = "finished";
    state.events.push(event(state, "victory", actorId, `${player.name} alcançou ${state.config.targetScore} pontos.`));
  }
}

export function createGame(input: CreateGameInput): GameState {
  if (input.players.length < 3 || input.players.length > 4) {
    throw new Error("A game requires three or four players");
  }

  const preparedPlayers = clonePlayers(input.players).map((player) => ({
    ...player,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  }));

  return {
    id: input.id,
    roomCode: input.roomCode,
    seed: input.seed,
    version: 0,
    config: {
      targetScore: input.targetScore,
      turnSeconds: input.turnSeconds ?? 120,
      confirmEndTurn: true,
      chatEnabled: true,
    },
    board: generateBoard({ seed: input.seed, shape: "classic" }),
    players: preparedPlayers,
    bank: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    developmentDeck: createDevelopmentDeck(),
    phase: "setupSettlement",
    activePlayerIndex: 0,
    turnNumber: 1,
    setupStep: 0,
    pendingSetupVertexId: null,
    pendingDiscards: {},
    dice: null,
    achievements: { longestRoadPlayerId: null, largestArmyPlayerId: null },
    usedDevelopmentCardThisTurn: false,
    events: [{ id: "event-0", type: "gameStarted", actorId: null, message: "A expedição começou.", turn: 1 }],
    appliedCommandIds: [],
    winnerId: null,
  };
}

function placeSettlement(state: GameState, command: Extract<GameCommand, { type: "placeSettlement" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "setupSettlement") throw new Error("A settlement cannot be placed now");
  if (!canBuildSettlement(state.board, command.vertexId, command.actorId, { setup: true })) {
    throw new Error("Invalid settlement position");
  }

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), events: [...state.events] }, command.id);
  const vertex = next.board.vertices.find((candidate) => candidate.id === command.vertexId)!;
  const player = next.players.find((candidate) => candidate.id === command.actorId)!;
  if (player.remainingPieces.settlements <= 0) throw new Error("No settlements remaining");
  vertex.building = { kind: "settlement", playerId: command.actorId };
  player.remainingPieces.settlements -= 1;
  if (next.setupStep >= next.players.length) {
    grantSecondSettlementResources(next, player, command.vertexId);
  }
  next.pendingSetupVertexId = command.vertexId;
  next.phase = "setupRoad";
  next.events.push(event(next, "settlementBuilt", command.actorId, `${player.name} fundou um posto.`));
  return next;
}

function placeRoad(state: GameState, command: Extract<GameCommand, { type: "placeRoad" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "setupRoad" || !state.pendingSetupVertexId) throw new Error("An initial road cannot be placed now");
  if (!canBuildRoad(state.board, command.edgeId, command.actorId, state.pendingSetupVertexId)) {
    throw new Error("Invalid initial road position");
  }

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), events: [...state.events] }, command.id);
  const edge = next.board.edges.find((candidate) => candidate.id === command.edgeId)!;
  const player = next.players.find((candidate) => candidate.id === command.actorId)!;
  if (player.remainingPieces.roads <= 0) throw new Error("No roads remaining");
  edge.roadPlayerId = command.actorId;
  player.remainingPieces.roads -= 1;
  next.events.push(event(next, "roadBuilt", command.actorId, `${player.name} abriu uma rota.`));
  next.setupStep += 1;
  next.pendingSetupVertexId = null;
  const order = setupOrder(next.players.length);
  if (next.setupStep >= order.length) {
    next.phase = "roll";
    next.activePlayerIndex = 0;
  } else {
    next.phase = "setupSettlement";
    next.activePlayerIndex = order[next.setupStep]!;
  }
  return next;
}

function handleRoll(state: GameState, command: Extract<GameCommand, { type: "rollDice" }>, random: () => number): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "roll") throw new Error("Dice cannot be rolled now");
  const dice = rollDice(random);
  let next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events], dice }, command.id);
  next.events.push(event(next, "diceRolled", command.actorId, `${activePlayer(next).name} lançou ${dice.total}.`));

  if (dice.total === 7) {
    const pendingDiscards = Object.fromEntries(next.players.flatMap((player) => {
      const count = cardsToDiscard(totalResources(player.resources));
      return count > 0 ? [[player.id, count]] : [];
    }));
    next.pendingDiscards = pendingDiscards;
    next.phase = Object.keys(pendingDiscards).length > 0 ? "discard" : "robber";
    return next;
  }

  const production = distributeProduction({ roll: dice.total, board: next.board, players: next.players, bank: next.bank });
  next = { ...next, players: production.players, bank: production.bank, phase: "actions" };
  next.events.push(event(next, "resourcesProduced", command.actorId, production.grants.length > 0
    ? `${production.grants.length} produção(ões) foram distribuídas.`
    : "Nenhum terreno produziu."));
  return next;
}

function discardResources(state: GameState, command: Extract<GameCommand, { type: "discardResources" }>): GameState {
  const required = state.pendingDiscards[command.actorId];
  if (state.phase !== "discard" || required === undefined) throw new Error("This player does not need to discard");
  const amount = totalResources(command.resources);
  if (amount !== required) throw new Error(`Discard exactly ${required} cards`);
  const player = state.players.find((candidate) => candidate.id === command.actorId);
  if (!player || RESOURCE_TYPES.some((resource) => command.resources[resource] > player.resources[resource])) {
    throw new Error("Invalid discarded resources");
  }

  const next = withCommandApplied({ ...state, players: clonePlayers(state.players), bank: { ...state.bank }, pendingDiscards: { ...state.pendingDiscards }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  for (const resource of RESOURCE_TYPES) {
    nextPlayer.resources[resource] -= command.resources[resource];
    next.bank[resource] += command.resources[resource];
  }
  next.pendingDiscards = Object.fromEntries(
    Object.entries(next.pendingDiscards).filter(([playerId]) => playerId !== command.actorId),
  );
  next.events.push(event(next, "resourcesDiscarded", command.actorId, `${nextPlayer.name} descartou ${required} cartas.`));
  if (Object.keys(next.pendingDiscards).length === 0) next.phase = "robber";
  return next;
}

function moveRobber(state: GameState, command: Extract<GameCommand, { type: "moveRobber" }>, random: () => number): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "robber") throw new Error("The robber cannot be moved now");
  const current = state.board.tiles.find((tile) => tile.hasRobber);
  const target = state.board.tiles.find((tile) => tile.id === command.tileId);
  if (!target || current?.id === target.id) throw new Error("Move the robber to another tile");

  const eligibleVictims = new Set(target.vertexIds.flatMap((vertexId) => {
    const building = state.board.vertices.find((vertex) => vertex.id === vertexId)?.building;
    if (!building || building.playerId === command.actorId) return [];
    const player = state.players.find((candidate) => candidate.id === building.playerId);
    return player && totalResources(player.resources) > 0 ? [player.id] : [];
  }));
  if (command.victimId !== null && !eligibleVictims.has(command.victimId)) throw new Error("Invalid robbery victim");

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), events: [...state.events] }, command.id);
  next.board.tiles.forEach((tile) => {
    tile.hasRobber = tile.id === command.tileId;
  });
  next.events.push(event(next, "robberMoved", command.actorId, `${activePlayer(next).name} moveu o andarilho.`));
  if (command.victimId) {
    const victim = next.players.find((candidate) => candidate.id === command.victimId)!;
    const thief = next.players.find((candidate) => candidate.id === command.actorId)!;
    const cards = RESOURCE_TYPES.flatMap((resource) => Array<Resource>(victim.resources[resource]).fill(resource));
    const stolen = cards[Math.min(cards.length - 1, Math.floor(random() * cards.length))];
    if (stolen) {
      victim.resources[stolen] -= 1;
      thief.resources[stolen] += 1;
      next.events.push(event(next, "resourceStolen", command.actorId, `${thief.name} roubou uma carta de ${victim.name}.`));
    }
  }
  next.phase = "actions";
  return next;
}

function buildRoad(state: GameState, command: Extract<GameCommand, { type: "buildRoad" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("A road cannot be built now");
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (player.remainingPieces.roads <= 0) throw new Error("No roads remaining");
  if (!canAfford(player.resources, BUILD_COSTS.road)) throw new Error("Insufficient resources");
  if (!canBuildRoad(state.board, command.edgeId, command.actorId)) throw new Error("Invalid road position");

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.resources = payCost(nextPlayer.resources, BUILD_COSTS.road);
  nextPlayer.remainingPieces.roads -= 1;
  next.bank = returnCostToBank(next.bank, BUILD_COSTS.road);
  next.board.edges.find((edge) => edge.id === command.edgeId)!.roadPlayerId = command.actorId;
  next.events.push(event(next, "roadBuilt", command.actorId, `${nextPlayer.name} construiu uma rota.`));
  refreshAchievements(next);
  evaluateVictory(next, command.actorId);
  return next;
}

function buildSettlement(state: GameState, command: Extract<GameCommand, { type: "buildSettlement" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("A settlement cannot be built now");
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (player.remainingPieces.settlements <= 0) throw new Error("No settlements remaining");
  if (!canAfford(player.resources, BUILD_COSTS.settlement)) throw new Error("Insufficient resources");
  if (!canBuildSettlement(state.board, command.vertexId, command.actorId, { setup: false })) throw new Error("Invalid settlement position");

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.resources = payCost(nextPlayer.resources, BUILD_COSTS.settlement);
  nextPlayer.remainingPieces.settlements -= 1;
  next.bank = returnCostToBank(next.bank, BUILD_COSTS.settlement);
  next.board.vertices.find((vertex) => vertex.id === command.vertexId)!.building = { kind: "settlement", playerId: command.actorId };
  next.events.push(event(next, "settlementBuilt", command.actorId, `${nextPlayer.name} fundou um posto.`));
  refreshAchievements(next);
  evaluateVictory(next, command.actorId);
  return next;
}

function upgradeCity(state: GameState, command: Extract<GameCommand, { type: "upgradeCity" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("A city cannot be built now");
  const vertex = state.board.vertices.find((candidate) => candidate.id === command.vertexId);
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (vertex?.building?.playerId !== command.actorId || vertex.building.kind !== "settlement") throw new Error("Upgrade one of your settlements");
  if (player.remainingPieces.cities <= 0) throw new Error("No cities remaining");
  if (!canAfford(player.resources, BUILD_COSTS.city)) throw new Error("Insufficient resources");

  const next = withCommandApplied({ ...state, board: cloneBoard(state.board), players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.resources = payCost(nextPlayer.resources, BUILD_COSTS.city);
  nextPlayer.remainingPieces.cities -= 1;
  nextPlayer.remainingPieces.settlements += 1;
  next.bank = returnCostToBank(next.bank, BUILD_COSTS.city);
  next.board.vertices.find((candidate) => candidate.id === command.vertexId)!.building = { kind: "city", playerId: command.actorId };
  next.events.push(event(next, "cityBuilt", command.actorId, `${nextPlayer.name} ergueu uma cidadela.`));
  evaluateVictory(next, command.actorId);
  return next;
}

function bankTrade(state: GameState, command: Extract<GameCommand, { type: "bankTrade" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("Bank trading is not available now");
  if (command.give === command.receive) throw new Error("Trade two different resources");
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (player.resources[command.give] < command.ratio) throw new Error("Insufficient resources for this trade");
  if (state.bank[command.receive] < 1) throw new Error("The bank has none of the requested resource");
  if (command.ratio < 4) {
    const ownsRequiredPort = state.board.ports.some((port) => {
      if (port.ratio !== command.ratio || (port.kind !== "generic" && port.kind !== command.give)) return false;
      const edge = state.board.edges.find((candidate) => candidate.id === port.edgeId);
      return edge?.vertexIds.some((vertexId) => state.board.vertices.find((vertex) => vertex.id === vertexId)?.building?.playerId === command.actorId) ?? false;
    });
    if (!ownsRequiredPort) throw new Error("The player does not own the required port");
  }

  const next = withCommandApplied({ ...state, players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.resources[command.give] -= command.ratio;
  nextPlayer.resources[command.receive] += 1;
  next.bank[command.give] += command.ratio;
  next.bank[command.receive] -= 1;
  next.events.push(event(next, "bankTrade", command.actorId, `${nextPlayer.name} negociou com o entreposto.`));
  return next;
}

function buyDevelopmentCard(state: GameState, command: Extract<GameCommand, { type: "buyDevelopmentCard" }>, random: () => number): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("A development card cannot be bought now");
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (!canAfford(player.resources, BUILD_COSTS.developmentCard)) throw new Error("Insufficient resources");
  const draw = drawDevelopmentCard(state.developmentDeck, random);
  const next = withCommandApplied({ ...state, players: clonePlayers(state.players), bank: { ...state.bank }, events: [...state.events] }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.resources = payCost(nextPlayer.resources, BUILD_COSTS.developmentCard);
  nextPlayer.developmentCards.push({ id: `dev-${next.version}`, kind: draw.card, purchasedTurn: next.turnNumber, revealed: false });
  next.developmentDeck = draw.remainingDeck;
  next.bank = returnCostToBank(next.bank, BUILD_COSTS.developmentCard);
  next.events.push(event(next, "developmentCardBought", command.actorId, `${nextPlayer.name} comprou uma carta de horizonte.`));
  evaluateVictory(next, command.actorId);
  return next;
}

function endTurn(state: GameState, command: Extract<GameCommand, { type: "endTurn" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("The turn cannot end now");
  const next = withCommandApplied({ ...state, events: [...state.events] }, command.id);
  next.events.push(event(next, "turnEnded", command.actorId, `${activePlayer(next).name} encerrou o turno.`));
  next.activePlayerIndex = (next.activePlayerIndex + 1) % next.players.length;
  next.turnNumber += 1;
  next.phase = "roll";
  next.dice = null;
  next.usedDevelopmentCardThisTurn = false;
  return next;
}

export function applyGameCommand(
  state: GameState,
  command: GameCommand,
  dependencies: EngineDependencies = {},
): GameState {
  if (state.appliedCommandIds.includes(command.id)) return state;
  if (state.phase === "finished") throw new Error("The game has already finished");
  const random = dependencies.random ?? Math.random;

  switch (command.type) {
    case "placeSettlement": return placeSettlement(state, command);
    case "placeRoad": return placeRoad(state, command);
    case "rollDice": return handleRoll(state, command, random);
    case "discardResources": return discardResources(state, command);
    case "moveRobber": return moveRobber(state, command, random);
    case "buildRoad": return buildRoad(state, command);
    case "buildSettlement": return buildSettlement(state, command);
    case "upgradeCity": return upgradeCity(state, command);
    case "bankTrade": return bankTrade(state, command);
    case "buyDevelopmentCard": return buyDevelopmentCard(state, command, random);
    case "endTurn": return endTurn(state, command);
  }
}
