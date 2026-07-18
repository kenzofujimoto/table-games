import { describe, expect, it } from "vitest";

import { clientRealtimeMessageSchema } from "../protocol";

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
});
