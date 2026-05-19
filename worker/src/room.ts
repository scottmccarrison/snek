/**
 * Room - per-session Durable Object for snek multiplayer.
 *
 * 20Hz alarm-driven tick with fixed dt. Hibernation-safe: SnakeSim
 * serializes to storage on every tick; resume tokens persisted so a
 * hard-refresh reconnects to the same snake. Per-client viewport-culled
 * state broadcast. Idle teardown: when no sockets AND no live tokens,
 * GC the sim and stop scheduling alarms.
 *
 * Modeled on ~/worms/worker/src/room.ts.
 */

import { type ClientMsg, type ServerMsg, isClientMsg } from "../../shared/protocol";
import { tuning } from "../../src/tuning";
import { isValidCode } from "./codegen";
import { isValidAngle, isValidBoolean, isValidColorIdx, normalizeNickname } from "./sanitize";
import { type SimEvent, SnakeSim } from "./sim/snakeSim";

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  PATH_PREFIX?: string;
  DEBUG_LOG?: string;
}

interface SocketAttachment {
  sessionId: string;
  snakeId: string;
  resumeToken: string;
  inputTimestamps: number[];
  welcomeSent: boolean;
}

interface PersistedResumeToken {
  token: string;
  snakeId: string;
  sessionId: string;
  expiresAt: number;
}

const HEX_CHARS = "0123456789abcdef";
function randomHex(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX_CHARS[Math.floor(Math.random() * 16)];
  return s;
}

export class Room {
  private state: DurableObjectState;
  private env: Env;
  private code = "";
  private sim: SnakeSim | null = null;
  // sessionId -> token info
  private resumeTokens = new Map<string, PersistedResumeToken>();
  private tickInProgress = false;
  private respawnCooldown = new Map<string, number>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    state.blockConcurrencyWhile(async () => this.loadState());
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
    if (!isValidCode(code)) return new Response("invalid code", { status: 400 });
    this.code = code;
    await this.state.storage.put("code", code);

