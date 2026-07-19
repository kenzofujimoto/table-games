import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { repository, useAppStore } from "../store";
import { createGame } from "@/game/application/game-engine";
import { makePlayer } from "@/game/domain/__tests__/fixtures";
import { emptyResources } from "@/game/domain/types";
import type { PlayerProfile, RoomSettings } from "@/multiplayer/types";

import { App } from "../App";

const settings: RoomSettings = {
  visibility: "private",
  maxPlayers: 3,
  targetScore: 10,
  turnSeconds: 120,
  mapShape: "classic",
  terrainDistribution: "random",
  numberDistribution: "random",
  ports: "random",
  previewMap: true,
  allowSpectators: false,
  chatEnabled: true,
  confirmEndTurn: true,
};

const host: PlayerProfile = {
  id: "host-player",
  name: "Anfitrião",
  color: "ember",
  avatar: "compass",
  crest: "sun",
};

describe("Auren application shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
    useAppStore.setState({ profile: null, room: null, game: null, error: null });
  });

  afterEach(() => cleanup());

  it("presents the original game identity and primary journeys", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Rotas do Horizonte/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Criar partida/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Entrar em partida/i })).toBeInTheDocument();
    expect(screen.getByText(/explore, negocie e construa/i)).toBeInTheDocument();
    expect(screen.getByText("2–4 exploradores")).toBeInTheDocument();
    expect(screen.getByText(/online pela Vercel gratuita/i)).toBeInTheDocument();
    expect(screen.queryByText(/Supabase/i)).not.toBeInTheDocument();
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
    expect(screen.getByText("Estrada", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Maior rota/i })).toBeInTheDocument();
  });

  it("copies an invite URL that routes guests through room registration", async () => {
    const room = await repository.createRoom({ name: "Mesa privada", host, settings });
    useAppStore.setState({ profile: host, room });
    window.history.pushState({}, "", `/sala/${room.code}`);
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<App />);
    expect(await screen.findByText("Faltam 2 jogadores")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Copiar link do convite/i }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/entrar?code=${room.code}`);
  });

  it("uses singular capacity copy when one player is missing", async () => {
    const room = await repository.createRoom({ name: "Mesa privada", host, settings });
    const joinedRoom = await repository.joinRoom(room.code, {
      id: "invited-player",
      name: "Convidado",
      color: "tide",
      avatar: "compass",
      crest: "wave",
    });
    useAppStore.setState({ profile: host, room: joinedRoom });
    window.history.pushState({}, "", `/sala/${room.code}`);

    render(<App />);

    expect(await screen.findByText("Falta 1 jogador")).toBeInTheDocument();
  });

  it("preserves an invite code through guest profile creation and joins the private room", async () => {
    const room = await repository.createRoom({ name: "Mesa privada", host, settings });
    window.history.pushState({}, "", `/entrar?code=${room.code}`);
    const user = userEvent.setup();

    render(<App />);
    expect(await screen.findByRole("heading", { name: /Seu explorador/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Apelido/i), "Convidado");
    await user.click(screen.getByRole("button", { name: /Continuar como convidado/i }));

    const codeInput = await screen.findByRole("textbox", { name: /Código da sala/i });
    expect(codeInput).toHaveValue(room.code);
    await user.click(screen.getByRole("button", { name: /Entrar na sala/i }));
    expect(await screen.findByText("Convidado", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(useAppStore.getState().profile?.color).toBe("tide");
  });

  it("opens a trade request automatically for every pending recipient", async () => {
    const game = createGame({
      id: "game-popup",
      roomCode: "POPUP2",
      seed: "popup-trade",
      players: [makePlayer("p1"), makePlayer("p2"), makePlayer("p3")],
      targetScore: 10,
    });
    game.phase = "actions";
    game.players[0]!.resources = { ...emptyResources(), wood: 1 };
    game.players[1]!.resources = { ...emptyResources(), ore: 1 };
    game.trades = [{
      id: "popup-trade",
      proposerId: "p1",
      offer: { ...emptyResources(), wood: 1 },
      request: { ...emptyResources(), ore: 1 },
      targetPlayerIds: ["p2", "p3"],
      status: "open",
      responderId: null,
      rejectedPlayerIds: [],
    }];
    const viewer: PlayerProfile = {
      id: "p2",
      name: "Convidado",
      color: "tide",
      avatar: "compass",
      crest: "wave",
    };
    useAppStore.setState({ profile: viewer, game });
    window.history.pushState({}, "", "/jogo/game-popup");

    render(<App />);

    expect(await screen.findByRole("dialog", { name: /Solicitação de troca/i })).toBeInTheDocument();
    expect(screen.getByText(/Player p1 oferece/i)).toBeInTheDocument();
  });
});
