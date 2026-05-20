// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Mock cloudflare:workers - DurableObject is just an empty base class.
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));

import { applySubmit } from "./leaderboard";
import type { ScoreEntry } from "./leaderboard";

const TOP_LIMIT = 50;

function entry(nickname: string, length: number, submittedAt = 0): ScoreEntry {
  return { nickname, length, submittedAt };
}

describe("applySubmit", () => {
  it("appends to an empty list", () => {
    const result = applySubmit([], entry("ABC", 5), TOP_LIMIT);
    expect(result).toHaveLength(1);
    expect(result[0].nickname).toBe("ABC");
    expect(result[0].length).toBe(5);
  });

  it("sorts by length descending", () => {
    let list: ScoreEntry[] = [];
    list = applySubmit(list, entry("LOW", 3), TOP_LIMIT);
    list = applySubmit(list, entry("HI", 10), TOP_LIMIT);
    list = applySubmit(list, entry("MID", 7), TOP_LIMIT);
    expect(list[0].nickname).toBe("HI");
    expect(list[1].nickname).toBe("MID");
    expect(list[2].nickname).toBe("LOW");
  });

  it("trims to TOP_LIMIT and evicts lowest", () => {
    let list: ScoreEntry[] = [];
    for (let i = 0; i < TOP_LIMIT; i++) {
      list = applySubmit(list, entry("A", 100 - i), TOP_LIMIT);
    }
    expect(list).toHaveLength(TOP_LIMIT);
    // Add one more with the highest score - should displace the lowest
    list = applySubmit(list, entry("TOP", 999), TOP_LIMIT);
    expect(list).toHaveLength(TOP_LIMIT);
    expect(list[0].nickname).toBe("TOP");
    expect(list[0].length).toBe(999);
    // The lowest (score=51) gets evicted - last entry should be score 52
    const last = list[TOP_LIMIT - 1];
    expect(last.length).toBeGreaterThan(50);
  });

  it("51st entry evicts the lowest score", () => {
    let list: ScoreEntry[] = [];
    for (let i = 1; i <= TOP_LIMIT; i++) {
      list = applySubmit(list, entry("A", i), TOP_LIMIT);
    }
    // list now has scores 1..50 (top 50). Adding score 51 evicts score 1.
    list = applySubmit(list, entry("NEW", 51), TOP_LIMIT);
    expect(list).toHaveLength(TOP_LIMIT);
    const lengths = list.map((e) => e.length);
    expect(lengths).not.toContain(1); // score 1 evicted
    expect(lengths).toContain(51); // new entry kept
  });

  it("does not mutate the input array", () => {
    const original: ScoreEntry[] = [entry("OLD", 5)];
    const frozen = [...original];
    applySubmit(original, entry("NEW", 10), TOP_LIMIT);
    expect(original).toEqual(frozen);
  });
});

// --- Validation logic tests (mirroring submitScore guards) ---

