import { describe, expect, it } from "vitest";
import { World } from "../sim/world";
import { Snake } from "../snake/snake";
import { tuning } from "../tuning";
import { computeLeaderboard, hitsButton } from "./hud";

function makeWorld() {
  const world = new World({ onSnakeDied: () => {} });
  return world;
}

describe("HUD: computeLeaderboard", () => {
  it("renders length and score from player snake", () => {
    const world = makeWorld();
    const player = new Snake(100, 100, { id: "player", ownerType: "player" });
    // Grow player to a known length
    player.grow(5);
    for (let i = 0; i < 20; i++) player.update(1 / 60, 1, 0);
    world.addSnake(player);

    const rows = computeLeaderboard(world, "player", 5, false);
    // Player should appear in rows
    const playerRow = rows.find((r) => r.isPlayer);
    expect(playerRow).toBeDefined();
    expect(playerRow?.length).toBeGreaterThanOrEqual(tuning.snake.initialLength);
  });

  it("top-5 sorted by length descending", () => {
    const world = makeWorld();
    // Create snakes with different lengths by setting growth
    for (let i = 0; i < 6; i++) {
      const s = new Snake(100 + i * 50, 100, { id: `bot-${i}`, ownerType: "bot" });
      // Grow each snake differently: bot-5 gets most growth, bot-0 gets least
      s.grow(i * 3);
      for (let f = 0; f < 30; f++) s.update(1 / 60, 1, 0);
      world.addSnake(s);
    }

    const rows = computeLeaderboard(world, "player", 5, false);
    expect(rows.length).toBe(5);
    // Verify descending order
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].length).toBeLessThanOrEqual(rows[i - 1].length);
    }
    // Rank 1 should have the highest length
    expect(rows[0].rank).toBe(1);
  });

  it("player row always rendered even when not in top 5", () => {
    const world = makeWorld();
    // Add 5 long bots
    for (let i = 0; i < 5; i++) {
      const s = new Snake(100 + i * 50, 100, { id: `bot-${i}`, ownerType: "bot" });
      s.grow(50);
      for (let f = 0; f < 60; f++) s.update(1 / 60, 1, 0);
      world.addSnake(s);
    }
    // Add player with no growth (will be rank 6)
    const player = new Snake(500, 500, { id: "player", ownerType: "player" });
    world.addSnake(player);

    const rows = computeLeaderboard(world, "player", 5, true);
    const playerRow = rows.find((r) => r.isPlayer);
    expect(playerRow).toBeDefined();
    expect(playerRow?.rank).toBe(6);
    // Should also have a placeholder separator
    const placeholder = rows.find((r) => r.isPlaceholder);
    expect(placeholder).toBeDefined();
  });
});

describe("HUD: hitsButton", () => {
  it("mute button hit-test returns true inside box, false outside", () => {
    const vw = 1280;
    const vh = 720;
    const { safeInsetPx, muteButtonSizePx } = tuning.hud;

    // Exact top-left corner of button
    const bx = safeInsetPx;
    const by = vh - safeInsetPx - muteButtonSizePx;

    // Inside - center of button
    expect(hitsButton(bx + muteButtonSizePx / 2, by + muteButtonSizePx / 2, vw, vh)).toBe(true);
    // Inside - top-left corner
    expect(hitsButton(bx, by, vw, vh)).toBe(true);
    // Outside - just to the left
    expect(hitsButton(bx - 1, by + muteButtonSizePx / 2, vw, vh)).toBe(false);
    // Outside - just below
    expect(hitsButton(bx + muteButtonSizePx / 2, by + muteButtonSizePx, vw, vh)).toBe(false);
    // Outside - top-right area
    expect(hitsButton(vw - safeInsetPx, safeInsetPx, vw, vh)).toBe(false);
  });
});
