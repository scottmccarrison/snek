// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainMenu } from "./mainMenu";

describe("MainMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    for (const el of document.querySelectorAll(".snek-menu")) el.remove();
    localStorage.clear();
  });

  it("title mode renders initials + START + MULTIPLAYER", () => {
    const menu = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    menu.show("title");
    const el = document.querySelector(".snek-menu") as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(el.style.display).toBe("flex");
    expect(el.querySelector(".snek-menu-primary")?.textContent).toBe("START");
    expect(el.querySelector(".snek-menu-secondary")?.textContent).toBe("MULTIPLAYER");
    expect((el.querySelector(".snek-menu-name-row") as HTMLElement).style.display).not.toBe("none");
    menu.destroy();
  });

  it("gameover-solo mode renders score + RESTART + LEAVE", () => {
    const menu = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    menu.show("gameover-solo", { score: 42, killedBy: "bot-1" });
    const el = document.querySelector(".snek-menu") as HTMLDivElement;
    expect(el.querySelector(".snek-menu-score")?.textContent).toBe("42");
    expect(el.querySelector(".snek-menu-killer")?.textContent).toBe("Killed by bot-1");
    expect(el.querySelector(".snek-menu-primary")?.textContent).toBe("RESTART");
    expect(el.querySelector(".snek-menu-secondary")?.textContent).toBe("LEAVE");
    menu.destroy();
  });

  it("gameover-mp mode does NOT record personal best", () => {
    const menu = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    menu.show("gameover-mp", { score: 99, killedBy: null });
    expect(localStorage.getItem("snek.personalBests")).toBeNull();
    menu.destroy();
  });

  it("gameover-solo records personal best and highlights new entry", () => {
    const menu = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    menu.show("gameover-solo", { score: 50, killedBy: null });
    const stored = JSON.parse(localStorage.getItem("snek.personalBests") || "[]");
    expect(stored.length).toBe(1);
    expect(stored[0].score).toBe(50);
    const items = document.querySelectorAll(".snek-menu-bests-list li");
    expect(items.length).toBe(1);
    expect(items[0].classList.contains("snek-menu-bests-current")).toBe(true);
    menu.destroy();
  });

  it("primary button click fires onStart in title mode and onRestart in gameover", () => {
    const onStart = vi.fn();
    const onRestart = vi.fn();
    const menu = new MainMenu({ onStart, onMultiplayer: vi.fn(), onRestart, onLeave: vi.fn() });
    menu.show("title");
    document.querySelector<HTMLButtonElement>(".snek-menu-primary")?.click();
    expect(onStart).toHaveBeenCalledOnce();
    menu.show("gameover-solo", { score: 10, killedBy: null });
    document.querySelector<HTMLButtonElement>(".snek-menu-primary")?.click();
    expect(onRestart).toHaveBeenCalledOnce();
    menu.destroy();
  });

  it("secondary fires onMultiplayer in title and onLeave in gameover", () => {
    const onMultiplayer = vi.fn();
    const onLeave = vi.fn();
    const menu = new MainMenu({ onStart: vi.fn(), onMultiplayer, onRestart: vi.fn(), onLeave });
    menu.show("title");
    document.querySelector<HTMLButtonElement>(".snek-menu-secondary")?.click();
    expect(onMultiplayer).toHaveBeenCalledOnce();
    menu.show("gameover-solo", { score: 10, killedBy: null });
    document.querySelector<HTMLButtonElement>(".snek-menu-secondary")?.click();
    expect(onLeave).toHaveBeenCalledOnce();
    menu.destroy();
  });

  it("constructor removes stale prior overlay", () => {
    const m1 = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    m1.show("title");
    expect(document.querySelectorAll(".snek-menu").length).toBe(1);
    const m2 = new MainMenu({
      onStart: vi.fn(),
      onMultiplayer: vi.fn(),
      onRestart: vi.fn(),
      onLeave: vi.fn(),
    });
    expect(document.querySelectorAll(".snek-menu").length).toBe(1);
    m2.destroy();
  });
});
