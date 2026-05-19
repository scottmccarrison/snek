/**
 * HUD - Phaser overlay showing player length/score, top-N leaderboard,
 * always-show-player row, and a mute toggle button. setScrollFactor(0) pins
 * it to the viewport. Depth 2100 (above minimap at 2000).
 *
 * The mute button hit area is registered with PointerSteering's shouldIgnore
 * callback so tapping mute does not also anchor the joystick.
 */

import type * as Phaser from "phaser";
import type { World } from "../sim/world";
import type { Snake } from "../snake/snake";
import { tuning } from "../tuning";

export interface MuteController {
  isMuted(): boolean;
  toggleMute(): boolean;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  length: number;
  isPlayer: boolean;
  isPlaceholder?: boolean;
}

/**
 * Pure function: compute leaderboard rows from world state.
 * Exported for unit testing without requiring Phaser.
 */
export function computeLeaderboard(
  world: World,
  playerId: string,
  topN: number,
  alwaysShowPlayer: boolean,
): LeaderboardRow[] {
  const alive = Array.from(world.snakes.values()).filter((s) => !s.dead);
  alive.sort((a, b) => b.segments.length - a.segments.length);

  const rows: LeaderboardRow[] = [];
  const top = alive.slice(0, topN);
  let playerInTop = false;

  for (let i = 0; i < top.length; i++) {
    const s = top[i];
    const isPlayer = s.id === playerId;
    if (isPlayer) playerInTop = true;
    rows.push({ rank: i + 1, id: s.id, length: s.segments.length, isPlayer });
  }

  if (!playerInTop && alwaysShowPlayer) {
    const playerIdx = alive.findIndex((s) => s.id === playerId);
    if (playerIdx >= 0) {
      // Separator
      rows.push({ rank: -1, id: "...", length: 0, isPlayer: false, isPlaceholder: true });
      // Player row with actual rank
      rows.push({
        rank: playerIdx + 1,
        id: playerId,
        length: alive[playerIdx].segments.length,
        isPlayer: true,
      });
    }
  }

  return rows;
}

/**
 * Pure function: check if (screenX, screenY) hits the mute button.
 * Exported for unit testing without requiring Phaser.
 */
export function hitsButton(
  screenX: number,
  screenY: number,
  _viewportW: number,
  viewportH: number,
): boolean {
  const { safeInsetPx, muteButtonSizePx } = tuning.hud;
  const bx = safeInsetPx;
  const by = viewportH - safeInsetPx - muteButtonSizePx;
  return (
    screenX >= bx &&
    screenX < bx + muteButtonSizePx &&
    screenY >= by &&
    screenY < by + muteButtonSizePx
  );
}

