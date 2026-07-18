import { z } from "zod";

import type { GameCommand, GameState } from "@/game/application/game-engine";
import { getSupabaseClient } from "@/shared/lib/supabase";

const responseSchema = z.object({
  version: z.number().int().nonnegative(),
  state: z.unknown(),
  privatePlayer: z.unknown(),
});

const invocationSchema = z.object({
  data: z.unknown().nullable(),
  error: z.unknown().nullable(),
});

export interface CommandResult {
  version: number;
  publicState: GameState;
  privatePlayer: GameState["players"][number];
}

export async function submitSupabaseCommand(
  gameId: string,
  expectedVersion: number,
  command: GameCommand,
): Promise<CommandResult> {
  const client = getSupabaseClient();
  const rawResponse: unknown = await client.functions.invoke<unknown>("game-command", {
    body: { gameId, expectedVersion, command },
  });
  const invocation = invocationSchema.parse(rawResponse);
  if (invocation.error) {
    const errorMessage = z.object({ message: z.string() }).safeParse(invocation.error);
    throw new Error(`Server rejected the game command: ${errorMessage.success ? errorMessage.data.message : "unknown error"}`);
  }
  const parsed = responseSchema.parse(invocation.data);
  return {
    version: parsed.version,
    publicState: parsed.state as GameState,
    privatePlayer: parsed.privatePlayer as GameState["players"][number],
  };
}
