import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createGame } from "@/game/application/game-engine";
import { emptyResources, type Player } from "@/game/domain/types";

import { DevelopmentModal } from "../GameModals";

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
});
