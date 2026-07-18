import { z } from "zod";

import { playerProfileSchema, roomSettingsSchema } from "./types";

const resourceSchema = z.enum(["wood", "brick", "wool", "grain", "ore"]);
const resourceCountsSchema = z.object({
  wood: z.number().int().nonnegative(),
  brick: z.number().int().nonnegative(),
  wool: z.number().int().nonnegative(),
  grain: z.number().int().nonnegative(),
  ore: z.number().int().nonnegative(),
}).strict();

const commandIdSchema = z.string().min(1).max(100);
const vertexIdSchema = z.string().min(1).max(100);
const edgeIdSchema = z.string().min(1).max(100);

export const clientGameCommandSchema = z.discriminatedUnion("type", [
  z.object({ id: commandIdSchema, type: z.literal("placeSettlement"), vertexId: vertexIdSchema }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("placeRoad"), edgeId: edgeIdSchema }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("rollDice") }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("discardResources"), resources: resourceCountsSchema }).strict(),
  z.object({
    id: commandIdSchema,
    type: z.literal("moveRobber"),
    tileId: z.string().min(1).max(100),
    victimId: z.string().min(1).max(100).nullable(),
  }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("buildRoad"), edgeId: edgeIdSchema }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("buildSettlement"), vertexId: vertexIdSchema }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("upgradeCity"), vertexId: vertexIdSchema }).strict(),
  z.object({
    id: commandIdSchema,
    type: z.literal("bankTrade"),
    give: resourceSchema,
    receive: resourceSchema,
    ratio: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("buyDevelopmentCard") }).strict(),
  z.object({
    id: commandIdSchema,
    type: z.literal("playDevelopmentCard"),
    cardId: z.string().min(1).max(100),
    resource: resourceSchema.optional(),
    resources: z.tuple([resourceSchema, resourceSchema]).optional(),
    edgeIds: z.union([z.tuple([edgeIdSchema]), z.tuple([edgeIdSchema, edgeIdSchema])]).optional(),
  }).strict(),
  z.object({
    id: commandIdSchema,
    type: z.literal("proposeTrade"),
    offer: resourceCountsSchema,
    request: resourceCountsSchema,
    targetPlayerIds: z.array(z.string().min(1).max(100)).min(1).max(3),
  }).strict(),
  z.object({
    id: commandIdSchema,
    type: z.literal("respondTrade"),
    tradeId: z.string().min(1).max(100),
    response: z.enum(["accept", "reject"]),
  }).strict(),
  z.object({ id: commandIdSchema, type: z.literal("endTurn") }).strict(),
]);

export type ClientGameCommand = z.infer<typeof clientGameCommandSchema>;

const roomCodeSchema = z.string().trim().length(6).transform((value) => value.toUpperCase());
const sessionTokenSchema = z.string().min(32).max(256);

export const roomApiRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(48),
    host: playerProfileSchema,
    settings: roomSettingsSchema,
  }).strict(),
  z.object({ action: z.literal("join"), roomCode: roomCodeSchema, profile: playerProfileSchema }).strict(),
  z.object({ action: z.literal("ready"), roomCode: roomCodeSchema, ready: z.boolean() }).strict(),
  z.object({ action: z.literal("start"), roomCode: roomCodeSchema }).strict(),
]);

export const gameApiRequestSchema = z.object({
  gameId: z.string().min(1).max(100),
  expectedVersion: z.number().int().nonnegative(),
  command: clientGameCommandSchema,
}).strict();

export const clientRealtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), roomCode: roomCodeSchema, sessionToken: sessionTokenSchema }).strict(),
  z.object({
    type: z.literal("command"),
    gameId: z.string().min(1).max(100),
    expectedVersion: z.number().int().nonnegative(),
    sessionToken: sessionTokenSchema,
    command: clientGameCommandSchema,
  }).strict(),
  z.object({
    type: z.literal("chat"),
    roomCode: roomCodeSchema,
    sessionToken: sessionTokenSchema,
    clientMessageId: z.string().min(1).max(100),
    message: z.string().trim().min(1).max(280),
  }).strict(),
  z.object({ type: z.literal("ping"), sentAt: z.number().nonnegative() }).strict(),
]);

export type ClientRealtimeMessage = z.infer<typeof clientRealtimeMessageSchema>;

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  clientMessageId: z.string().min(1),
  roomCode: roomCodeSchema,
  playerId: z.string().min(1),
  playerName: z.string().min(1).max(24),
  message: z.string().min(1).max(280),
  createdAt: z.string().min(1),
}).strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const serverRealtimeMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connected"), roomCode: roomCodeSchema, playerId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("roomUpdated"), roomCode: roomCodeSchema }).strict(),
  z.object({
    type: z.literal("gameUpdated"),
    roomCode: roomCodeSchema,
    gameId: z.string().min(1),
    version: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    type: z.literal("presence"),
    roomCode: roomCodeSchema,
    playerIds: z.array(z.string().min(1)).max(4),
  }).strict(),
  z.object({ type: z.literal("chat"), payload: chatMessageSchema }).strict(),
  z.object({ type: z.literal("error"), code: z.string().min(1), message: z.string().min(1) }).strict(),
  z.object({ type: z.literal("pong"), sentAt: z.number().nonnegative() }).strict(),
]);

export type ServerRealtimeMessage =
  | { type: "connected"; roomCode: string; playerId: string }
  | { type: "roomUpdated"; roomCode: string }
  | { type: "gameUpdated"; roomCode: string; gameId: string; version: number }
  | { type: "presence"; roomCode: string; playerIds: string[] }
  | { type: "chat"; payload: ChatMessage }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; sentAt: number };
