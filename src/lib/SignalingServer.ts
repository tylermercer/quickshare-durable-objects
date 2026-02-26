import { DurableObject } from "cloudflare:workers";

export class SignalingServer extends DurableObject {
  sessions: Map<WebSocket, { id: string; name: string }> = new Map();

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
  }

  async fetch(request: Request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const [client, server] = new WebSocketPair();
    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket) {
    // @ts-ignore
    ws.accept();

    const id = crypto.randomUUID();
    const name = this.generateName();

    const session = { id, name };
    this.sessions.set(ws, session);

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
      peers,
    }));

    ws.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        this.handleMessage(ws, data);
      } catch (e) {
        console.error("Error handling message:", e);
      }
    });

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
      this.broadcast({
        type: "peer-left",
        id,
      });
    });
  }

  handleMessage(ws: WebSocket, data: any) {
    const session = this.sessions.get(ws);
    if (!session) return;

    switch (data.type) {
      case "signal":
        this.sendToPeer(data.to, {
          type: "signal",
          from: session.id,
          signal: data.signal,
        });
        break;
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
