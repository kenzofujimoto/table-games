import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { applyGameCommand, type GameCommand, type GameState } from "../../../src/game/application/game-engine.ts";
import { emptyResources } from "../../../src/game/domain/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resourceSchema = z.enum(["wood", "brick", "wool", "grain", "ore"]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ id: z.uuid(), type: z.literal("placeSettlement"), vertexId: z.string() }),
  z.object({ id: z.uuid(), type: z.literal("placeRoad"), edgeId: z.string() }),
  z.object({ id: z.uuid(), type: z.literal("rollDice") }),
  z.object({ id: z.uuid(), type: z.literal("discardResources"), resources: z.record(resourceSchema, z.number().int().nonnegative()) }),
  z.object({ id: z.uuid(), type: z.literal("moveRobber"), tileId: z.string(), victimId: z.string().nullable() }),
  z.object({ id: z.uuid(), type: z.literal("buildRoad"), edgeId: z.string() }),
  z.object({ id: z.uuid(), type: z.literal("buildSettlement"), vertexId: z.string() }),
  z.object({ id: z.uuid(), type: z.literal("upgradeCity"), vertexId: z.string() }),
  z.object({ id: z.uuid(), type: z.literal("bankTrade"), give: resourceSchema, receive: resourceSchema, ratio: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
  z.object({ id: z.uuid(), type: z.literal("buyDevelopmentCard") }),
  z.object({ id: z.uuid(), type: z.literal("endTurn") }),
]);

const requestSchema = z.object({
  gameId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  command: commandSchema,
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    typeof candidate.version === "number" &&
    Array.isArray(candidate.players) &&
    typeof candidate.board === "object" && candidate.board !== null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json(401, { error: "missing_authorization" });

    const payload = requestSchema.parse(await request.json());
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: "server_not_configured" });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    const server = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const [{ data: gamePlayer, error: playerError }, { data: storedState, error: stateError }] = await Promise.all([
      server.from("game_players").select("id, user_id").eq("game_id", payload.gameId).eq("user_id", authData.user.id).maybeSingle(),
      server.from("game_state").select("version, public_state").eq("game_id", payload.gameId).single(),
    ]);
    if (playerError || !gamePlayer) return json(403, { error: "not_a_game_player" });
    if (stateError || !storedState || !isGameState(storedState.public_state)) return json(404, { error: "game_state_not_found" });
    if (storedState.version !== payload.expectedVersion) return json(409, { error: "version_conflict", version: storedState.version });

    const { data: gamePlayers, error: gamePlayersError } = await server
      .from("game_players")
      .select("id, user_id, seat")
      .eq("game_id", payload.gameId)
      .order("seat");
    if (gamePlayersError || !gamePlayers) return json(500, { error: "players_unavailable" });

    const gamePlayerIds = gamePlayers.map((player) => player.id);
    const [{ data: resources, error: resourcesError }, { data: cards, error: cardsError }] = await Promise.all([
      server.from("player_resources").select("game_player_id, wood, brick, wool, grain, ore").in("game_player_id", gamePlayerIds),
      server.from("player_development_cards").select("id, game_player_id, card_kind, purchased_turn, revealed").in("game_player_id", gamePlayerIds).is("played_at", null),
    ]);
    if (resourcesError || cardsError) return json(500, { error: "private_state_unavailable" });

    const hydrated: GameState = {
      ...storedState.public_state,
      players: storedState.public_state.players.map((player, index) => {
        const gamePlayerId = gamePlayers[index]?.id;
        const resourceRow = resources?.find((row) => row.game_player_id === gamePlayerId);
        return {
          ...player,
          resources: resourceRow ? {
            wood: resourceRow.wood,
            brick: resourceRow.brick,
            wool: resourceRow.wool,
            grain: resourceRow.grain,
            ore: resourceRow.ore,
          } : emptyResources(),
          developmentCards: (cards ?? []).filter((card) => card.game_player_id === gamePlayerId).map((card) => ({
            id: card.id,
            kind: card.card_kind as GameState["players"][number]["developmentCards"][number]["kind"],
            purchasedTurn: card.purchased_turn,
            revealed: card.revealed,
          })),
        };
      }),
    };

    const actorIndex = gamePlayers.findIndex((player) => player.id === gamePlayer.id);
    const actor = hydrated.players[actorIndex];
    if (!actor) return json(403, { error: "player_mapping_failed" });
    const command = { ...payload.command, actorId: actor.id } as GameCommand;
    const next = applyGameCommand(hydrated, command);
    const privateStates = next.players.map((player, index) => ({
      gamePlayerId: gamePlayers[index]?.id,
      resources: player.resources,
    }));
    const publicState: GameState = {
      ...next,
      players: next.players.map((player) => ({ ...player, resources: emptyResources(), developmentCards: [] })),
    };
    const publicEvent = next.events.at(-1) ?? {};

    const { data: committedVersion, error: commitError } = await server.rpc("commit_game_command", {
      p_game_id: payload.gameId,
      p_command_id: payload.command.id,
      p_expected_version: payload.expectedVersion,
      p_next_public_state: publicState,
      p_private_states: privateStates,
      p_action_type: payload.command.type,
      p_actor_player_id: gamePlayer.id,
      p_public_event: publicEvent,
    });
    if (commitError) {
      const conflict = commitError.message.includes("version_conflict");
      return json(conflict ? 409 : 400, { error: conflict ? "version_conflict" : "command_rejected" });
    }

    return json(200, {
      version: committedVersion,
      state: publicState,
      privatePlayer: next.players[actorIndex],
    });
  } catch (error) {
    if (error instanceof z.ZodError) return json(400, { error: "invalid_payload", issues: error.issues });
    const message = error instanceof Error ? error.message : "unknown_error";
    return json(400, { error: "command_rejected", message });
  }
});
