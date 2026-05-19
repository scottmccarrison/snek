// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeathScreen } from "./deathScreen";
import type { DeathStats } from "./deathScreen";

function makeStats(overrides: Partial<DeathStats> = {}): DeathStats {
  return { length: 42, score: 22, killedBy: "bot-1", ...overrides };
}

describe("DeathScreen", () => {
  afterEach(() => {
    // Clean up any lingering DOM nodes between tests
    for (const el of document.querySelectorAll(".snek-death-screen")) el.remove();
  });

  it("show creates DOM and sets stats correctly", () => {
    const cb = vi.fn();
    const ds = new DeathScreen(cb);
    ds.show(makeStats({ length: 55, score: 35, killedBy: "bot-2" }));

    const el = document.querySelector(".snek-death-screen") as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(el.style.display).toBe("block");
    expect(el.querySelector(".snek-death-length")?.textContent).toBe("55");
    expect(el.querySelector(".snek-death-score")?.textContent).toBe("35");
    expect(el.querySelector(".snek-death-killer")?.textContent).toBe("Killed by bot-2");

    ds.destroy();
  });

  it("tap respawn fires callback", () => {
    const cb = vi.fn();
    const ds = new DeathScreen(cb);
    ds.show(makeStats());

    const btn = document.querySelector<HTMLButtonElement>(".snek-death-respawn");
    expect(btn).toBeTruthy();
    btn?.click();

    expect(cb).toHaveBeenCalledOnce();
    // Screen should be hidden after respawn
    const el = document.querySelector(".snek-death-screen") as HTMLDivElement;
    expect(el.style.display).toBe("none");

    ds.destroy();
  });

  it("auto-respawn fires callback after 10s", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const ds = new DeathScreen(cb);
    ds.show(makeStats());

    expect(cb).not.toHaveBeenCalled();

    // Advance 9 seconds - not yet
    vi.advanceTimersByTime(9000);
    expect(cb).not.toHaveBeenCalled();

    // Advance the final second
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledOnce();

    ds.destroy();
    vi.useRealTimers();
  });

  it("restart removes existing death screen DOM (no stacked overlays)", () => {
    const cb = vi.fn();
    const ds = new DeathScreen(cb);
    ds.show(makeStats());

    // Simulate restart: destroy + create new DeathScreen
    ds.destroy();
    expect(document.querySelector(".snek-death-screen")).toBeNull();

    // New DeathScreen should work cleanly
    const ds2 = new DeathScreen(cb);
    ds2.show(makeStats({ killedBy: null }));
    const el = document.querySelector(".snek-death-screen") as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(el.querySelector(".snek-death-killer")?.textContent).toBe("Killed by the wall");

    ds2.destroy();
  });
});
