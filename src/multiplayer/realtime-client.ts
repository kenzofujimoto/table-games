import {
  serverRealtimeMessageSchema,
  type ServerRealtimeMessage,
} from "./protocol";

const OPEN_STATE = 1;
const INITIAL_RECONNECT_DELAY = 1_000;
const MAX_RECONNECT_DELAY = 30_000;
const HEARTBEAT_INTERVAL = 20_000;

export interface WebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(value: string): void;
  close(): void;
}

interface RealtimeClientOptions {
  url: string;
  socketFactory?: (url: string) => WebSocketLike;
  onProtocolError?: (error: Error) => void;
}

interface ActiveSubscription {
  roomCode: string;
  sessionToken: string;
  listener: (message: ServerRealtimeMessage) => void;
}

function browserSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as WebSocketLike;
}

export class RealtimeClient {
  private readonly url: string;
  private readonly socketFactory: (url: string) => WebSocketLike;
  private readonly onProtocolError: (error: Error) => void;
  private active: ActiveSubscription | null = null;
  private socket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private stopped = true;

  constructor(options: RealtimeClientOptions) {
    this.url = options.url;
    this.socketFactory = options.socketFactory ?? browserSocketFactory;
    this.onProtocolError = options.onProtocolError ?? ((error) => console.warn("Realtime protocol error", error));
  }

  subscribe(
    roomCode: string,
    sessionToken: string,
    listener: (message: ServerRealtimeMessage) => void,
  ): () => void {
    this.stop();
    this.active = { roomCode: roomCode.toUpperCase(), sessionToken, listener };
    this.stopped = false;
    this.connect();
    return () => this.stop();
  }

  sendChat(roomCode: string, sessionToken: string, clientMessageId: string, message: string): void {
    if (!this.socket || this.socket.readyState !== OPEN_STATE) throw new Error("Realtime connection is not available");
    this.socket.send(JSON.stringify({ type: "chat", roomCode, sessionToken, clientMessageId, message }));
  }

  private connect(): void {
    if (this.stopped || !this.active) return;
    const socket = this.socketFactory(this.url);
    this.socket = socket;
    socket.onopen = () => {
      if (!this.active || this.stopped) return;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      socket.send(JSON.stringify({
        type: "subscribe",
        roomCode: this.active.roomCode,
        sessionToken: this.active.sessionToken,
      }));
      this.startHeartbeat(socket);
    };
    socket.onmessage = (event) => {
      if (!this.active || this.stopped) return;
      try {
        const parsed = serverRealtimeMessageSchema.parse(JSON.parse(event.data) as unknown);
        this.active.listener(parsed);
      } catch (error) {
        this.onProtocolError(error instanceof Error ? error : new Error("Invalid realtime payload"));
      }
    };
    socket.onerror = () => {
      this.onProtocolError(new Error("Realtime socket error"));
    };
    socket.onclose = () => {
      this.stopHeartbeat();
      if (this.stopped) return;
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private startHeartbeat(socket: WebSocketLike): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket.readyState === OPEN_STATE) {
        socket.send(JSON.stringify({ type: "ping", sentAt: Date.now() }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private stop(): void {
    this.stopped = true;
    this.active = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    if (this.socket) this.socket.close();
    this.socket = null;
  }
}
