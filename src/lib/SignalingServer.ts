import { DurableObject } from "cloudflare:workers";

export class SignalingServer extends DurableObject {
  sessions: Map<WebSocket, { id: string; name: string; lastSeen: number }> = new Map();
  private checkIntervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") || "default";

    const [client, server] = new WebSocketPair();
    await this.handleSession(server, roomId);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket, roomId: string) {
    // @ts-ignore
    ws.accept();

    const id = crypto.randomUUID();
    const name = this.generateName();

    const session = { id, name, lastSeen: Date.now() };
    this.sessions.set(ws, session);
    this.startCheckInterval();

    // Notify others in the same group
    this.broadcast({
      type: "peer-joined",
      peer: { id, name },
    }, ws);

    // Send current peers to the new peer
    const peers = Array.from(this.sessions.values())
      .filter(s => s.id !== id)
      .map(s => ({ id: s.id, name: s.name }));

    ws.send(JSON.stringify({
      type: "welcome",
      id,
      name,
      roomId,
      peers,
    }));

    ws.addEventListener("message", async (msg) => {
      try {
        const currentSession = this.sessions.get(ws);
        if (currentSession) {
          currentSession.lastSeen = Date.now();
        }
        const data = JSON.parse(msg.data as string);
        this.handleMessage(ws, data);
      } catch (e) {
        console.error("Error handling message:", e);
      }
    });

    ws.addEventListener("close", () => {
      if (this.sessions.has(ws)) {
        this.sessions.delete(ws);
        this.broadcast({
          type: "peer-left",
          id,
        });
      }
      if (this.sessions.size === 0) {
        this.stopCheckInterval();
      }
    });
  }

  handleMessage(ws: WebSocket, data: any) {
    const session = this.sessions.get(ws);
    if (!session) return;

    switch (data.type) {
      case "ping":
        try {
          ws.send(JSON.stringify({ type: "pong" }));
        } catch (e) {
          // ignore send error
        }
        break;
      case "signal":
        this.sendToPeer(data.to, {
          type: "signal",
          from: session.id,
          signal: data.signal,
        });
        break;
    }
  }

  startCheckInterval() {
    if (!this.checkIntervalTimer) {
      this.checkIntervalTimer = setInterval(() => {
        this.checkDeadSessions();
      }, 1000);
    }
  }

  stopCheckInterval() {
    if (this.checkIntervalTimer !== null) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }
  }

  checkDeadSessions() {
    const now = Date.now();
    const TIMEOUT = 10000; // 10 seconds
    for (const [ws, session] of Array.from(this.sessions.entries())) {
      if (now - session.lastSeen > TIMEOUT) {
        this.sessions.delete(ws);
        try {
          ws.close();
        } catch (e) {
          // ignore
        }
        this.broadcast({
          type: "peer-left",
          id: session.id,
        });
      }
    }
    if (this.sessions.size === 0) {
      this.stopCheckInterval();
    }
  }

  broadcast(message: any, excludeWs?: WebSocket) {
    const msgString = JSON.stringify(message);
    for (const [ws, session] of this.sessions.entries()) {
      if (ws !== excludeWs) {
        try {
          ws.send(msgString);
        } catch (e) {
          this.sessions.delete(ws);
        }
      }
    }
  }

  sendToPeer(peerId: string, message: any) {
    const msgString = JSON.stringify(message);
    for (const [ws, session] of this.sessions.entries()) {
      if (session.id === peerId) {
        try {
          ws.send(msgString);
        } catch (e) {
          this.sessions.delete(ws);
        }
        break;
      }
    }
  }

  generateName() {
    const boats = ["Schooner", "Cutter", "Sloop", "Yacht", "Canoe", "Kayak", "Galleon", "Frigate"];
    const adjectives = ["Swift", "Sturdy", "Nimble", "Majestic", "Silent", "Brave", "Ancient", "Modern"];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${boats[Math.floor(Math.random() * boats.length)]}`;
  }
}
