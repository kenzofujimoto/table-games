import { GameSessionService } from "./game-session-service.js";
import { getOnlineStore } from "./online-store-factory.js";

let servicePromise: Promise<GameSessionService> | null = null;

export function getGameSessionService(): Promise<GameSessionService> {
  servicePromise ??= getOnlineStore().then((store) => new GameSessionService(store));
  return servicePromise;
}
