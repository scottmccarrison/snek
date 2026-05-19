/**
 * Exponential backoff reconnect loop for snek multiplayer (Phase 5).
 * Simplified shape adapted from ~/worms/src/net/reconnectLoop.ts.
 */

export interface ReconnectOpts {
  backoffsMs?: number[];
  onAttempt?: (attempt: number, delayMs: number) => void;
}

export async function runReconnectLoop(
  attempt: () => Promise<{ ok: true } | { ok: false }>,
  opts: ReconnectOpts = {},
): Promise<{ ok: boolean }> {
  const backoffs = opts.backoffsMs ?? [0, 500, 1000, 2000, 4000, 8000, 15000, 30000];
  for (let i = 0; i < backoffs.length; i++) {
    const delayMs = backoffs[i];
    if (delayMs > 0) await new Promise((res) => setTimeout(res, delayMs));
    opts.onAttempt?.(i + 1, delayMs);
    try {
      const r = await attempt();
      if (r.ok) return { ok: true };
    } catch {
      // continue
    }
  }
  return { ok: false };
}
