import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createGame } from "@/game/application/game-engine";
import { makePlayer } from "@/game/domain/__tests__/fixtures";

import { HexBoard } from "../HexBoard";

describe("HexBoard", () => {
  it("renders all bank-trade ports around the coast", () => {
    const state = createGame({
      id: "game-board",
      roomCode: "BOARD2",
      seed: "visible-ports",
      players: [makePlayer("p1"), makePlayer("p2")],
      targetScore: 10,
    });

    render(<HexBoard
      state={state}
      validVertexIds={new Set()}
      validEdgeIds={new Set()}
      selectableTiles={false}
      onVertex={vi.fn()}
      onEdge={vi.fn()}
      onTile={vi.fn()}
    />);

    expect(screen.getAllByLabelText(/^Porto /)).toHaveLength(9);
    expect(screen.getAllByLabelText("Porto geral 3 por 1")).toHaveLength(4);
    expect(screen.getByLabelText("Porto de madeira 2 por 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Porto de tijolo 2 por 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Porto de lã 2 por 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Porto de trigo 2 por 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Porto de minério 2 por 1")).toBeInTheDocument();
  });

  it("uses original image textures for every terrain", () => {
    const state = createGame({
      id: "game-textures",
      roomCode: "TERRA2",
      seed: "visible-textures",
      players: [makePlayer("p1"), makePlayer("p2")],
      targetScore: 10,
    });

    const { container } = render(<HexBoard
      state={state}
      validVertexIds={new Set()}
      validEdgeIds={new Set()}
      selectableTiles={false}
      onVertex={vi.fn()}
      onEdge={vi.fn()}
      onTile={vi.fn()}
    />);

    for (const terrain of ["forest", "hills", "pasture", "fields", "mountains", "desert"]) {
      expect(container.querySelector(`pattern#terrain-${terrain} image[href="/textures/${terrain}.webp"]`)).not.toBeNull();
    }
  });

  it("keeps an ocean backdrop behind the board during zoom and drag", () => {
    const state = createGame({
      id: "game-camera",
      roomCode: "CAMERA",
      seed: "safe-camera",
      players: [makePlayer("p1"), makePlayer("p2")],
      targetScore: 10,
    });

    const { container } = render(<HexBoard
      state={state}
      validVertexIds={new Set()}
      validEdgeIds={new Set()}
      selectableTiles={false}
      onVertex={vi.fn()}
      onEdge={vi.fn()}
      onTile={vi.fn()}
    />);

    const svg = screen.getByRole("img", { name: /Tabuleiro hexagonal/i });
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(container.querySelector(".board-ocean-backdrop")).toBeInTheDocument();
  });
});