export class HUD {
  private mute: MuteController;
  private playerId: string;
  private graphics: Phaser.GameObjects.Graphics;
  private scoreText: Phaser.GameObjects.Text;
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];
  // Drawn speaker icon for mute (Phaser Graphics, not text - emoji rendering
  // is inconsistent across platforms and [ON]/[OFF] read as a debug toggle).
  private muteIconGraphics: Phaser.GameObjects.Graphics;
  // Cached viewport dimensions for hit-testing.
  private viewportW: number;
  private viewportH: number;
  // Cached last-rendered values so setText only fires when the value changed.
  // Phaser Text recreates its GPU texture on every setText - on mobile this
  // shows up as periodic hitching. Caching cuts the upload cost to near zero
  // during steady-state play.
  private lastScore = -1;
  private lastRowTexts: string[] = [];
  private lastRowColors: string[] = [];
  private lastMuted: boolean | null = null;

  constructor(scene: Phaser.Scene, mute: MuteController, playerId = "player") {
    this.mute = mute;
    this.playerId = playerId;

    const { width, height } = scene.scale.gameSize;
    this.viewportW = width;
    this.viewportH = height;

    const depth = 2100;
    const inset = tuning.hud.safeInsetPx;
    const colorHex = `#${tuning.hud.textColor.toString(16).padStart(6, "0")}`;

    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0).setDepth(depth);

    // Top-left: score only. Length was removed in polish pass - score is
    // the meaningful progress metric (pellets eaten).
    this.scoreText = scene.add
      .text(inset, inset, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        fontStyle: "bold",
        color: colorHex,
      })
      .setScrollFactor(0)
      .setDepth(depth + 1);

    // Top-right: leaderboard rows (pre-allocate topN + 2 for separator + player)
    const maxRows = tuning.hud.leaderboardCount + 2;
    for (let i = 0; i < maxRows; i++) {
      const t = scene.add
        .text(0, 0, "", {
          fontFamily: "system-ui, monospace",
          fontSize: "14px",
          color: colorHex,
        })
        .setScrollFactor(0)
        .setDepth(depth + 1)
        .setVisible(false);
      this.leaderboardTexts.push(t);
      this.lastRowTexts.push("");
      this.lastRowColors.push("");
    }

    // Bottom-left: mute button drawn as a speaker icon.
    this.muteIconGraphics = scene.add.graphics();
    this.muteIconGraphics.setScrollFactor(0).setDepth(depth + 1);
    this.drawMuteIcon();

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.hitsMuteButton(p.x, p.y)) {
        this.mute.toggleMute();
        this.drawMuteIcon();
      }
    });
  }

  private drawMuteIcon(): void {
    const muted = this.mute.isMuted();
    if (this.lastMuted === muted) return;
    this.lastMuted = muted;

    const g = this.muteIconGraphics;
    g.clear();

    const inset = tuning.hud.safeInsetPx;
    const size = tuning.hud.muteButtonSizePx;
    const x = inset;
    const y = this.viewportH - inset - size;

    // Translucent background pad so the icon is visible on any world bg.
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x, y, size, size, 6);

    const iconColor = muted ? 0xff5555 : 0xffffff;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const s = size * 0.36; // half-size of icon body

    // Speaker body: a rectangle (left half) + trapezoid (right half).
    g.fillStyle(iconColor, 1);
    g.beginPath();
    g.moveTo(cx - s, cy - s * 0.4);
    g.lineTo(cx - s * 0.3, cy - s * 0.4);
    g.lineTo(cx + s * 0.2, cy - s);
    g.lineTo(cx + s * 0.2, cy + s);
    g.lineTo(cx - s * 0.3, cy + s * 0.4);
    g.lineTo(cx - s, cy + s * 0.4);
    g.closePath();
    g.fillPath();

    if (muted) {
      // Diagonal slash through the speaker.
      g.lineStyle(3, 0xff5555, 1);
      g.beginPath();
      g.moveTo(x + size * 0.18, y + size * 0.18);
      g.lineTo(x + size * 0.82, y + size * 0.82);
      g.strokePath();
    } else {
      // Two sound waves to the right of the speaker.
      g.lineStyle(2, iconColor, 1);
      const waveX1 = cx + s * 0.4;
      const waveX2 = cx + s * 0.7;
      g.beginPath();
      g.arc(waveX1, cy, s * 0.3, -Math.PI / 3, Math.PI / 3, false);
      g.strokePath();
      g.beginPath();
      g.arc(waveX2, cy, s * 0.55, -Math.PI / 3, Math.PI / 3, false);
      g.strokePath();
    }
  }

  render(player: Snake, world: World): void {
    const length = player.segments.length;
    const score = Math.max(0, length - tuning.snake.initialLength);

    if (score !== this.lastScore) {
      this.scoreText.setText(`Score ${score}`);
      this.lastScore = score;
    }

    // Leaderboard
    const rows = computeLeaderboard(
      world,
      this.playerId,
      tuning.hud.leaderboardCount,
      tuning.hud.alwaysShowPlayerRow,
    );

    const inset = tuning.hud.safeInsetPx;
    const rowH = 18;
    const leaderX = this.viewportW - inset - 160;
    const highlightHex = `#${tuning.hud.playerHighlightColor.toString(16).padStart(6, "0")}`;
    const normalHex = `#${tuning.hud.textColor.toString(16).padStart(6, "0")}`;

    for (let i = 0; i < this.leaderboardTexts.length; i++) {
      const t = this.leaderboardTexts[i];
      if (i >= rows.length) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const row = rows[i];
      if (!t.visible) t.setVisible(true);
      t.setPosition(leaderX, inset + i * rowH);

      const text = row.isPlaceholder
        ? "..."
        : `#${row.rank} ${row.isPlayer ? "YOU" : row.id.slice(0, 8)} ${row.length}`;
      const color = row.isPlaceholder ? "#aaaaaa" : row.isPlayer ? highlightHex : normalHex;

      if (this.lastRowTexts[i] !== text) {
        t.setText(text);
        this.lastRowTexts[i] = text;
      }
      if (this.lastRowColors[i] !== color) {
        t.setColor(color);
        this.lastRowColors[i] = color;
      }
    }
  }

  hitsMuteButton(screenX: number, screenY: number): boolean {
    return hitsButton(screenX, screenY, this.viewportW, this.viewportH);
  }

  destroy(): void {
    this.graphics.destroy();
    this.scoreText.destroy();
    for (const t of this.leaderboardTexts) t.destroy();
    this.muteIconGraphics.destroy();
  }
}
