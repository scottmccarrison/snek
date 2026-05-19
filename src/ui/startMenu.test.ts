// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPersonalBest } from "../leaderboard";
import { StartMenu } from "./startMenu";

describe("StartMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(".snek-start-menu")) el.remove();
    localStorage.clear();
  });

  it("show creates a visible overlay and renders empty-state when no bests", () => {
    const cb = vi.fn();
    const menu = new StartMenu(cb);
    menu.show();
    const el = document.querySelector<HTMLDivElement>(".snek-start-menu");
    expect(el).toBeTruthy();
    expect(el?.style.display).toBe("flex");
    const empty = el?.querySelector<HTMLDivElement>(".snek-start-bests-empty");
    expect(empty?.style.display).toBe("block");
    menu.destroy();
  });

  it("show renders existing personal bests (top 5)", () => {
    for (const s of [100, 50, 200, 75, 30, 400, 10]) recordPersonalBest(s);
    const menu = new StartMenu(vi.fn());
    menu.show();
    const items = document.querySelectorAll<HTMLLIElement>(".snek-start-bests-list li");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toBe("400");
    expect(items[1].textContent).toBe("200");
    expect(items[2].textContent).toBe("100");
    expect(items[3].textContent).toBe("75");
    expect(items[4].textContent).toBe("50");
    menu.destroy();
  });

  it("Play button fires callback and hides menu", () => {
    const cb = vi.fn();
    const menu = new StartMenu(cb);
    menu.show();
    const btn = document.querySelector<HTMLButtonElement>(".snek-start-play");
    btn?.click();
    expect(cb).toHaveBeenCalledOnce();
    const el = document.querySelector<HTMLDivElement>(".snek-start-menu");
    expect(el?.style.display).toBe("none");
    menu.destroy();
  });

  it("Play button double-tap fires onPlay exactly once", () => {
    const cb = vi.fn();
    const menu = new StartMenu(cb);
    menu.show();
    const btn = document.querySelector<HTMLButtonElement>(".snek-start-play");
    btn?.click();
    btn?.click();
    btn?.click();
    expect(cb).toHaveBeenCalledOnce();
    menu.destroy();
  });

  it("name input persists to localStorage as the user types", () => {
    const menu = new StartMenu(vi.fn());
    menu.show();
    const input = document.querySelector<HTMLInputElement>(".snek-start-name");
    if (!input) throw new Error("input not found");
    input.value = "Scott";
    input.dispatchEvent(new Event("input"));
    expect(localStorage.getItem("snek.playerName")).toBe("Scott");
    menu.destroy();
  });

  it("constructor removes a stale overlay from a prior instance", () => {
    const m1 = new StartMenu(vi.fn());
    m1.show();
    // Simulate caller forgetting to destroy() before reconstructing.
    const m2 = new StartMenu(vi.fn());
    expect(document.querySelectorAll(".snek-start-menu")).toHaveLength(1);
    m2.destroy();
  });
});
