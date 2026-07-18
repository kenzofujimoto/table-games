import { createBrowserLocalRepository } from "./local-game-repository";
import { createBrowserOnlineRepository } from "./online-game-repository";
import type { GameRepository } from "./types";

export function createBrowserGameRepository(): GameRepository {
  const requestedMode = import.meta.env.VITE_MULTIPLAYER_MODE as string | undefined;
  return import.meta.env.PROD || requestedMode === "online"
    ? createBrowserOnlineRepository()
    : createBrowserLocalRepository();
}