    const nickname = normalizeNickname(url.searchParams.get("nickname"));
    const colorIdxRaw = Number(url.searchParams.get("color") ?? 0);
    const incomingToken = url.searchParams.get("resumeToken") ?? "";

    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);

    const palette = tuning.bot.palette;
    const palLen = palette.length;

    // Issue or restore session.
    let sessionId: string;
    let snakeId: string;
    let resumeToken: string;
    const sim = this.ensureSim();

    const existing = incomingToken ? this.findResumeToken(incomingToken) : null;
    if (existing && existing.expiresAt > Date.now()) {
      // Resume - invalidate old token, issue fresh
      sessionId = existing.sessionId;
      snakeId = existing.snakeId;
      this.resumeTokens.delete(existing.sessionId);
      resumeToken = randomHex(32);
      const snake = sim.world.snakes.get(snakeId);
      if (snake?.dead) {
        sim.respawnSnake(snakeId, snake.color);
      } else if (!snake) {
        const colorIdx = isValidColorIdx(colorIdxRaw, palLen) ? colorIdxRaw : 0;
        const color = palette[colorIdx];
        sim.addPlayer(snakeId, { color, nickname });
      }
    } else {
      sessionId = randomHex(16);
      snakeId = `p_${sessionId}`;
      resumeToken = randomHex(32);
      const colorIdx = isValidColorIdx(colorIdxRaw, palLen) ? colorIdxRaw : 0;
      const color = palette[colorIdx];
      sim.addPlayer(snakeId, { color, nickname });
    }

    this.resumeTokens.set(sessionId, {
      token: resumeToken,
      snakeId,
      sessionId,
      expiresAt: Date.now() + tuning.net.resumeTokenTtlSec * 1000,
    });
    await this.persistTokens();

    const attachment: SocketAttachment = {
      sessionId,
      snakeId,
      resumeToken,
      inputTimestamps: [],
      welcomeSent: false,
    };
    server.serializeAttachment(attachment);

    // Send welcome immediately.
    const welcome: ServerMsg = {
      type: "welcome",
      sessionId,
      resumeToken,
      snakeId,
      worldDims: { w: tuning.world.widthPx, h: tuning.world.heightPx },
      tickHz: tuning.net.serverTickHz,
    };
    server.send(JSON.stringify(welcome));
    attachment.welcomeSent = true;
    server.serializeAttachment(attachment);

    await this.ensureTickScheduled();

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): Promise<void> {
    if (typeof msg !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg);
    } catch {
      return;
    }
    if (!isClientMsg(parsed)) return;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;

    // Rate limit per socket.
    const now = Date.now();
    attachment.inputTimestamps = attachment.inputTimestamps.filter((t) => now - t < 1000);
    if (attachment.inputTimestamps.length >= tuning.net.maxInputsPerSecPerClient) {
      const err: ServerMsg = { type: "error", code: "rate_limit", message: "too many inputs" };
      try {
        ws.send(JSON.stringify(err));
      } catch {
        // ignore
      }
      return;
    }
    attachment.inputTimestamps.push(now);
    ws.serializeAttachment(attachment);

    const m = parsed as ClientMsg;
    const sim = this.sim;
    if (!sim) return;

    switch (m.type) {
      case "input_dir":
        if (isValidAngle(m.angle)) sim.applyInput(attachment.snakeId, { angle: m.angle });
        break;
      case "input_boost":
        if (isValidBoolean(m.active)) sim.applyInput(attachment.snakeId, { boostActive: m.active });
        break;
      case "respawn": {
        const earliest = this.respawnCooldown.get(attachment.snakeId) ?? 0;
        if (now < earliest) return;
        const snake = sim.world.snakes.get(attachment.snakeId);
        if (snake?.dead) {
          sim.respawnSnake(attachment.snakeId, snake.color);
          this.broadcast({ type: "snake_respawned", snakeId: attachment.snakeId });
          this.respawnCooldown.delete(attachment.snakeId);
        }
        break;
      }
      case "leave": {
        const snake = sim.world.snakes.get(attachment.snakeId);
        if (snake) snake.dead = true;
        try {
          ws.close(1000, "client requested leave");
        } catch {
          // ignore
        }
        break;
      }
      case "set_nickname":
      case "set_color":
      case "client_log":
        // No-op for Phase 5; validate to drop bad ones.
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    // Keep the resume token alive for the grace window so the player can
    // refresh and rejoin without losing their snake.
    const expiry = Date.now() + tuning.net.resumeTokenTtlSec * 1000;
    const tok = this.resumeTokens.get(attachment.sessionId);
    if (tok) {
      this.resumeTokens.set(attachment.sessionId, { ...tok, expiresAt: expiry });
      await this.persistTokens();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    return this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    if (this.tickInProgress) return;
    this.tickInProgress = true;
    try {
      const sockets = this.state.getWebSockets();
      this.gcExpiredResumeTokens();

      if (sockets.length === 0 && this.resumeTokens.size === 0) {
        // Idle teardown: no live sockets and no pending reconnects.
        await this.state.storage.delete("sim");
        await this.state.storage.delete("resumeTokens");
        this.sim = null;
        return; // do NOT reschedule
      }

      if (sockets.length === 0) {
        // No live sockets but tokens still pending. Schedule alarm at the
        // earliest token expiry to clean up when grace window ends.
        let earliest = Number.POSITIVE_INFINITY;
        for (const t of this.resumeTokens.values()) {
          if (t.expiresAt < earliest) earliest = t.expiresAt;
        }
        if (earliest < Number.POSITIVE_INFINITY) {
          await this.state.storage.setAlarm(earliest);
        }
        return;
      }

      // Normal tick.
      if (this.sim) {
        const fixedDt = 1 / tuning.net.serverTickHz;
        const events = this.sim.tick(fixedDt);
        // Track respawn cooldowns from death events.
        for (const e of events) {
          if (e.type === "snake_died") {
            this.respawnCooldown.set(e.snakeId, Date.now() + 2000);
          }
        }
        await this.broadcastState();
        this.broadcastEvents(events);
        await this.persistSim();
      }

      await this.state.storage.setAlarm(Date.now() + Math.floor(1000 / tuning.net.serverTickHz));
    } finally {
      this.tickInProgress = false;
    }
  }

  // Returns a debug-logging prefix. Uses both stored fields so the compiler
  // knows they are read after assignment.
  private debugTag(): string {
    return `room[${this.code || "?"}]${this.env.DEBUG_LOG ? "+" : ""}`;
  }

  private ensureSim(): SnakeSim {
    if (!this.sim) {
      const seed = Math.floor(Math.random() * 0x7fffffff);
      if (this.env.DEBUG_LOG) console.log(this.debugTag(), "ensureSim seed=", seed);
      this.sim = new SnakeSim(seed);
    }
    return this.sim;
  }

  private async loadState(): Promise<void> {
    const storedCode = await this.state.storage.get<string>("code");
    if (storedCode) this.code = storedCode;
    const storedSim = await this.state.storage.get<ReturnType<SnakeSim["serialize"]>>("sim");
    if (storedSim) this.sim = SnakeSim.restore(storedSim);
    const storedTokens =
      await this.state.storage.get<Record<string, PersistedResumeToken>>("resumeTokens");
    if (storedTokens) {
      for (const [k, v] of Object.entries(storedTokens)) this.resumeTokens.set(k, v);
    }
  }

  private async persistSim(): Promise<void> {
    if (!this.sim) return;
    await this.state.storage.put("sim", this.sim.serialize());
  }

  private async persistTokens(): Promise<void> {
    const obj: Record<string, PersistedResumeToken> = {};
    for (const [k, v] of this.resumeTokens) obj[k] = v;
    await this.state.storage.put("resumeTokens", obj);
  }

  private gcExpiredResumeTokens(): void {
    const now = Date.now();
    for (const [k, v] of this.resumeTokens) {
      if (v.expiresAt < now) this.resumeTokens.delete(k);
    }
  }

  private findResumeToken(token: string): PersistedResumeToken | null {
    for (const v of this.resumeTokens.values()) {
      if (v.token === token) return v;
    }
    return null;
  }

  private async ensureTickScheduled(): Promise<void> {
    const existing = await this.state.storage.getAlarm();
    if (existing === null) {
      await this.state.storage.setAlarm(Date.now() + Math.floor(1000 / tuning.net.serverTickHz));
    }
  }

  private async broadcastState(): Promise<void> {
    if (!this.sim) return;
    const sockets = this.state.getWebSockets();
    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const snake = this.sim.world.snakes.get(attachment.snakeId);
      const cullCx = snake ? snake.segments[0].x : tuning.world.widthPx / 2;
      const cullCy = snake ? snake.segments[0].y : tuning.world.heightPx / 2;
      const snap = this.sim.snapshot(cullCx, cullCy);
      const stateMsg: ServerMsg = {
        type: "state",
        serverTime: Date.now(),
        snakes: snap.snakes,
        foods: snap.foods,
      };
      try {
        ws.send(JSON.stringify(stateMsg));
      } catch {
        // socket may have closed in flight; ignore
      }
    }
  }

  private broadcastEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === "snake_died") {
        this.broadcast({ type: "snake_died", snakeId: e.snakeId, killedBy: e.killedBy });
      } else if (e.type === "food_eaten") {
        this.broadcast({ type: "food_eaten", ids: e.ids });
      }
    }
  }

  private broadcast(msg: ServerMsg): void {
    const sockets = this.state.getWebSockets();
    const text = JSON.stringify(msg);
    for (const ws of sockets) {
      try {
        ws.send(text);
      } catch {
        // ignore
      }
    }
  }
}
