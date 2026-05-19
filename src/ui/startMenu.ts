/**
 * StartMenu - DOM overlay shown on game load. Title, name input,
 * personal bests table, Play button.
 *
 * Lifecycle:
 *   - Constructed once at GameScene create. show() in startGame; hide() when
 *     the Play button is tapped (or keyboard Space pressed).
 *   - GameScene gates world.update() on waitingForStart; the menu is shown
 *     over a frozen scene.
 */

import { type PersonalBest, getPersonalBests, getStoredName, setStoredName } from "../leaderboard";

export class StartMenu {
  private el: HTMLDivElement;
  private nameInput: HTMLInputElement;
  private playBtn: HTMLButtonElement;
  private pbList: HTMLOListElement;
  private onPlay: () => void;
  private playing = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(onPlay: () => void) {
    this.onPlay = onPlay;
    // Defend against double-construction (restart leak): remove any stale
    // overlay from a prior StartMenu instance.
    for (const stale of document.querySelectorAll(".snek-start-menu")) {
      stale.remove();
    }
    this.el = document.createElement("div");
    this.el.className = "snek-start-menu";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <h1>snek</h1>
      <p class="snek-start-tagline">drag to steer. hold second finger to boost.</p>
      <label class="snek-start-name-row">
        Name
        <input class="snek-start-name" type="text" maxlength="12" placeholder="anon" autocomplete="off" />
      </label>
      <div class="snek-start-bests">
        <div class="snek-start-bests-title">Your top runs</div>
        <ol class="snek-start-bests-list"></ol>
        <div class="snek-start-bests-empty">No runs yet - go!</div>
      </div>
      <button class="snek-start-play">Play</button>
    `;
    document.body.appendChild(this.el);

    const nameInput = this.el.querySelector<HTMLInputElement>(".snek-start-name");
    const playBtn = this.el.querySelector<HTMLButtonElement>(".snek-start-play");
    const pbList = this.el.querySelector<HTMLOListElement>(".snek-start-bests-list");
    if (!nameInput || !playBtn || !pbList) {
      throw new Error("StartMenu: malformed innerHTML, missing required child elements");
    }
    this.nameInput = nameInput;
    this.playBtn = playBtn;
    this.pbList = pbList;

    this.nameInput.value = getStoredName();
    this.nameInput.addEventListener("input", () => {
      setStoredName(this.nameInput.value);
    });
    // Block keyboard events from bubbling into the game (Space, arrow keys).
    this.nameInput.addEventListener("keydown", (e) => e.stopPropagation());

    this.playBtn.addEventListener("click", () => this.play());
  }

  show(): void {
    this.playing = false;
    this.renderPersonalBests(getPersonalBests());
    this.el.style.display = "flex";
    // Space starts the game from the menu (keyboard-only flow).
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !this.playing) {
        e.preventDefault();
        this.play();
      }
    };
    document.addEventListener("keydown", this.keydownHandler);
  }

  hide(): void {
    this.el.style.display = "none";
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  private play(): void {
    if (this.playing) return;
    this.playing = true;
    this.hide();
    this.onPlay();
  }

  private renderPersonalBests(list: PersonalBest[]): void {
    const empty = this.el.querySelector<HTMLDivElement>(".snek-start-bests-empty");
    this.pbList.innerHTML = "";
    if (list.length === 0) {
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";
    const top5 = list.slice(0, 5);
    for (const pb of top5) {
      const li = document.createElement("li");
      li.textContent = String(pb.score);
      this.pbList.appendChild(li);
    }
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }
}
