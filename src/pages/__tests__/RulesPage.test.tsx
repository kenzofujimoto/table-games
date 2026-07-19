import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { RulesPage } from "../RulesPage";

describe("RulesPage", () => {
  it("documents resources, trades, ports, development cards and disconnects", () => {
    render(<MemoryRouter><RulesPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Materiais e produção" })).toBeInTheDocument();
    expect(screen.getByText(/madeira vem das florestas/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trocas e portos" })).toBeInTheDocument();
    expect(screen.getByText(/quatro portos gerais permitem 3:1/i)).toBeInTheDocument();
    expect(screen.getByText(/um porto 2:1 para cada material/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cartas de desenvolvimento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quedas e reconexão" })).toBeInTheDocument();
    expect(screen.getByText(/piloto automático preserva o assento/i)).toBeInTheDocument();
  });
});
