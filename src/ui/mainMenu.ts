import {
  type PersonalBest,
  getPersonalBests,
  getStoredName,
  isNewPersonalBest,
  recordPersonalBest,
  setStoredName,
} from "../leaderboard";

export type MainMenuMode = "title" | "gameover-solo" | "gameover-mp";

export interface GameoverStats {
  score: number;
  killedBy: string | null;
}

export interface MainMenuCallbacks {
  onStart: (nickname: string) => void;
  onMultiplayer: () => void;
  onRestart: () => void;
  onLeave: () => void;
}

const INITIALS_MAX = 3;
function normalizeInitials(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z]/g, "");
  return s.length > INITIALS_MAX ? s.slice(0, INITIALS_MAX) : s;
}

export class MainMenu {
  private el: HTMLDivElement;
  private cbs: MainMenuCallbacks;
  private currentMode: MainMenuMode = "title";

  constructor(cbs: MainMenuCallbacks) {
    this.cbs = cbs;
    // Defend against stale prior overlay.
    for (const stale of document.querySelectorAll(".snek-menu")) stale.remove();
    this.el = document.createElement("div");
    this.el.className = "snek-menu";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <h1 class="snek-menu-title">snek</h1>
      <p class="snek-menu-stats">Score <span class="snek-menu-score">0</span></p>
      <p class="snek-menu-killer"></p>
      <label class="snek-menu-name-row">
        Initials
        <input class="snek-menu-name" type="text" maxlength="3" placeholder="ABC" autocomplete="off" autocapitalize="characters" pattern="[A-Za-z]{1,3}" />
      </label>
      <div class="snek-menu-bests">
        <div class="snek-menu-bests-title">Your top runs</div>
        <ol class="snek-menu-bests-list"></ol>
        <div class="snek-menu-bests-empty">No runs yet</div>
      </div>
      <button class="snek-menu-primary">START</button>
      <button class="snek-menu-secondary">MULTIPLAYER</button>
      <div class="snek-menu-status"></div>
    `;
    document.body.appendChild(this.el);

    const nameInput = this.el.querySelector<HTMLInputElement>(".snek-menu-name");
    if (nameInput) {
      nameInput.value = normalizeInitials(getStoredName());
      nameInput.addEventListener("input", () => {
        const cleaned = normalizeInitials(nameInput.value);
        if (nameInput.value !== cleaned) nameInput.value = cleaned;
        setStoredName(cleaned);
      });
      nameInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    this.el
      .querySelector<HTMLButtonElement>(".snek-menu-primary")
      ?.addEventListener("click", () => {
        if (this.currentMode === "title") {
          const nick = normalizeInitials(nameInput?.value ?? "") || "ANO";
          this.cbs.onStart(nick);
        } else {
          // gameover-solo or gameover-mp -> RESTART
          this.cbs.onRestart();
        }
      });

    this.el
      .querySelector<HTMLButtonElement>(".snek-menu-secondary")
      ?.addEventListener("click", () => {
        if (this.currentMode === "title") this.cbs.onMultiplayer();
        else this.cbs.onLeave();
      });
  }

  show(mode: MainMenuMode, stats?: GameoverStats): void {
    this.currentMode = mode;
    const isTitle = mode === "title";
    const isGameover = mode === "gameover-solo" || mode === "gameover-mp";

    // Title vs stats visibility
    const titleEl = this.el.querySelector<HTMLHeadingElement>(".snek-menu-title");
    if (titleEl) titleEl.textContent = isTitle ? "snek" : "You died";

    const statsEl = this.el.querySelector<HTMLParagraphElement>(".snek-menu-stats");
    const killerEl = this.el.querySelector<HTMLParagraphElement>(".snek-menu-killer");
    if (isGameover && stats) {
      if (statsEl) {
        statsEl.style.display = "block";
        (statsEl.querySelector(".snek-menu-score") as HTMLSpanElement).textContent = String(
          stats.score,
        );
      }
      if (killerEl) {
        killerEl.style.display = "block";
        let txt = "";
        if (stats.killedBy === null) txt = "Killed by the wall";
        else if (stats.killedBy === "player") txt = "Killed by yourself";
        else txt = `Killed by ${stats.killedBy}`;
        killerEl.textContent = txt;
      }
    } else {
      if (statsEl) statsEl.style.display = "none";
      if (killerEl) killerEl.style.display = "none";
    }

    // Initials input only in title mode
    const nameRow = this.el.querySelector<HTMLLabelElement>(".snek-menu-name-row");
    if (nameRow) nameRow.style.display = isTitle ? "flex" : "none";

    // Button labels
    const primary = this.el.querySelector<HTMLButtonElement>(".snek-menu-primary");
    const secondary = this.el.querySelector<HTMLButtonElement>(".snek-menu-secondary");
    if (primary) primary.textContent = isTitle ? "START" : "RESTART";
    if (secondary) secondary.textContent = isTitle ? "MULTIPLAYER" : "LEAVE";

    // Personal bests rendering. Record + highlight ONLY in gameover-solo.
    let highlightScore = -1;
    if (mode === "gameover-solo" && stats) {
      const newBest = isNewPersonalBest(stats.score, 5);
      recordPersonalBest(stats.score);
      if (newBest) highlightScore = stats.score;
    }
    this.renderPersonalBests(getPersonalBests(), highlightScore);

    this.el.style.display = "flex";
  }

  hide(): void {
    this.el.style.display = "none";
    this.setStatus("");
  }

  setStatus(msg: string): void {
    const el = this.el.querySelector<HTMLDivElement>(".snek-menu-status");
    if (el) el.textContent = msg;
  }

  private renderPersonalBests(list: PersonalBest[], highlightScore: number): void {
    const olEl = this.el.querySelector<HTMLOListElement>(".snek-menu-bests-list");
    const empty = this.el.querySelector<HTMLDivElement>(".snek-menu-bests-empty");
    if (!olEl || !empty) return;
    olEl.innerHTML = "";
    if (list.length === 0) {
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    // Show top 5, highlight the most recent matching the highlightScore.
    const top5 = list.slice(0, 5);
    let highlightIdx = -1;
    if (highlightScore > 0) {
      for (let i = top5.length - 1; i >= 0; i--) {
        if (top5[i].score === highlightScore) {
          highlightIdx = i;
          break;
        }
      }
    }
    for (let i = 0; i < top5.length; i++) {
      const li = document.createElement("li");
      li.textContent = String(top5[i].score);
      if (i === highlightIdx) li.classList.add("snek-menu-bests-current");
      olEl.appendChild(li);
    }
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
