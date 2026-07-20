import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createGame } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { DevelopmentModal, TradeModal } from "../GameModals";

const players: Player[] = ["p1", "p2", "p3"].map((id) => ({
  id,
  name: id,
  color: "ember",
  avatar: "compass",
  connected: true,
  ready: true,
  resources: emptyResources(),
  remainingPieces: { roads: 15, settlements: 5, cities: 4 },
  developmentCards: [],
  playedKnights: 0,
  revealedVictoryPoints: 0,
}));

describe("game action modals", () => {
  it("lets the active viewer buy a development card", async () => {
    const state = createGame({ id: "game-1", roomCode: "ABC234", seed: "seed", players, targetScore: 10 });
    state.phase = "actions";
    state.players[0]!.resources = { ...emptyResources(), wool: 1, grain: 1, ore: 1 };
    const dispatch = vi.fn().mockResolvedValue(state);
    render(<DevelopmentModal state={state} viewerId="p1" dispatch={dispatch} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Comprar carta/i }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "buyDevelopmentCard",
      actorId: "p1",
    }));
  });

  it("prevents a recipient from accepting resources they do not own", () => {
    const state = createGame({ id: "game-trade", roomCode: "TRADE2", seed: "trade", players, targetScore: 10 });
    state.phase = "actions";
    state.players[0]!.resources = { ...emptyResources(), wood: 1 };
    state.trades = [{
      id: "trade-1",
      proposerId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2", "p3"],
      status: "open",
      responderId: null,
      rejectedPlayerIds: [],
    }];

    render(<TradeModal state={state} viewerId="p2" dispatch={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Aceitar/i })).toBeDisabled();
    expect(screen.getByText(/Você precisa de 1 Minério/i)).toBeInTheDocument();
  });

  it("lets the proposer cancel an unanswered request", async () => {
    const state = createGame({ id: "game-cancel", roomCode: "CANCEL", seed: "cancel", players, targetScore: 10 });
    state.phase = "actions";
    state.players[0]!.resources = { ...emptyResources(), wood: 1 };
    state.trades = [{
      id: "trade-cancel",
      proposerId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2", "p3"],
      status: "open",
      responderId: null,
      rejectedPlayerIds: [],
    }];
    const dispatch = vi.fn().mockResolvedValue(state);

    render(<TradeModal state={state} viewerId="p1" dispatch={dispatch} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Cancelar proposta/i }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "cancelTrade",
      actorId: "p1",
      tradeId: "trade-cancel",
    }));
  });

  it("offers configurable bundles to every other explorer", async () => {
    const state = createGame({ id: "game-bundle", roomCode: "BUNDLE", seed: "bundle", players, targetScore: 10 });
    state.phase = "actions";
    state.players[0]!.resources = { ...emptyResources(), wood: 3 };
    const dispatch = vi.fn().mockResolvedValue(state);
    const user = userEvent.setup();

    render(<TradeModal state={state} viewerId="p1" dispatch={dispatch} onClose={vi.fn()} />);
    const offeredAmount = screen.getByRole("spinbutton", { name: /Quantidade oferecida/i });
    await user.clear(offeredAmount);
    await user.type(offeredAmount, "2");
    await user.click(screen.getByRole("button", { name: /Enviar proposta/i }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "proposeTrade",
      actorId: "p1",
      offer: { ...emptyResources(), wood: 2 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2", "p3"],
    }));
  });
});
