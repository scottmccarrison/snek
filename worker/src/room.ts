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
import { type SerializedServerBotManager, ServerBotManager } from "./sim/serverBotManager";
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
  private botManager: ServerBotManager | null = null;
  // sessionId -> token info
  private resumeTokens = new Map<string, PersistedResumeToken>();
  private tickInProgress = false;
  private respawnCooldown = new Map<string, number>();

  // Lobby phase state
  private phase: "lobby" | "playing" = "lobby";
  private hostSessionId: string | null = null;
  private readyStates = new Map<string, boolean>();
  // sessionId -> { nickname, colorIdx, joinOrder }
  private playerMeta = new Map<string, { nickname: string; colorIdx: number; joinOrder: number }>();
  private nextJoinOrder = 0;

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

    // Store per-player metadata for roster display (upsert on reconnect).
    if (!this.playerMeta.has(sessionId)) {
      const colorIdx = isValidColorIdx(colorIdxRaw, tuning.bot.palette.length) ? colorIdxRaw : 0;
      this.playerMeta.set(sessionId, { nickname, colorIdx, joinOrder: this.nextJoinOrder++ });
    }
    // Initialize ready state if not already set.
    if (!this.readyStates.has(sessionId)) {
      this.readyStates.set(sessionId, false);
    }

    // Host election: first joiner, or take over if stored host's resume token is gone.
    const hostStillValid =
      this.hostSessionId !== null &&
      (this.hostSessionId === sessionId || this.resumeTokens.has(this.hostSessionId));
    if (!hostStillValid) {
      this.hostSessionId = sessionId;
    }
    await this.persistState();

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

    // Always force-schedule the next tick on join, even if a grace-window
    // GC alarm was already pending. Otherwise reconnects during the grace
    // window would have to wait until token expiry for the first tick.
    await this.scheduleNextTick();

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
      case "set_ready":
        if (typeof m.ready === "boolean") {
          this.readyStates.set(attachment.sessionId, m.ready);
          await this.persistState();
          await this.maybeStartGame();
        }
        break;
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

    // If the closing session was the host, end the game for everyone.
    if (attachment.sessionId === this.hostSessionId) {
      this.broadcast({ type: "game_ended", reason: "host_left" });
      // Close all remaining sockets so clients get a clean disconnect.
      for (const otherWs of this.state.getWebSockets()) {
        if (otherWs === ws) continue;
        try {
          otherWs.close(1000, "host left");
        } catch {
          // ignore
        }
      }
      // Reset room state - sim, phase, readyStates, host, playerMeta, resumeTokens all cleared.
      this.sim = null;
      this.botManager?.clear();
      this.botManager = null;
      this.phase = "lobby";
      this.hostSessionId = null;
      this.readyStates.clear();
      this.playerMeta.clear();
      this.resumeTokens.clear();
      await this.state.storage.delete("sim");
      await this.state.storage.delete("resumeTokens");
      await this.state.storage.delete("botManager");
      await this.persistState();
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
        await this.state.storage.delete("botManager");
        this.sim = null;
        this.botManager?.clear();
        this.botManager = null;
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

      if (this.phase === "playing" && this.sim) {
        // Normal tick.
        const fixedDt = 1 / tuning.net.serverTickHz;

        // Drive bots BEFORE sim.tick so their pendingDir is set when Snake.update runs.
        const liveSessionIds = new Set<string>();
        for (const ws of sockets) {
          const att = ws.deserializeAttachment() as SocketAttachment | null;
          if (att) liveSessionIds.add(att.sessionId);
        }
        const humanSnakeCount = liveSessionIds.size;
        if (this.botManager) {
          this.botManager.update(this.sim, humanSnakeCount, fixedDt);
        }

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
        await this.persistBotManager();
      } else {
        // Lobby phase: no sim tick, but broadcast state so clients see roster.
        await this.broadcastState();
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
    if (!this.botManager) {
      const botSeed = Math.floor(Math.random() * 0x7fffffff);
      this.botManager = new ServerBotManager(botSeed);
    }
    return this.sim;
  }

  private async loadState(): Promise<void> {
    const storedCode = await this.state.storage.get<string>("code");
    if (storedCode) this.code = storedCode;
    const storedSim = await this.state.storage.get<ReturnType<SnakeSim["serialize"]>>("sim");
    if (storedSim) this.sim = SnakeSim.restore(storedSim);
    const storedBot = await this.state.storage.get<SerializedServerBotManager>("botManager");
    if (storedBot && this.sim) {
      this.botManager = ServerBotManager.restore(storedBot, this.sim);
    }
    const storedTokens =
      await this.state.storage.get<Record<string, PersistedResumeToken>>("resumeTokens");
    if (storedTokens) {
      for (const [k, v] of Object.entries(storedTokens)) this.resumeTokens.set(k, v);
    }
    // Restore lobby phase state.
    const storedPhase = await this.state.storage.get<string>("phase");
    if (storedPhase === "playing" || storedPhase === "lobby") this.phase = storedPhase;
    const storedHost = await this.state.storage.get<string | null>("hostSessionId");
    if (storedHost !== undefined) this.hostSessionId = storedHost ?? null;
    const storedReady = await this.state.storage.get<Record<string, boolean>>("readyStates");
    if (storedReady) {
      for (const [k, v] of Object.entries(storedReady)) this.readyStates.set(k, v);
    }
    const storedMeta =
      await this.state.storage.get<
        Record<string, { nickname: string; colorIdx: number; joinOrder: number }>
      >("playerMeta");
    if (storedMeta) {
      for (const [k, v] of Object.entries(storedMeta)) this.playerMeta.set(k, v);
      // Recompute nextJoinOrder so new joiners get a higher order number.
      const orders = Array.from(this.playerMeta.values()).map((m) => m.joinOrder);
      this.nextJoinOrder = orders.length > 0 ? Math.max(...orders) + 1 : 0;
    }
  }

  private async persistSim(): Promise<void> {
    if (!this.sim) return;
    await this.state.storage.put("sim", this.sim.serialize());
  }

  private async persistBotManager(): Promise<void> {
    if (!this.botManager) return;
    await this.state.storage.put("botManager", this.botManager.serialize());
  }

  private async persistTokens(): Promise<void> {
    const obj: Record<string, PersistedResumeToken> = {};
    for (const [k, v] of this.resumeTokens) obj[k] = v;
    await this.state.storage.put("resumeTokens", obj);
  }

  // GC expired resume tokens AND any per-player metadata orphaned by the
  // expired session (a non-host disconnect that aged past the grace window
  // means the player isn't coming back - drop their roster entry too).
  private gcExpiredResumeTokens(): void {
    const now = Date.now();
    for (const [k, v] of this.resumeTokens) {
      if (v.expiresAt < now) {
        this.resumeTokens.delete(k);
        this.playerMeta.delete(k);
        this.readyStates.delete(k);
      }
    }
  }

  // Returns a token entry only if it's not expired. Expired entries are
  // skipped (and will be GC'd on the next alarm). Hardens against a stale
  // token being used in the gap between expiry and GC.
  private findResumeToken(token: string): PersistedResumeToken | null {
    const now = Date.now();
    for (const v of this.resumeTokens.values()) {
      if (v.token === token && v.expiresAt > now) return v;
    }
    return null;
  }

  // Always reschedule the alarm to the next tick. Called on every fresh
  // socket join. Without this, a room in grace-window mode (alarm set far
  // out for token GC) would miss its 50ms tick cadence after a reconnect.
  private async scheduleNextTick(): Promise<void> {
    await this.state.storage.setAlarm(Date.now() + Math.floor(1000 / tuning.net.serverTickHz));
  }

  private async broadcastState(): Promise<void> {
    if (!this.sim) return;
    const players = this.buildPlayersList();
    const sockets = this.state.getWebSockets();

    // Build the combined nickname lookup: human nicknames from playerMeta +
    // bot nicknames from botManager.
    const botNicknames = this.botManager?.getNicknames();
    const nicknameLookup = (id: string): string | undefined => {
      // Human snakes have id "p_<sessionId>". Look up via playerMeta.
      if (id.startsWith("p_")) {
        const sessionId = id.slice(2);
        return this.playerMeta.get(sessionId)?.nickname;
      }
      return botNicknames?.get(id);
    };

    for (const ws of sockets) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const snake = this.sim.world.snakes.get(attachment.snakeId);
      const cullCx = snake ? snake.segments[0].x : tuning.world.widthPx / 2;
      const cullCy = snake ? snake.segments[0].y : tuning.world.heightPx / 2;
      const snap = this.sim.snapshot(cullCx, cullCy, nicknameLookup);
      const stateMsg: ServerMsg = {
        type: "state",
        serverTime: Date.now(),
        phase: this.phase,
        players,
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

  private buildPlayersList(): Array<{
    sessionId: string;
    snakeId: string;
    nickname: string;
    colorIdx: number;
    ready: boolean;
    isHost: boolean;
  }> {
    const liveSessionIds = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (att) liveSessionIds.add(att.sessionId);
    }
    const out: Array<{
      sessionId: string;
      snakeId: string;
      nickname: string;
      colorIdx: number;
      ready: boolean;
      isHost: boolean;
    }> = [];
    for (const sid of liveSessionIds) {
      const meta = this.playerMeta.get(sid);
      if (!meta) continue;
      out.push({
        sessionId: sid,
        snakeId: `p_${sid}`,
        nickname: meta.nickname,
        colorIdx: meta.colorIdx,
        ready: this.readyStates.get(sid) ?? false,
        isHost: sid === this.hostSessionId,
      });
    }
    // Sort by joinOrder so display is stable.
    out.sort((a, b) => {
      const aMeta = this.playerMeta.get(a.sessionId);
      const bMeta = this.playerMeta.get(b.sessionId);
      return (aMeta?.joinOrder ?? 0) - (bMeta?.joinOrder ?? 0);
    });
    return out;
  }

  private async maybeStartGame(): Promise<void> {
    if (this.phase === "playing") return;
    // Need at least 1 player AND all connected (live socket) players ready.
    const liveSessionIds = new Set<string>();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as SocketAttachment | null;
      if (att) liveSessionIds.add(att.sessionId);
    }
    if (liveSessionIds.size === 0) return;
    for (const sid of liveSessionIds) {
      if (!this.readyStates.get(sid)) return;
    }
    this.phase = "playing";
    await this.persistState();
    // Force-broadcast so clients see the phase flip immediately.
    await this.broadcastState();
  }

  private async persistState(): Promise<void> {
    await this.state.storage.put("phase", this.phase);
    await this.state.storage.put("hostSessionId", this.hostSessionId);
    const readyObj: Record<string, boolean> = {};
    for (const [k, v] of this.readyStates) readyObj[k] = v;
    await this.state.storage.put("readyStates", readyObj);
    const metaObj: Record<string, { nickname: string; colorIdx: number; joinOrder: number }> = {};
    for (const [k, v] of this.playerMeta) metaObj[k] = v;
    await this.state.storage.put("playerMeta", metaObj);
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
