import { describe, expect, it } from "vitest";

import { validRoadEdges, validSettlementVertices } from "../../domain/placement";
import { emptyResources, type Player } from "../../domain/types";
import { applyGameCommand, createGame, type GameState } from "../game-engine";

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

describe("construction, purchases and defensive validation", () => {
  it("requires three or four players", () => {
    expect(() => createGame({ id: "short", roomCode: "SHORT", seed: "short", players: players.slice(0, 2), targetScore: 10 })).toThrow(
      "A game requires three or four players",
    );
  });

  it("builds paid pieces and buys from the shared development deck", () => {
    const setup = completeSetup().state;
    let state: GameState = {
      ...setup,
      phase: "actions" as const,
      players: setup.players.map((player) => player.id === "p1"
        ? { ...player, resources: { wood: 12, brick: 12, wool: 12, grain: 12, ore: 12 } }
        : player),
    };

    const firstRoad = validRoadEdges(state.board, "p1")[0]!;
    state = applyGameCommand(state, { id: "paid-road", type: "buildRoad", actorId: "p1", edgeId: firstRoad });
    expect(state.board.edges.find((edge) => edge.id === firstRoad)?.roadPlayerId).toBe("p1");
    expect(state.players[0]!.remainingPieces.roads).toBe(12);

    const settlementVertex = validSettlementVertices(state.board, "p1", { setup: true })[0]!;
    const connectingEdge = state.board.edges.find((edge) => edge.vertexIds.includes(settlementVertex) && edge.roadPlayerId === null)!;
    state = {
      ...state,
      board: {
        ...state.board,
        edges: state.board.edges.map((edge) => edge.id === connectingEdge.id ? { ...edge, roadPlayerId: "p1" } : edge),
      },
    };
    state = applyGameCommand(state, { id: "paid-settlement", type: "buildSettlement", actorId: "p1", vertexId: settlementVertex });
    expect(state.board.vertices.find((vertex) => vertex.id === settlementVertex)?.building?.playerId).toBe("p1");

    state = applyGameCommand(state, { id: "upgrade", type: "upgradeCity", actorId: "p1", vertexId: settlementVertex });
    expect(state.board.vertices.find((vertex) => vertex.id === settlementVertex)?.building?.kind).toBe("city");

    const deckSize = state.developmentDeck.length;
    state = applyGameCommand(state, { id: "buy-card", type: "buyDevelopmentCard", actorId: "p1" }, { random: () => 0 });
    expect(state.developmentDeck).toHaveLength(deckSize - 1);
    expect(state.players[0]!.developmentCards).toHaveLength(1);
    expect(state.events.at(-1)?.type).toBe("developmentCardBought");
  });

  it("collects mandatory discards before robber movement", () => {
    const setup = completeSetup().state;
    const funded = {
      ...setup,
      players: setup.players.map((player) => ({
        ...player,
        resources: player.id === "p2" ? { wood: 8, brick: 0, wool: 0, grain: 0, ore: 0 } : emptyResources(),
      })),
    };
    const rolled = applyGameCommand(
      funded,
      { id: "discard-roll", type: "rollDice", actorId: "p1" },
      { random: (() => {
        const values = [0, 0.999];
        return () => values.shift() ?? 0;
      })() },
    );
    expect(rolled.phase).toBe("discard");
    expect(rolled.pendingDiscards).toEqual({ p2: 4 });
    expect(() => applyGameCommand(rolled, {
      id: "bad-discard",
      type: "discardResources",
      actorId: "p2",
      resources: { wood: 3, brick: 0, wool: 0, grain: 0, ore: 0 },
    })).toThrow("Discard exactly 4 cards");

    const discarded = applyGameCommand(rolled, {
      id: "valid-discard",
      type: "discardResources",
      actorId: "p2",
      resources: { wood: 4, brick: 0, wool: 0, grain: 0, ore: 0 },
    });
    expect(discarded.players[1]!.resources.wood).toBe(4);
    expect(discarded.bank.wood).toBe(23);
    expect(discarded.phase).toBe("robber");
  });

  it("steals a random hidden card from an eligible victim", () => {
    const setup = completeSetup().state;
    const funded = {
      ...setup,
      phase: "robber" as const,
      players: setup.players.map((player) => player.id === "p2"
        ? { ...player, resources: { ...emptyResources(), ore: 1 } }
        : { ...player, resources: emptyResources() }),
    };
    const victimVertex = funded.board.vertices.find((vertex) => vertex.building?.playerId === "p2")!;
    const currentTileId = funded.board.tiles.find((tile) => tile.hasRobber)!.id;
    const targetTileId = victimVertex.tileIds.find((tileId) => tileId !== currentTileId)!;
    const moved = applyGameCommand(funded, {
      id: "steal-card",
      type: "moveRobber",
      actorId: "p1",
      tileId: targetTileId,
      victimId: "p2",
    }, { random: () => 0 });
    expect(moved.players[0]!.resources.ore).toBe(1);
    expect(moved.players[1]!.resources.ore).toBe(0);
    expect(moved.events.at(-1)?.type).toBe("resourceStolen");
  });

  it("uses owned ports for reduced bank trades", () => {
    const setup = completeSetup().state;
    const port = setup.board.ports[0]!;
    const portEdge = setup.board.edges.find((edge) => edge.id === port.edgeId)!;
    const give = port.kind === "generic" ? "wood" : port.kind;
    const board = {
      ...setup.board,
      vertices: setup.board.vertices.map((vertex) => vertex.id === portEdge.vertexIds[0]
        ? { ...vertex, building: { kind: "settlement" as const, playerId: "p1" } }
        : vertex),
    };
    const funded = {
      ...setup,
      board,
      phase: "actions" as const,
      players: setup.players.map((player) => player.id === "p1"
        ? { ...player, resources: { ...emptyResources(), [give]: port.ratio } }
        : player),
    };
    const traded = applyGameCommand(funded, {
      id: "port-trade",
      type: "bankTrade",
      actorId: "p1",
      give,
      receive: give === "ore" ? "wood" : "ore",
      ratio: port.ratio,
    });
    expect(traded.players[0]!.resources[give]).toBe(0);
  });

  it("rejects commands in invalid phases and invalid targets", () => {
    const setup = completeSetup().state;
    expect(() => applyGameCommand(setup, { id: "early-end", type: "endTurn", actorId: "p1" })).toThrow("The turn cannot end now");
    expect(() => applyGameCommand(setup, { id: "early-road", type: "buildRoad", actorId: "p1", edgeId: "missing" })).toThrow(
      "A road cannot be built now",
    );
    const robberState = { ...setup, phase: "robber" as const };
    const currentTileId = robberState.board.tiles.find((tile) => tile.hasRobber)!.id;
    expect(() => applyGameCommand(robberState, {
      id: "same-robber-tile",
      type: "moveRobber",
      actorId: "p1",
      tileId: currentTileId,
      victimId: null,
    })).toThrow("Move the robber to another tile");
    expect(() => applyGameCommand({ ...setup, phase: "finished" as const }, {
      id: "finished-action",
      type: "rollDice",
      actorId: "p1",
    })).toThrow("The game has already finished");
  });
});

