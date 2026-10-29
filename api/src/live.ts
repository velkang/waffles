import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
export class LiveHub extends DurableObject<Env> {
  async fetch(request: Request) {
    if (request.method === "POST") {
      const events = (await request.json()) as {
        sequence: number;
        type: string;
        mint?: string;
        wallet?: string;
        data: unknown;
      }[];
      for (const event of events)
        for (const socket of this.ctx.getWebSockets()) {
          const topics = socket.deserializeAttachment() as string[];
          if (
            topics.includes("launches") ||
            (event.mint && topics.includes(`token:${event.mint}`)) ||
            (event.wallet && topics.includes(`portfolio:${event.wallet}`))
          ) {
            try {
              socket.send(JSON.stringify(event));
            } catch {
              socket.close(1011, "Reconnect to resynchronize");
            }
          }
        }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const topics = (
      new URL(request.url).searchParams.get("topic") || "launches"
    ).split(",");
    if (
      topics.length > 16 ||
      topics.some(
        (t) =>
          !/^launches$|^(token|portfolio):[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t),
      )
    )
      return new Response("Invalid topics", { status: 400 });
    const pair = new WebSocketPair();
    const client = pair[0],
      server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(topics);
    server.send(
      JSON.stringify({ type: "stream.ready", data: { resync: true } }),
    );
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") socket.send("pong");
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }
}
