import { describe, expect, it } from "vitest";

import {
  clientGameCommandSchema,
  clientRealtimeMessageSchema,
  gameApiRequestSchema,
  roomApiRequestSchema,
  serverRealtimeMessageSchema,
} from "../protocol";

describe("online multiplayer protocol", () => {
  it("accepts authenticated subscriptions, commands, chat and heartbeats", () => {
    const subscription = clientRealtimeMessageSchema.parse({
      type: "subscribe",
      roomCode: "abc234",
      sessionToken: "s".repeat(32),
    });
    const command = clientRealtimeMessageSchema.parse({
      type: "command",
      gameId: "game-1",
      expectedVersion: 4,
      sessionToken: "s".repeat(32),
      command: { id: "command-1", type: "rollDice" },
    });
    const chat = clientRealtimeMessageSchema.parse({
      type: "chat",
      roomCode: "ABC234",
      sessionToken: "s".repeat(32),
      clientMessageId: "message-1",
      message: "Vamos abrir novas rotas?",
    });
    const heartbeat = clientRealtimeMessageSchema.parse({ type: "ping", sentAt: 1234 });

    expect(subscription).toMatchObject({ type: "subscribe", roomCode: "ABC234" });
    expect(command).toMatchObject({ type: "command", expectedVersion: 4 });
    expect(chat).toMatchObject({ type: "chat", message: "Vamos abrir novas rotas?" });
    expect(heartbeat).toEqual({ type: "ping", sentAt: 1234 });
  });

  it("accepts proposer cancellation for an open player trade", () => {
    expect(clientGameCommandSchema.parse({
      id: "cancel-trade-1",
      type: "cancelTrade",
      tradeId: "trade-1",
    })).toEqual({ id: "cancel-trade-1", type: "cancelTrade", tradeId: "trade-1" });
  });

  it("rejects actor spoofing and malformed payloads", () => {
    const spoofedCommand = clientRealtimeMessageSchema.safeParse({
      type: "command",
      gameId: "game-1",
      expectedVersion: 0,
      sessionToken: "s".repeat(32),
      command: { id: "command-1", type: "rollDice", actorId: "another-player" },
    });
    const oversizedChat = clientRealtimeMessageSchema.safeParse({
      type: "chat",
      roomCode: "ABC234",
      sessionToken: "s".repeat(32),
      clientMessageId: "message-1",
      message: "x".repeat(281),
    });
    const negativeVersion = clientRealtimeMessageSchema.safeParse({
      type: "command",
      gameId: "game-1",
      expectedVersion: -1,
      sessionToken: "s".repeat(32),
      command: { id: "command-1", type: "rollDice" },
    });

    expect(spoofedCommand.success).toBe(false);
    expect(oversizedChat.success).toBe(false);
    expect(negativeVersion.success).toBe(false);
  });

  it("carries scalable presence states instead of a four-player id list", () => {
    const players = Array.from({ length: 12 }, (_, index) => ({
      playerId: `player-${index}`,
      status: index === 0 ? "reconnecting" as const : "online" as const,
      lastSeenAt: "2026-07-18T12:00:00.000Z",
    }));

    expect(serverRealtimeMessageSchema.parse({
      type: "presence",
      roomCode: "ABC234",
      players,
    })).toMatchObject({ type: "presence", players });
  });

  it("accepts an authenticated idempotent timer tick", () => {
    expect(gameApiRequestSchema.parse({
      action: "tick",
      gameId: "game-1",
      expectedVersion: 4,
    })).toEqual({ action: "tick", gameId: "game-1", expectedVersion: 4 });
  });

  it("accepts the selected game when creating a two-player room", () => {
    expect(roomApiRequestSchema.parse({
      action: "create",
      gameKey: "auren",
      name: "Duelo online",
      host: { id: "p1", name: "Lia", color: "ember", avatar: "compass", crest: "sun" },
      settings: {
        visibility: "private",
        maxPlayers: 2,
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
      },
    })).toMatchObject({ action: "create", gameKey: "auren", settings: { maxPlayers: 2 } });
  });
});
