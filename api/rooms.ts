import type { VercelRequest, VercelResponse } from "@vercel/node";

import { getGameSessionService } from "../server/game-session-service-factory.js";
import { handleRoomApi } from "../server/http-api.js";

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  const service = await getGameSessionService();
  const result = await handleRoomApi({
    method: request.method ?? "GET",
    query: { code: queryValue(request.query.code) },
    headers: { authorization: request.headers.authorization },
    body: request.body as unknown,
  }, service);
  response.setHeader("Cache-Control", "no-store");
  response.status(result.status).json(result.body);
}
