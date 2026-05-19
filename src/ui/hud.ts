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
  private lengthText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];
  private muteIcon: Phaser.GameObjects.Text;
  // Cached viewport dimensions for hit-testing.
  private viewportW: number;
  private viewportH: number;

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

    // Top-left: length (large) and score (smaller)
    this.lengthText = scene.add
      .text(inset, inset, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        fontStyle: "bold",
        color: colorHex,
      })
      .setScrollFactor(0)
      .setDepth(depth + 1);

    this.scoreText = scene.add
      .text(inset, inset + 38, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
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
    }

    // Bottom-left: mute button
    const muteY = height - inset - tuning.hud.muteButtonSizePx;
    this.muteIcon = scene.add
      .text(inset, muteY, this.getMuteGlyph(), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "28px",
        color: colorHex,
        backgroundColor: "rgba(0,0,0,0.45)",
        padding: { left: 6, right: 6, top: 4, bottom: 4 },
      })
      .setScrollFactor(0)
      .setDepth(depth + 1)
      .setInteractive({ useHandCursor: true });

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.hitsMuteButton(p.x, p.y)) {
        this.mute.toggleMute();
        this.muteIcon.setText(this.getMuteGlyph());
      }
    });
  }

  private getMuteGlyph(): string {
    return this.mute.isMuted() ? "[OFF]" : "[ON]";
  }

  render(player: Snake, world: World): void {
    const length = player.segments.length;
    const score = Math.max(0, length - tuning.snake.initialLength);

    this.lengthText.setText(`Length ${length}`);
    this.scoreText.setText(`Score ${score}`);

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

    for (let i = 0; i < this.leaderboardTexts.length; i++) {
      const t = this.leaderboardTexts[i];
      if (i >= rows.length) {
        t.setVisible(false);
        continue;
      }
      const row = rows[i];
      t.setVisible(true);
      t.setPosition(leaderX, inset + i * rowH);

      if (row.isPlaceholder) {
        t.setText("...");
        t.setColor("#aaaaaa");
      } else {
        const label = row.isPlayer ? "YOU" : row.id.slice(0, 8);
        t.setText(`#${row.rank} ${label} ${row.length}`);
        const highlightHex = `#${tuning.hud.playerHighlightColor.toString(16).padStart(6, "0")}`;
        const normalHex = `#${tuning.hud.textColor.toString(16).padStart(6, "0")}`;
        t.setColor(row.isPlayer ? highlightHex : normalHex);
      }
    }
  }

  hitsMuteButton(screenX: number, screenY: number): boolean {
    return hitsButton(screenX, screenY, this.viewportW, this.viewportH);
  }

  destroy(): void {
    this.graphics.destroy();
    this.lengthText.destroy();
    this.scoreText.destroy();
    for (const t of this.leaderboardTexts) t.destroy();
    this.muteIcon.destroy();
  }
}
