// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runReconnectLoop } from "./reconnectLoop";

describe("runReconnectLoop", () => {
  it("succeeds on the second attempt with backoff", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const promise = runReconnectLoop(
      async () => {
        attempts++;
        return attempts === 2 ? { ok: true as const } : { ok: false as const };
      },
      { backoffsMs: [0, 10, 20] },
    );
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
    vi.useRealTimers();
  });
});
