import { determineLargestArmy, determineLongestRoadOwner } from "../domain/achievements.js";
import { generateBoard } from "../domain/board-generator.js";
import { applyMonopoly, canPlayDevelopmentCard, drawDevelopmentCard, createDevelopmentDeck } from "../domain/development-cards.js";
import { BUILD_COSTS, canAfford, payCost, totalResources } from "../domain/economy.js";
import { canBuildRoad, canBuildSettlement, validRoadEdges, validSettlementVertices } from "../domain/placement.js";
import { distributeProduction } from "../domain/production.js";
import { hasWon } from "../domain/scoring.js";
import { cardsToDiscard, rollDice } from "../domain/turn-rules.js";
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
} from "../domain/types.js";

export interface GameConfig {
  targetScore: number;
  turnSeconds: number;
  diceRollSeconds: number;
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
  | "developmentCardPlayed"
  | "tradeProposed"
  | "tradeCompleted"
  | "turnEnded"
  | "victory";

export interface GameEvent {
  id: string;
  type: GameEventType;
  actorId: string | null;
  message: string;
  turn: number;
}

export interface TradeOffer {
  id: string;
  proposerId: string;
  offer: ResourceCounts;
  request: ResourceCounts;
  targetPlayerIds: string[];
  status: "open" | "accepted" | "rejected" | "cancelled" | "expired";
  responderId: string | null;
  rejectedPlayerIds?: string[];
  createdTurn?: number;
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
  phaseStartedAt: string;
  phaseDeadlineAt: string | null;
  disconnectGraceUsedMs: Record<string, number>;
  disconnectGraceKeys: string[];
  lastAllOfflineAt?: string | null;
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
  trades: TradeOffer[];
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
  | (BaseCommand & {
      type: "playDevelopmentCard";
      cardId: string;
      resource?: Resource;
      resources?: [Resource, Resource];
      edgeIds?: [string, string] | [string];
    })
  | (BaseCommand & {
      type: "proposeTrade";
      offer: ResourceCounts;
      request: ResourceCounts;
      targetPlayerIds: string[];
    })
  | (BaseCommand & { type: "respondTrade"; tradeId: string; response: "accept" | "reject" })
  | (BaseCommand & { type: "cancelTrade"; tradeId: string })
  | (BaseCommand & { type: "endTurn" });

interface EngineDependencies {
  random?: () => number;
  now?: () => Date;
}

interface CreateGameInput {
  id: string;
  roomCode: string;
  seed: string;
  players: Player[];
  targetScore: number;
  turnSeconds?: number;
  startedAt?: string;
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

function phaseDurationMilliseconds(state: Pick<GameState, "config">, phase: TurnPhase): number | null {
  if (phase === "finished") return null;
  const seconds = phase === "roll" ? state.config.diceRollSeconds : state.config.turnSeconds;
  return seconds * 1_000;
}

function withPhaseTiming(state: GameState, now: Date): GameState {
  const duration = phaseDurationMilliseconds(state, state.phase);
  return {
    ...state,
    phaseStartedAt: now.toISOString(),
    phaseDeadlineAt: duration === null ? null : new Date(now.getTime() + duration).toISOString(),
  };
}

function refreshPhaseTiming(previous: GameState, next: GameState, now: Date): GameState {
  if (
    previous.phase !== next.phase
    || previous.activePlayerIndex !== next.activePlayerIndex
  ) {
    return withPhaseTiming(next, now);
  }
  return next;
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
  if (input.players.length < 2 || input.players.length > 4) {
    throw new Error("A game requires two to four players");
  }

  const preparedPlayers = clonePlayers(input.players).map((player) => ({
    ...player,
    connectionStatus: player.connectionStatus ?? "online",
    control: player.control ?? "human",
    lastSeenAt: player.lastSeenAt ?? null,
    resources: emptyResources(),
    remainingPieces: { roads: 15, settlements: 5, cities: 4 },
    developmentCards: [],
    playedKnights: 0,
    revealedVictoryPoints: 0,
  }));

  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) throw new Error("A valid game start time is required");
  const state: GameState = {
    id: input.id,
    roomCode: input.roomCode,
    seed: input.seed,
    version: 0,
    config: {
      targetScore: input.targetScore,
      turnSeconds: input.turnSeconds ?? 120,
      diceRollSeconds: 5,
      confirmEndTurn: true,
      chatEnabled: true,
    },
    board: generateBoard({ seed: input.seed, shape: "classic" }),
    players: preparedPlayers,
    bank: { wood: 19, brick: 19, wool: 19, grain: 19, ore: 19 },
    developmentDeck: createDevelopmentDeck(),
    phase: "setupSettlement",
    phaseStartedAt: startedAt.toISOString(),
    phaseDeadlineAt: null,
    disconnectGraceUsedMs: {},
    disconnectGraceKeys: [],
    lastAllOfflineAt: null,
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
    trades: [],
  };
  return withPhaseTiming(state, startedAt);
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

function proposeTrade(state: GameState, command: Extract<GameCommand, { type: "proposeTrade" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("Player trading is not available now");
  if (state.trades.some((trade) => trade.status === "open")) throw new Error("Resolve the current trade first");
  if (RESOURCE_TYPES.some((resource) => (
    !Number.isInteger(command.offer[resource])
    || command.offer[resource] < 0
    || !Number.isInteger(command.request[resource])
    || command.request[resource] < 0
  ))) throw new Error("Trade quantities must be non-negative whole numbers");
  if (totalResources(command.offer) <= 0 || totalResources(command.request) <= 0) throw new Error("A trade needs offered and requested resources");
  if (RESOURCE_TYPES.some((resource) => command.offer[resource] > 0 && command.request[resource] > 0)) {
    throw new Error("A trade cannot offer and request the same resource");
  }
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  if (RESOURCE_TYPES.some((resource) => command.offer[resource] > player.resources[resource])) throw new Error("Insufficient offered resources");
  const validTargets = [...new Set(command.targetPlayerIds)].filter((id) => (
    id !== command.actorId && state.players.some((candidate) => candidate.id === id)
  ));
  if (validTargets.length === 0) throw new Error("Select at least one valid trade recipient");

  const next = withCommandApplied({ ...state, trades: [...state.trades], events: [...state.events] }, command.id);
  next.trades.push({
    id: command.id,
    proposerId: command.actorId,
    offer: { ...command.offer },
    request: { ...command.request },
    targetPlayerIds: validTargets,
    status: "open",
    responderId: null,
    rejectedPlayerIds: [],
    createdTurn: state.turnNumber,
  });
  next.events.push(event(next, "tradeProposed", command.actorId, `${player.name} propôs uma troca.`));
  return next;
}

function respondTrade(state: GameState, command: Extract<GameCommand, { type: "respondTrade" }>): GameState {
  if (state.phase !== "actions") throw new Error("Player trading is not available now");
  const trade = state.trades.find((candidate) => candidate.id === command.tradeId);
  if (!trade || trade.status !== "open") throw new Error("Trade is no longer available");
  if (!trade.targetPlayerIds.includes(command.actorId)) throw new Error("Player is not a recipient of this trade");
  if ((trade.rejectedPlayerIds ?? []).includes(command.actorId)) throw new Error("This player already refused the trade");
  if (command.response === "reject") {
    const rejectedPlayerIds = [...(trade.rejectedPlayerIds ?? []), command.actorId];
    const allRejected = trade.targetPlayerIds.every((playerId) => rejectedPlayerIds.includes(playerId));
    const next = withCommandApplied({ ...state, trades: state.trades.map((candidate) => candidate.id === trade.id
      ? { ...candidate, status: allRejected ? "rejected" : "open", rejectedPlayerIds }
      : candidate), events: [...state.events] }, command.id);
    next.events.push(event(next, "tradeCompleted", command.actorId, allRejected
      ? "Todos os exploradores recusaram a proposta de troca."
      : `${state.players.find((player) => player.id === command.actorId)?.name ?? "Um explorador"} recusou a proposta de troca.`));
    return next;
  }

  if (RESOURCE_TYPES.some((resource) => (
    !Number.isInteger(trade.offer[resource])
    || trade.offer[resource] < 0
    || !Number.isInteger(trade.request[resource])
    || trade.request[resource] < 0
  ))) throw new Error("Trade quantities must be non-negative whole numbers");

  const proposer = state.players.find((player) => player.id === trade.proposerId)!;
  const responder = state.players.find((player) => player.id === command.actorId)!;
  if (RESOURCE_TYPES.some((resource) => proposer.resources[resource] < trade.offer[resource])) throw new Error("The proposer no longer has the offered resources");
  if (RESOURCE_TYPES.some((resource) => responder.resources[resource] < trade.request[resource])) throw new Error("The responder lacks the requested resources");
  const next = withCommandApplied({ ...state, players: clonePlayers(state.players), trades: state.trades.map((candidate) => candidate.id === trade.id
    ? { ...candidate, status: "accepted", responderId: command.actorId }
    : candidate), events: [...state.events] }, command.id);
  const nextProposer = next.players.find((player) => player.id === trade.proposerId)!;
  const nextResponder = next.players.find((player) => player.id === command.actorId)!;
  for (const resource of RESOURCE_TYPES) {
    nextProposer.resources[resource] += trade.request[resource] - trade.offer[resource];
    nextResponder.resources[resource] += trade.offer[resource] - trade.request[resource];
  }
  next.events.push(event(next, "tradeCompleted", command.actorId, `${nextProposer.name} e ${nextResponder.name} concluíram uma troca.`));
  return next;
}

function cancelTrade(state: GameState, command: Extract<GameCommand, { type: "cancelTrade" }>): GameState {
  if (state.phase !== "actions") throw new Error("Player trading is not available now");
  const trade = state.trades.find((candidate) => candidate.id === command.tradeId);
  if (!trade || trade.status !== "open") throw new Error("Trade is no longer available");
  if (trade.proposerId !== command.actorId) throw new Error("Only the proposer can cancel this trade");
  const next = withCommandApplied({
    ...state,
    trades: state.trades.map((candidate) => candidate.id === trade.id
      ? { ...candidate, status: "cancelled" }
      : candidate),
    events: [...state.events],
  }, command.id);
  next.events.push(event(next, "tradeCompleted", command.actorId, "A proposta de troca foi cancelada."));
  return next;
}

function playDevelopmentCard(
  state: GameState,
  command: Extract<GameCommand, { type: "playDevelopmentCard" }>,
): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("A development card cannot be played now");
  if (state.usedDevelopmentCardThisTurn) throw new Error("Only one development card can be played per turn");
  const player = state.players.find((candidate) => candidate.id === command.actorId)!;
  const card = player.developmentCards.find((candidate) => candidate.id === command.cardId);
  if (!card) throw new Error("Development card was not found");
  if (!canPlayDevelopmentCard(card, state.turnNumber, state.usedDevelopmentCardThisTurn)) {
    throw new Error("This development card cannot be played this turn");
  }

  const next = withCommandApplied({
    ...state,
    board: cloneBoard(state.board),
    players: clonePlayers(state.players),
    bank: { ...state.bank },
    events: [...state.events],
  }, command.id);
  const nextPlayer = next.players.find((candidate) => candidate.id === command.actorId)!;
  nextPlayer.developmentCards = nextPlayer.developmentCards.filter((candidate) => candidate.id !== command.cardId);

  if (card.kind === "monopoly") {
    if (!command.resource) throw new Error("Choose a resource for monopoly");
    next.players = applyMonopoly(next.players, command.actorId, command.resource);
  } else if (card.kind === "yearOfPlenty") {
    if (!command.resources) throw new Error("Choose two resources from the bank");
    const demand = command.resources.reduce<Partial<ResourceCounts>>((counts, resource) => ({
      ...counts,
      [resource]: (counts[resource] ?? 0) + 1,
    }), {});
    if (RESOURCE_TYPES.some((resource) => (demand[resource] ?? 0) > next.bank[resource])) throw new Error("The bank cannot provide those resources");
    for (const resource of command.resources) {
      nextPlayer.resources[resource] += 1;
      next.bank[resource] -= 1;
    }
  } else if (card.kind === "roadBuilding") {
    if (!command.edgeIds) throw new Error("Choose one or two road positions");
    for (const edgeId of command.edgeIds) {
      if (nextPlayer.remainingPieces.roads <= 0) break;
      if (!canBuildRoad(next.board, edgeId, command.actorId)) throw new Error("Invalid free road position");
      next.board.edges.find((edge) => edge.id === edgeId)!.roadPlayerId = command.actorId;
      nextPlayer.remainingPieces.roads -= 1;
    }
    refreshAchievements(next);
  } else if (card.kind === "knight") {
    nextPlayer.playedKnights += 1;
    next.phase = "robber";
    refreshAchievements(next);
  }

  next.usedDevelopmentCardThisTurn = true;
  next.events.push(event(next, "developmentCardPlayed", command.actorId, `${nextPlayer.name} usou uma carta de horizonte.`));
  evaluateVictory(next, command.actorId);
  return next;
}

function endTurn(state: GameState, command: Extract<GameCommand, { type: "endTurn" }>): GameState {
  assertActivePlayer(state, command.actorId);
  if (state.phase !== "actions") throw new Error("The turn cannot end now");
  if (state.trades.some((trade) => trade.status === "open")) {
    throw new Error("Resolve or cancel the open trade before ending the turn");
  }
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
  const now = dependencies.now?.() ?? new Date();

  let next: GameState;
  switch (command.type) {
    case "placeSettlement": next = placeSettlement(state, command); break;
    case "placeRoad": next = placeRoad(state, command); break;
    case "rollDice": next = handleRoll(state, command, random); break;
    case "discardResources": next = discardResources(state, command); break;
    case "moveRobber": next = moveRobber(state, command, random); break;
    case "buildRoad": next = buildRoad(state, command); break;
    case "buildSettlement": next = buildSettlement(state, command); break;
    case "upgradeCity": next = upgradeCity(state, command); break;
    case "bankTrade": next = bankTrade(state, command); break;
    case "buyDevelopmentCard": next = buyDevelopmentCard(state, command, random); break;
    case "playDevelopmentCard": next = playDevelopmentCard(state, command); break;
    case "proposeTrade": next = proposeTrade(state, command); break;
    case "respondTrade": next = respondTrade(state, command); break;
    case "cancelTrade": next = cancelTrade(state, command); break;
    case "endTurn": next = endTurn(state, command); break;
  }
  return refreshPhaseTiming(state, next, now);
}

function automaticSettlement(state: GameState, actorId: string): string | null {
  const candidates = validSettlementVertices(state.board, actorId, { setup: true });
  const probability = (vertexId: string) => {
    const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId);
    return vertex?.tileIds.reduce((score, tileId) => {
      const number = state.board.tiles.find((tile) => tile.id === tileId)?.number;
      return score + (number === null || number === undefined ? 0 : 6 - Math.abs(7 - number));
    }, 0) ?? 0;
  };
  return candidates.sort((first, second) => probability(second) - probability(first) || first.localeCompare(second))[0] ?? null;
}

function automaticDiscard(state: GameState, playerId: string, required: number): ResourceCounts {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  let remaining = required;
  return RESOURCE_TYPES.reduce<ResourceCounts>((resources, resource) => {
    const amount = Math.min(player.resources[resource], remaining);
    resources[resource] = amount;
    remaining -= amount;
    return resources;
  }, emptyResources());
}

export function applyExpiredPhase(
  state: GameState,
  now: Date,
  dependencies: Pick<EngineDependencies, "random"> = {},
): GameState {
  const deadline = state.phaseDeadlineAt ? Date.parse(state.phaseDeadlineAt) : Number.POSITIVE_INFINITY;
  if (state.phase === "finished" || now.getTime() < deadline) return state;
  const actorId = activePlayer(state).id;
  const id = `timeout:${state.phase}:${state.phaseDeadlineAt ?? "legacy"}:${state.setupStep}`;
  let command: GameCommand | null = null;
  let commandState = state;

  if (state.phase === "setupSettlement") {
    const vertexId = automaticSettlement(state, actorId);
    if (vertexId) command = { id, type: "placeSettlement", actorId, vertexId };
  } else if (state.phase === "setupRoad") {
    const edgeId = validRoadEdges(state.board, actorId, state.pendingSetupVertexId ?? undefined).sort()[0];
    if (edgeId) command = { id, type: "placeRoad", actorId, edgeId };
  } else if (state.phase === "roll") {
    command = { id, type: "rollDice", actorId };
  } else if (state.phase === "actions") {
    if (state.trades.some((trade) => trade.status === "open")) {
      commandState = {
        ...state,
        trades: state.trades.map((trade) => trade.status === "open" ? { ...trade, status: "expired" } : trade),
        events: [...state.events, event(state, "tradeCompleted", actorId, "O tempo da proposta de troca terminou.")],
      };
    }
    command = { id, type: "endTurn", actorId };
  } else if (state.phase === "discard") {
    const pending = Object.entries(state.pendingDiscards).sort(([first], [second]) => first.localeCompare(second))[0];
    if (pending) command = {
      id,
      type: "discardResources",
      actorId: pending[0],
      resources: automaticDiscard(state, pending[0], pending[1]),
    };
  } else {
    const target = state.board.tiles.find((tile) => !tile.hasRobber);
    if (target) {
      const victimId = target.vertexIds.flatMap((vertexId) => {
        const building = state.board.vertices.find((vertex) => vertex.id === vertexId)?.building;
        if (!building || building.playerId === actorId) return [];
        const player = state.players.find((candidate) => candidate.id === building.playerId);
        return player && totalResources(player.resources) > 0 ? [player.id] : [];
      })[0] ?? null;
      command = { id, type: "moveRobber", actorId, tileId: target.id, victimId };
    }
  }

  return command
    ? applyGameCommand(commandState, command, {
        ...(dependencies.random ? { random: dependencies.random } : {}),
        now: () => now,
      })
    : state;
}
