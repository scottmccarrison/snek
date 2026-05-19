/**
 * DeathScreen - DOM overlay that appears when the player dies. Shows final
 * length, score, killer, personal bests, and "NEW BEST" banner for top-5
 * scores. Provides a tap-to-respawn button and an auto-respawn countdown
 * for kiosk mode. Uses plain DOM (not Phaser DOMContainer) so it renders
 * above the canvas without Phaser's event intercept complications.
 *
 * Lifecycle:
 *   - Constructed once in startGame() (hidden).
 *   - handleDeath() calls show(stats).
 *   - restart() calls hide() BEFORE startGame() to prevent stacked overlays.
 *   - destroy() removes the DOM element and cancels any pending timer.
 */

import { type PersonalBest, isNewPersonalBest, recordPersonalBest } from "../leaderboard";

export interface DeathStats {
  length: number;
  score: number;
  killedBy: string | null;
}

export class DeathScreen {
  private el: HTMLDivElement;
  private autoRespawnTimer: ReturnType<typeof setInterval> | null = null;
  private onRespawn: () => void;
  private respawning = false;

  constructor(onRespawn: () => void) {
    this.onRespawn = onRespawn;
    // Defend against double-construction (restart leak): remove any stale
    // overlay from a prior DeathScreen instance that wasn't destroyed.
    for (const stale of document.querySelectorAll(".snek-death-screen")) {
      stale.remove();
    }
    this.el = document.createElement("div");
    this.el.className = "snek-death-screen";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <h1>You died</h1>
      <div class="snek-death-new-best">NEW BEST!</div>
      <p class="snek-death-stats">
        Score <span class="snek-death-score">0</span>
      </p>
      <p class="snek-death-killer">Killed by the wall</p>
      <div class="snek-death-bests">
        <div class="snek-death-bests-title">Your top runs</div>
        <ol class="snek-death-bests-list"></ol>
      </div>
      <button class="snek-death-respawn">Tap to play again</button>
      <p class="snek-death-auto">Auto-respawn in <span class="snek-death-timer">10</span>s</p>
    `;
    document.body.appendChild(this.el);
    const btn = this.el.querySelector<HTMLButtonElement>(".snek-death-respawn");
    btn?.addEventListener("click", () => this.respawn());
  }

  show(stats: DeathStats): void {
    this.respawning = false;

    (this.el.querySelector(".snek-death-score") as HTMLSpanElement).textContent = String(
      stats.score,
    );

    let killerText: string;
    if (stats.killedBy === null) {
      killerText = "Killed by the wall";
    } else if (stats.killedBy === "player") {
      killerText = "Killed by yourself";
    } else {
      killerText = `Killed by ${stats.killedBy}`;
    }
    (this.el.querySelector(".snek-death-killer") as HTMLParagraphElement).textContent = killerText;

    // Compare BEFORE recording so the comparison is against the pre-insertion
    // list (the recorded score would otherwise always be in the new list).
    const newBest = isNewPersonalBest(stats.score, 5);
    const updatedList = recordPersonalBest(stats.score);
    this.renderPersonalBests(updatedList, newBest, stats.score);

    const banner = this.el.querySelector<HTMLDivElement>(".snek-death-new-best");
    if (banner) banner.style.display = newBest ? "block" : "none";

    this.el.style.display = "block";

    let remaining = 10;
    (this.el.querySelector(".snek-death-timer") as HTMLSpanElement).textContent = String(remaining);
    this.autoRespawnTimer = setInterval(() => {
      remaining--;
      const timerEl = this.el.querySelector(".snek-death-timer") as HTMLSpanElement;
      if (timerEl) timerEl.textContent = String(remaining);
      if (remaining <= 0) {
        this.respawn();
      }
    }, 1000);
  }

  /**
   * Render the top-5 personal bests with the just-scored entry highlighted.
   * If newBest is true AND justScored matches an entry, that entry is the
   * highlighted one (handles tied-score case by matching just the most
   * recent entry with that score).
   */
  private renderPersonalBests(list: PersonalBest[], newBest: boolean, justScored: number): void {
    const olEl = this.el.querySelector<HTMLOListElement>(".snek-death-bests-list");
    if (!olEl) return;
    olEl.innerHTML = "";
    const top5 = list.slice(0, 5);
    // Find the most recently-added entry with the just-scored value so we
    // can highlight it. Recorded entries are sorted by score desc then by
    // 'at' asc, so among ties we want the LAST one with that score.
    let highlightIdx = -1;
    if (newBest && justScored > 0) {
      for (let i = top5.length - 1; i >= 0; i--) {
        if (top5[i].score === justScored) {
          highlightIdx = i;
          break;
        }
      }
    }
    for (let i = 0; i < top5.length; i++) {
      const li = document.createElement("li");
      li.textContent = String(top5[i].score);
      if (i === highlightIdx) li.classList.add("snek-death-bests-current");
      olEl.appendChild(li);
    }
  }

  private respawn(): void {
    if (this.respawning) return;
    this.respawning = true;
    this.hide();
    this.onRespawn();
  }

  hide(): void {
    if (this.autoRespawnTimer !== null) {
      clearInterval(this.autoRespawnTimer);
      this.autoRespawnTimer = null;
    }
    this.el.style.display = "none";
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
