import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { GameLogo } from "../GameLogo";

describe("GameLogo", () => {
  it("identifies the multi-game hub instead of a single game", () => {
    render(<MemoryRouter><GameLogo /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Table Games — início" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Símbolo Table Games" })).toHaveAttribute("src", "/brand/table-games-mark.svg");
    expect(screen.getByText("TABLE GAMES")).toBeInTheDocument();
    expect(screen.getByText("JOGUE JUNTO")).toBeInTheDocument();
  });
});