describe("submitScore validation (regex + finite checks)", () => {
  function isValidNickname(n: string): boolean {
    return /^[A-Z]{1,3}$/.test(n);
  }
  function isValidLength(l: unknown): boolean {
    return typeof l === "number" && Number.isFinite(l) && l >= 1;
  }

  it("accepts valid A-Z nicknames 1-3 chars", () => {
    expect(isValidNickname("A")).toBe(true);
    expect(isValidNickname("AB")).toBe(true);
    expect(isValidNickname("ABC")).toBe(true);
  });

  it("rejects lowercase nickname", () => {
    expect(isValidNickname("abc")).toBe(false);
    expect(isValidNickname("Abc")).toBe(false);
  });

  it("rejects empty nickname", () => {
    expect(isValidNickname("")).toBe(false);
  });

  it("rejects too-long nickname", () => {
    expect(isValidNickname("ABCD")).toBe(false);
  });

  it("rejects nickname with non-alpha chars", () => {
    expect(isValidNickname("A1C")).toBe(false);
    expect(isValidNickname("A C")).toBe(false);
    expect(isValidNickname("A-B")).toBe(false);
  });

  it("accepts valid length >= 1", () => {
    expect(isValidLength(1)).toBe(true);
    expect(isValidLength(100)).toBe(true);
  });

  it("rejects length = 0", () => {
    expect(isValidLength(0)).toBe(false);
  });

  it("rejects negative length", () => {
    expect(isValidLength(-1)).toBe(false);
  });

  it("rejects NaN length", () => {
    expect(isValidLength(Number.NaN)).toBe(false);
  });

  it("rejects Infinity length", () => {
    expect(isValidLength(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

// --- getTopN slice behavior tests ---

describe("getTopN slice behavior", () => {
  function getTopN(list: ScoreEntry[], n: number): ScoreEntry[] {
    return list.slice(0, Math.max(0, Math.min(n, TOP_LIMIT)));
  }

  it("returns top N entries in length-desc order", () => {
    const list = [entry("A", 10), entry("B", 5), entry("C", 3)];
    const top2 = getTopN(list, 2);
    expect(top2).toHaveLength(2);
    expect(top2[0].length).toBe(10);
    expect(top2[1].length).toBe(5);
  });

  it("returns all entries if n >= list length", () => {
    const list = [entry("A", 10), entry("B", 5)];
    expect(getTopN(list, 10)).toHaveLength(2);
  });

  it("clamps n to 0 (returns empty for n <= 0)", () => {
    const list = [entry("A", 10)];
    expect(getTopN(list, 0)).toHaveLength(0);
    expect(getTopN(list, -5)).toHaveLength(0);
  });

  it("clamps n to TOP_LIMIT", () => {
    const list = Array.from({ length: 50 }, (_, i) => entry("A", 50 - i));
    expect(getTopN(list, 9999)).toHaveLength(TOP_LIMIT);
  });
});

// --- alarm / reset behavior ---

describe("alarm (reset) behavior via FakeStorage", () => {
  class FakeStorage {
    data = new Map<string, unknown>();
    alarmVal: number | null = null;
    async get<T>(key: string): Promise<T | undefined> {
      return this.data.get(key) as T | undefined;
    }
    async put<T>(key: string, value: T): Promise<void> {
      this.data.set(key, value);
    }
    async delete(key: string): Promise<boolean> {
      return this.data.delete(key);
    }
    async getAlarm(): Promise<number | null> {
      return this.alarmVal;
    }
    async setAlarm(t: number): Promise<void> {
      this.alarmVal = t;
    }
  }

  class FakeCtx {
    storage = new FakeStorage();
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    }
  }

  // Import dynamically after vi.mock is set up.
  async function makeLb() {
    const { Leaderboard } = await import("./leaderboard");
    const ctx = new FakeCtx();
    const lb = new Leaderboard(ctx as unknown as DurableObjectState, {} as never);
    return { lb, ctx };
  }

  it("alarm() deletes scores and reschedules next midnight UTC", async () => {
    const { lb, ctx } = await makeLb();
    // Seed some scores so we can verify deletion.
    ctx.storage.data.set("scores", [entry("ABC", 10)]);

    await lb.alarm();

    expect(ctx.storage.data.has("scores")).toBe(false);
    expect(ctx.storage.alarmVal).not.toBeNull();
    // The rescheduled alarm should be in the future (next UTC midnight).
    const now = Date.now();
    expect(ctx.storage.alarmVal ?? 0).toBeGreaterThan(now);
  });

  it("constructor schedules alarm if none exists", async () => {
    const { ctx } = await makeLb();
    // blockConcurrencyWhile ran synchronously; alarm should now be set.
    expect(ctx.storage.alarmVal).not.toBeNull();
  });

  it("constructor does NOT reschedule if alarm already exists", async () => {
    const { Leaderboard } = await import("./leaderboard");
    const ctx = new FakeCtx();
    const existingAlarm = Date.now() + 1_000_000;
    ctx.storage.alarmVal = existingAlarm;
    new Leaderboard(ctx as unknown as DurableObjectState, {} as never);
    // blockConcurrencyWhile is sync in fake, so we can check immediately.
    // The alarm should remain unchanged.
    expect(ctx.storage.alarmVal).toBe(existingAlarm);
  });
});
