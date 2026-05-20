import type * as Phaser from "phaser";
import { tuning } from "../tuning";

interface KillEntry {
  killerLabel: string | null; // null = wall/world death
  victimLabel: string;
  victimIsBot: boolean;
  expiresAt: number; // performance.now() + entryTtlMs
}

// Renders the most recent MP kill events as a fading list top-right under
// the HUD leaderboard. Pure presentation: caller subscribes to snake_died
// and calls add(); render() must be called each frame to drive the fade.
export class Killfeed {
  private entries: KillEntry[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private scene: Phaser.Scene;
  private viewportW: number;
  private resizeHandler: ((g: Phaser.Structs.Size) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width } = scene.scale.gameSize;
    this.viewportW = width;
    const depth = 2100;
    const fontSize = tuning.killfeed.fontSize;
    const colorHex = `#${tuning.hud.textColor.toString(16).padStart(6, "0")}`;
    for (let i = 0; i < tuning.killfeed.maxRows; i++) {
      const t = scene.add
        .text(0, 0, "", {
          fontFamily: "system-ui, monospace",
          fontSize: `${fontSize}px`,
          color: colorHex,
        })
        .setScrollFactor(0)
        .setDepth(depth)
        .setVisible(false);
      this.texts.push(t);
    }
    this.resizeHandler = (g) => {
      this.viewportW = g.width;
    };
    scene.scale.on("resize", this.resizeHandler);
  }

  add(killerLabel: string | null, victimLabel: string, victimIsBot: boolean): void {
    this.entries.push({
      killerLabel,
      victimLabel,
      victimIsBot,
      expiresAt: performance.now() + tuning.killfeed.entryTtlMs,
    });
    while (this.entries.length > tuning.killfeed.maxRows) this.entries.shift();
  }

  render(): void {
    const now = performance.now();
    // Drop expired entries from the front.
    while (this.entries.length > 0 && this.entries[0].expiresAt < now) {
      this.entries.shift();
    }
    const inset = tuning.hud.safeInsetPx;
    const rowH = tuning.killfeed.rowHeightPx;
    const baseY = inset + tuning.killfeed.insetTopPx;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (i >= this.entries.length) {
        if (t.visible) t.setVisible(false);
        continue;
      }
      const e = this.entries[i];
      const remaining = e.expiresAt - now;
      const alpha = Math.max(0, Math.min(1, remaining / 1000));
      const label = e.killerLabel
        ? `${e.killerLabel} -> ${e.victimLabel}`
        : `${e.victimLabel} crashed`;
      if (!t.visible) t.setVisible(true);
      // Italic style for bot victims (visual hint they're not human).
      const style = e.victimIsBot ? "italic" : "normal";
      // Right-align by computing width after setting text.
      t.setStyle({ fontStyle: style });
      t.setText(label);
      const x = this.viewportW - inset - t.width;
      t.setPosition(x, baseY + i * rowH);
      t.setAlpha(alpha);
    }
  }

  destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    for (const t of this.texts) t.destroy();
    this.texts = [];
    this.entries = [];
  }
}
