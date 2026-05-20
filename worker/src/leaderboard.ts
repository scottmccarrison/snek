import { DurableObject } from "cloudflare:workers";
import type { Env } from "./room";

interface ScoreEntry {
  nickname: string;
  length: number;
  submittedAt: number; // ms since epoch
}

const TOP_LIMIT = 50;

// Cross-room leaderboard. Singleton acquired via env.LEADERBOARD.idFromName("global").
// Daily reset at UTC midnight via alarm. submitScore is fire-and-forget from
// Room DOs on human-snake death; getTopN is called by the matchmaker HTTP
// endpoint that the client lobby fetches.
export class Leaderboard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Schedule the first daily reset if none is pending. blockConcurrencyWhile
    // guards against running before getAlarm() resolves; the null check
    // prevents duplicate alarms on reinstantiation after hibernation.
    this.ctx.blockConcurrencyWhile(async () => {
      if ((await this.ctx.storage.getAlarm()) === null) {
        await this.scheduleNextReset();
      }
    });
  }

  async submitScore(entry: { nickname: string; length: number }): Promise<void> {
    // Defense in depth: server has sanitize.ts but accepting RPC from any
    // Room DO is still untrusted input.
    if (!/^[A-Z]{1,3}$/.test(entry.nickname)) return;
    if (!Number.isFinite(entry.length) || entry.length < 1) return;
    const e: ScoreEntry = {
      nickname: entry.nickname,
      length: Math.floor(entry.length),
      submittedAt: Date.now(),
    };
    const list = (await this.ctx.storage.get<ScoreEntry[]>("scores")) ?? [];
    list.push(e);
    list.sort((a, b) => b.length - a.length);
    if (list.length > TOP_LIMIT) list.length = TOP_LIMIT;
    await this.ctx.storage.put("scores", list);
  }

  async getTopN(n: number): Promise<ScoreEntry[]> {
    const list = (await this.ctx.storage.get<ScoreEntry[]>("scores")) ?? [];
    return list.slice(0, Math.max(0, Math.min(n, TOP_LIMIT)));
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete("scores");
    await this.scheduleNextReset();
  }

  private async scheduleNextReset(): Promise<void> {
    // Next midnight UTC. setUTCHours(24, ...) advances the date.
    const next = new Date();
    next.setUTCHours(24, 0, 0, 0);
    await this.ctx.storage.setAlarm(next.getTime());
  }
}

// Testable pure helper: apply a new entry to the scores list and return
// the updated list (sorted desc by length, capped at topLimit).
// Used internally by submitScore; exported for unit tests.
export function applySubmit(list: ScoreEntry[], entry: ScoreEntry, topLimit: number): ScoreEntry[] {
  const updated = [...list, entry];
  updated.sort((a, b) => b.length - a.length);
  if (updated.length > topLimit) updated.length = topLimit;
  return updated;
}

export type { ScoreEntry };
