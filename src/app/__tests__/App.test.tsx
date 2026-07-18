import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "../App";

describe("Auren application shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => cleanup());

  it("presents the original game identity and primary journeys", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Rotas do Horizonte/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Criar partida/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Entrar em partida/i })).toBeInTheDocument();
    expect(screen.getByText(/explore, negocie e construa/i)).toBeInTheDocument();
  });

  it("collects a guest profile before room creation", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: /Criar partida/i }));
    expect(screen.getByRole("heading", { name: /Seu explorador/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Apelido/i), "Kenzo");
    await user.click(screen.getByRole("button", { name: /Continuar como convidado/i }));
    expect(await screen.findByRole("heading", { name: /Criar nova expedição/i })).toBeInTheDocument();
  });

  it("exposes a concise rules reference as a direct route", () => {
    window.history.pushState({}, "", "/regras");
    render(<App />);
    expect(screen.getByRole("heading", { name: /Regras de bordo/i })).toBeInTheDocument();
    expect(screen.getByText(/Estrada/i)).toBeInTheDocument();
    expect(screen.getByText(/Maior rota/i)).toBeInTheDocument();
  });
});
