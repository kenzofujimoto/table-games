import { afterEach, describe, expect, it, vi } from "vitest";

import { RealtimeClient, type WebSocketLike } from "../realtime-client";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  disconnect() { this.readyState = 3; this.onclose?.(); }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("realtime client", () => {
  it("reconnects with backoff and resubscribes using the session token", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new RealtimeClient({
      url: "wss://example.test/api/ws",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const listener = vi.fn();
    const unsubscribe = client.subscribe("ABC234", "s".repeat(32), listener);
    sockets[0]!.open();

    expect(JSON.parse(sockets[0]!.sent[0]!)).toMatchObject({
      type: "subscribe",
      roomCode: "ABC234",
      sessionToken: "s".repeat(32),
    });
    sockets[0]!.disconnect();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(JSON.parse(sockets[1]!.sent[0]!)).toMatchObject({ type: "subscribe", roomCode: "ABC234" });

    unsubscribe();
    sockets[1]!.disconnect();
    vi.advanceTimersByTime(30_000);
    expect(sockets).toHaveLength(2);
  });

  it("delivers valid server events and ignores malformed messages", () => {
    const socket = new FakeSocket();
    const listener = vi.fn();
    const client = new RealtimeClient({
      url: "wss://example.test/api/ws",
      socketFactory: () => socket,
    });
    client.subscribe("ABC234", "s".repeat(32), listener);
    socket.open();
    socket.onmessage?.({ data: "not-json" });
    socket.onmessage?.({ data: JSON.stringify({ type: "roomUpdated", roomCode: "ABC234" }) });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "roomUpdated", roomCode: "ABC234" });
  });

  it("sends chat and heartbeats while reporting protocol and socket failures", () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const onProtocolError = vi.fn();
    const client = new RealtimeClient({
      url: "wss://example.test/api/ws",
      socketFactory: () => socket,
      onProtocolError,
    });
    client.subscribe("ABC234", "s".repeat(32), vi.fn());
    expect(() => client.sendChat("ABC234", "s".repeat(32), "client-1", "Olá")).toThrow("not available");
    socket.open();
    client.sendChat("ABC234", "s".repeat(32), "client-1", "Olá");
    vi.advanceTimersByTime(20_000);
    socket.onmessage?.({ data: "not-json" });
    socket.onerror?.();

    expect(socket.sent.map((value) => JSON.parse(value) as { type: string }).map((message) => message.type))
      .toEqual(["subscribe", "chat", "ping"]);
    expect(onProtocolError).toHaveBeenCalledTimes(2);
  });

  it("uses the browser WebSocket constructor by default", () => {
    const sockets: FakeSocket[] = [];
    class BrowserFakeSocket extends FakeSocket {
      constructor(readonly url: string) {
        super();
        sockets.push(this);
      }
    }
    vi.stubGlobal("WebSocket", BrowserFakeSocket);
    const client = new RealtimeClient({ url: "wss://example.test/api/ws" });
    const unsubscribe = client.subscribe("ABC234", "s".repeat(32), vi.fn());
    expect(sockets[0]).toMatchObject({ url: "wss://example.test/api/ws" });
    unsubscribe();
  });
});
