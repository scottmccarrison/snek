/**
 * DeathScreen - DOM overlay that appears when the player dies. Shows final
 * length, score, and killer. Provides a tap-to-respawn button and an
 * auto-respawn countdown for kiosk mode. Uses plain DOM (not Phaser DOMContainer)
 * so it renders above the canvas without Phaser's event intercept complications.
 *
 * Lifecycle:
 *   - Constructed once in startGame() (hidden).
 *   - handleDeath() calls show(stats).
 *   - restart() calls hide() BEFORE startGame() to prevent stacked overlays.
 *   - destroy() removes the DOM element and cancels any pending timer.
 */

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
      <p class="snek-death-stats">
        Length <span class="snek-death-length">0</span><br>
        Score <span class="snek-death-score">0</span>
      </p>
      <p class="snek-death-killer">Killed by the wall</p>
      <button class="snek-death-respawn">Tap to play again</button>
      <p class="snek-death-auto">Auto-respawn in <span class="snek-death-timer">10</span>s</p>
    `;
    document.body.appendChild(this.el);
    const btn = this.el.querySelector<HTMLButtonElement>(".snek-death-respawn");
    btn?.addEventListener("click", () => this.respawn());
  }

  show(stats: DeathStats): void {
    this.respawning = false;
    (this.el.querySelector(".snek-death-length") as HTMLSpanElement).textContent = String(
      stats.length,
    );
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
