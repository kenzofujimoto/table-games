import { GameSessionService } from "./game-session-service";
import { getOnlineStore } from "./online-store-factory";

let servicePromise: Promise<GameSessionService> | null = null;

export function getGameSessionService(): Promise<GameSessionService> {
  servicePromise ??= getOnlineStore().then((store) => new GameSessionService(store));
  return servicePromise;
}