describe("player trades and development cards", () => {
  it("opens a targeted trade and transfers resources only after acceptance", () => {
    const setup = completeSetup().state;
    let state: GameState = {
      ...setup,
      phase: "actions" as const,
      players: setup.players.map((player) => ({
        ...player,
        resources: player.id === "p1"
          ? { ...emptyResources(), wood: 2 }
          : player.id === "p2" ? { ...emptyResources(), ore: 1 } : emptyResources(),
      })),
    };
    state = applyGameCommand(state, {
      id: "offer-trade",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    });
    expect(state.trades[0]).toMatchObject({ id: "offer-trade", status: "open", proposerId: "p1" });
    expect(state.players[0]!.resources.wood).toBe(2);

    state = applyGameCommand(state, {
      id: "accept-trade",
      type: "respondTrade",
      actorId: "p2",
      tradeId: "offer-trade",
      response: "accept",
    });
    expect(state.trades[0]!.status).toBe("accepted");
    expect(state.players[0]!.resources).toMatchObject({ wood: 1, ore: 1 });
    expect(state.players[1]!.resources).toMatchObject({ wood: 1, ore: 0 });
  });

  it("plays monopoly only from a previous turn and only once per turn", () => {
    const setup = completeSetup().state;
    const monopolyCard = { id: "monopoly-card", kind: "monopoly" as const, purchasedTurn: 1, revealed: false };
    let state: GameState = {
      ...setup,
      phase: "actions" as const,
      turnNumber: 2,
      players: setup.players.map((player) => ({
        ...player,
        resources: { ...emptyResources(), ore: player.id === "p1" ? 0 : 2 },
        developmentCards: player.id === "p1" ? [monopolyCard] : [],
      })),
    };
    state = applyGameCommand(state, {
      id: "play-monopoly",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: monopolyCard.id,
      resource: "ore",
    });
    expect(state.players[0]!.resources.ore).toBe(4);
    expect(state.players.slice(1).every((player) => player.resources.ore === 0)).toBe(true);
    expect(state.usedDevelopmentCardThisTurn).toBe(true);
    expect(state.players[0]!.developmentCards).toHaveLength(0);
    expect(() => applyGameCommand(state, {
      id: "play-again",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "another-card",
      resource: "wood",
    })).toThrow("one development card");
  });

  it("uses year of plenty from the bank and a knight triggers the robber", () => {
    const setup = completeSetup().state;
    const cards = [
      { id: "plenty", kind: "yearOfPlenty" as const, purchasedTurn: 1, revealed: false },
      { id: "knight", kind: "knight" as const, purchasedTurn: 1, revealed: false },
    ];
    let state: GameState = {
      ...setup,
      phase: "actions" as const,
      turnNumber: 2,
      players: setup.players.map((player) => player.id === "p1"
        ? { ...player, resources: emptyResources(), developmentCards: cards }
        : { ...player, resources: emptyResources() }),
    };
    state = applyGameCommand(state, {
      id: "play-plenty",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "plenty",
      resources: ["grain", "ore"],
    });
    expect(state.players[0]!.resources).toMatchObject({ grain: 1, ore: 1 });

    state = { ...state, usedDevelopmentCardThisTurn: false, turnNumber: 3 };
    state = applyGameCommand(state, {
      id: "play-knight",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "knight",
    });
    expect(state.phase).toBe("robber");
    expect(state.players[0]!.playedKnights).toBe(1);
  });

  it("validates trade contents, recipients and one open proposal at a time", () => {
    const setup = completeSetup().state;
    const base: GameState = {
      ...setup,
      phase: "actions",
      players: setup.players.map((player) => ({
        ...player,
        resources: player.id === "p1"
          ? { ...emptyResources(), wood: 1 }
          : player.id === "p2" ? { ...emptyResources(), ore: 1 } : emptyResources(),
      })),
    };
    expect(() => applyGameCommand(base, {
      id: "empty-trade",
      type: "proposeTrade",
      actorId: "p1",
      offer: emptyResources(),
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    })).toThrow("offered and requested");
    expect(() => applyGameCommand(base, {
      id: "invalid-target",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["unknown"],
    })).toThrow("valid trade recipient");

    const open = applyGameCommand(base, {
      id: "open-trade",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    });
    expect(() => applyGameCommand(open, {
      id: "second-trade",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    })).toThrow("current trade");
    expect(() => applyGameCommand(open, {
      id: "wrong-responder",
      type: "respondTrade",
      actorId: "p3",
      tradeId: "open-trade",
      response: "accept",
    })).toThrow("not a recipient");
    const rejected = applyGameCommand(open, {
      id: "reject-trade",
      type: "respondTrade",
      actorId: "p2",
      tradeId: "open-trade",
      response: "reject",
    });
    expect(rejected.trades[0]!.status).toBe("rejected");
    expect(() => applyGameCommand(rejected, {
      id: "late-response",
      type: "respondTrade",
      actorId: "p2",
      tradeId: "open-trade",
      response: "accept",
    })).toThrow("no longer available");
  });

  it("validates development-card timing, options and free road placement", () => {
    const setup = completeSetup().state;
    const roadCard = { id: "free-roads", kind: "roadBuilding" as const, purchasedTurn: 1, revealed: false };
    const monopolyCard = { id: "mono", kind: "monopoly" as const, purchasedTurn: 1, revealed: false };
    const state: GameState = {
      ...setup,
      phase: "actions",
      turnNumber: 2,
      players: setup.players.map((player) => player.id === "p1"
        ? { ...player, developmentCards: [roadCard, monopolyCard] }
        : player),
    };
    expect(() => applyGameCommand(state, {
      id: "missing-option",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "mono",
    })).toThrow("Choose a resource");
    expect(() => applyGameCommand(state, {
      id: "missing-roads",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "free-roads",
    })).toThrow("Choose one or two road positions");
    const edgeId = validRoadEdges(state.board, "p1")[0]!;
    const played = applyGameCommand(state, {
      id: "free-road",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "free-roads",
      edgeIds: [edgeId],
    });
    expect(played.board.edges.find((edge) => edge.id === edgeId)?.roadPlayerId).toBe("p1");
    expect(played.players[0]!.remainingPieces.roads).toBe(12);
  });

  it("rejects stale trade resources and unusable development cards", () => {
    const setup = completeSetup().state;
    const base: GameState = {
      ...setup,
      phase: "actions",
      turnNumber: 2,
      players: setup.players.map((player) => ({ ...player, resources: emptyResources(), developmentCards: [] })),
    };
    expect(() => applyGameCommand(base, {
      id: "unfunded-trade",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    })).toThrow("Insufficient offered resources");

    const funded: GameState = {
      ...base,
      players: base.players.map((player) => ({
        ...player,
        resources: player.id === "p1"
          ? { ...emptyResources(), wood: 1 }
          : player.id === "p2" ? { ...emptyResources(), ore: 1 } : emptyResources(),
      })),
    };
    const open = applyGameCommand(funded, {
      id: "stale-offer",
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2"],
    });
    const staleProposer: GameState = {
      ...open,
      players: open.players.map((player) => player.id === "p1" ? { ...player, resources: emptyResources() } : player),
    };
    expect(() => applyGameCommand(staleProposer, {
      id: "stale-proposer-response",
      type: "respondTrade",
      actorId: "p2",
      tradeId: "stale-offer",
      response: "accept",
    })).toThrow("proposer no longer has");
    const staleResponder: GameState = {
      ...open,
      players: open.players.map((player) => player.id === "p2" ? { ...player, resources: emptyResources() } : player),
    };
    expect(() => applyGameCommand(staleResponder, {
      id: "stale-responder-response",
      type: "respondTrade",
      actorId: "p2",
      tradeId: "stale-offer",
      response: "accept",
    })).toThrow("responder lacks");
    expect(() => applyGameCommand(base, {
      id: "missing-card",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "missing",
    })).toThrow("was not found");

    const newCardState: GameState = {
      ...base,
      players: base.players.map((player) => player.id === "p1" ? {
        ...player,
        developmentCards: [{ id: "new-knight", kind: "knight", purchasedTurn: 2, revealed: false }],
      } : player),
    };
    expect(() => applyGameCommand(newCardState, {
      id: "new-card",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "new-knight",
    })).toThrow("cannot be played this turn");

    const scarceBankState: GameState = {
      ...base,
      bank: { ...base.bank, grain: 1 },
      players: base.players.map((player) => player.id === "p1" ? {
        ...player,
        developmentCards: [{ id: "scarce-plenty", kind: "yearOfPlenty", purchasedTurn: 1, revealed: false }],
      } : player),
    };
    expect(() => applyGameCommand(scarceBankState, {
      id: "scarce-bank",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "scarce-plenty",
      resources: ["grain", "grain"],
    })).toThrow("bank cannot provide");

    const badRoadState: GameState = {
      ...base,
      players: base.players.map((player) => player.id === "p1" ? {
        ...player,
        developmentCards: [{ id: "bad-roads", kind: "roadBuilding", purchasedTurn: 1, revealed: false }],
      } : player),
    };
    expect(() => applyGameCommand(badRoadState, {
      id: "bad-free-road",
      type: "playDevelopmentCard",
      actorId: "p1",
      cardId: "bad-roads",
      edgeIds: ["missing-edge"],
    })).toThrow("Invalid free road position");
  });
});
