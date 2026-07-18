import { describe, expect, it } from "vitest";

import { validRoadEdges, validSettlementVertices } from "../../domain/placement";
import { emptyResources, type Player } from "../../domain/types";
import { applyGameCommand, createGame } from "../game-engine";

const players: Player[] = ["p1", "p2", "p3"].map((id, index) => ({
  id,
  name: `Explorer ${index + 1}`,
  color: ["ember", "tide", "moss"][index]!,
  avatar: "compass",
  connected: true,
  ready: true,
  resources: emptyResources(),
  remainingPieces: { roads: 15, settlements: 5, cities: 4 },
  developmentCards: [],
  playedKnights: 0,
  revealedVictoryPoints: 0,
}));

function newGame() {
  return createGame({
    id: "game-1",
    roomCode: "AUREN1",
    seed: "engine-seed",
    players,
    targetScore: 10,
  });
}

function completeSetup() {
  let state = newGame();
  const order: string[] = [];

  while (state.phase === "setupSettlement" || state.phase === "setupRoad") {
    const actorId = state.players[state.activePlayerIndex]!.id;
    if (state.phase === "setupSettlement") {
      order.push(actorId);
      const vertexId = validSettlementVertices(state.board, actorId, { setup: true })[0]!;
      state = applyGameCommand(state, { id: `settlement-${order.length}`, type: "placeSettlement", actorId, vertexId });
    } else {
      const edgeId = validRoadEdges(state.board, actorId, state.pendingSetupVertexId ?? undefined)[0]!;
      state = applyGameCommand(state, { id: `road-${order.length}`, type: "placeRoad", actorId, edgeId });
    }
  }

  return { state, order };
}

describe("initial placement", () => {
  it("uses normal then reverse player order", () => {
    const { state, order } = completeSetup();
    expect(order).toEqual(["p1", "p2", "p3", "p3", "p2", "p1"]);
    expect(state.phase).toBe("roll");
    expect(state.players.every((player) => player.remainingPieces.settlements === 3)).toBe(true);
    expect(state.players.every((player) => player.remainingPieces.roads === 13)).toBe(true);
  });

  it("grants resources adjacent to each player's second settlement", () => {
    const { state } = completeSetup();
    expect(state.players.every((player) => Object.values(player.resources).reduce((sum, amount) => sum + amount, 0) > 0)).toBe(true);
  });
});

describe("authoritative commands", () => {
  it("rejects actions from a player who is not active", () => {
    const state = newGame();
    const vertexId = validSettlementVertices(state.board, "p1", { setup: true })[0]!;
    expect(() => applyGameCommand(state, { id: "wrong-player", type: "placeSettlement", actorId: "p2", vertexId })).toThrow(
      "It is not this player's turn",
    );
  });

  it("does not apply the same command twice", () => {
    const state = newGame();
    const vertexId = validSettlementVertices(state.board, "p1", { setup: true })[0]!;
    const command = { id: "same-command", type: "placeSettlement" as const, actorId: "p1", vertexId };
    const once = applyGameCommand(state, command);
    expect(applyGameCommand(once, command)).toBe(once);
  });

  it("resolves production and advances to the action phase", () => {
    const { state } = completeSetup();
    const rolled = applyGameCommand(
      state,
      { id: "roll-eight", type: "rollDice", actorId: "p1" },
      { random: (() => {
        const values = [0.5, 0.5];
        return () => values.shift() ?? 0;
      })() },
    );
    expect(rolled.dice?.total).toBe(8);
    expect(rolled.phase).toBe("actions");
    expect(rolled.events.at(-1)?.type).toBe("resourcesProduced");
  });

  it("requires the robber to move after a seven", () => {
    const { state } = completeSetup();
    const rolled = applyGameCommand(
      state,
      { id: "roll-seven", type: "rollDice", actorId: "p1" },
      { random: (() => {
        const values = [0, 0.999];
        return () => values.shift() ?? 0;
      })() },
    );
    expect(rolled.dice?.total).toBe(7);
    expect(rolled.phase).toBe("robber");

    const currentTileId = rolled.board.tiles.find((tile) => tile.hasRobber)!.id;
    const targetTileId = rolled.board.tiles.find((tile) => tile.id !== currentTileId)!.id;
    const moved = applyGameCommand(rolled, {
      id: "move-robber",
      type: "moveRobber",
      actorId: "p1",
      tileId: targetTileId,
      victimId: null,
    });
    expect(moved.phase).toBe("actions");
    expect(moved.board.tiles.find((tile) => tile.hasRobber)?.id).toBe(targetTileId);
  });

  it("validates and executes a four-for-one bank trade", () => {
    const { state } = completeSetup();
    const funded = {
      ...state,
      phase: "actions" as const,
      players: state.players.map((player) => player.id === "p1"
        ? { ...player, resources: { ...player.resources, wood: 4 } }
        : player),
    };
    const traded = applyGameCommand(funded, {
      id: "bank-trade",
      type: "bankTrade",
      actorId: "p1",
      give: "wood",
      receive: "ore",
      ratio: 4,
    });
    expect(traded.players[0]!.resources.wood).toBe(funded.players[0]!.resources.wood - 4);
    expect(traded.players[0]!.resources.ore).toBe(funded.players[0]!.resources.ore + 1);
  });

  it("moves to the next player and resets turn-scoped state", () => {
    const { state } = completeSetup();
    const actionState = { ...state, phase: "actions" as const, usedDevelopmentCardThisTurn: true };
    const ended = applyGameCommand(actionState, { id: "end-turn", type: "endTurn", actorId: "p1" });
    expect(ended.activePlayerIndex).toBe(1);
    expect(ended.phase).toBe("roll");
    expect(ended.turnNumber).toBe(2);
    expect(ended.usedDevelopmentCardThisTurn).toBe(false);
  });
});
