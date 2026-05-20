// Discriminated unions for ClientMsg / ServerMsg. JSON wire format.

export interface SnakeRenderState {
  id: string;
  ownerType: "player" | "bot";
  color: number;
  alive: boolean;
  segments: Array<{ x: number; y: number }>;
  boostActive: boolean;
  scale: number; // pre-computed so client doesn't redo log/sqrt math
}

export interface FoodRenderState {
  id: string;
  x: number;
  y: number;
  isPellet: boolean;
}

// Lightweight view of every snake regardless of viewport cull. Sent every
// tick so the minimap shows the whole world AND the HUD leaderboard can
// rank all snakes (not just the ones whose segments are in view). Heads
// only - no segments arrays - but length is included so the leaderboard
// has the right ordering.
export interface MinimapHead {
  id: string;
  color: number;
  x: number;
  y: number;
  dead: boolean;
  length: number;
}

export type ClientMsg =
  | { type: "set_nickname"; nickname: string }
  | { type: "set_color"; colorIdx: number }
  | { type: "input_dir"; angle: number }
  | { type: "input_boost"; active: boolean }
  | { type: "respawn" }
  | { type: "leave" }
  | { type: "set_ready"; ready: boolean }
  | { type: "client_log"; level: "info" | "warn" | "error"; msg: string };

export interface PlayerRosterEntry {
  sessionId: string;
  snakeId: string;
  nickname: string;
  colorIdx: number;
  ready: boolean;
  isHost: boolean;
}

export type ServerMsg =
  | {
      type: "welcome";
      sessionId: string;
      resumeToken: string;
      snakeId: string;
      worldDims: { w: number; h: number };
      tickHz: number;
    }
  | {
      type: "state";
      serverTime: number;
      phase: "lobby" | "playing";
      players: PlayerRosterEntry[];
      snakes: SnakeRenderState[];
      foods: FoodRenderState[];
      minimapHeads: MinimapHead[];
    }
  | { type: "snake_died"; snakeId: string; killedBy: string | null }
  | { type: "snake_respawned"; snakeId: string }
  | { type: "food_eaten"; ids: string[] }
  | { type: "game_ended"; reason: "host_left" }
  | { type: "error"; code: string; message: string };

// Type guard for runtime dispatch
export function isClientMsg(msg: unknown): msg is ClientMsg {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown };
  return typeof m.type === "string";
}
