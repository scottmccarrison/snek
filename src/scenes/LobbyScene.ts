/**
 * LobbyScene - DOM-augmented Phaser scene that replaces StartMenu.
 * Shows host/join/offline buttons, name input, personal bests, and
 * handles ?room=CODE deep-link auto-join.
 *
 * Three flows:
 *   Host: POST /api/room -> join returned code -> GameScene(mode:mp)
 *   Join: WS connect to code -> GameScene(mode:mp)
 *   Offline: GameScene(mode:solo) - existing solo + bots flow
 */

import * as Phaser from "phaser";
import { getPersonalBests, getStoredName, setStoredName } from "../leaderboard";
import { type NetClient, makeNetClient } from "../net/client";
import "./LobbyScene.css";

export class LobbyScene extends Phaser.Scene {
  private netClient!: NetClient;
  private overlay!: HTMLDivElement;
  private joining = false;

  constructor() {
    super({ key: "LobbyScene" });
  }

  create(): void {
    this.netClient = makeNetClient();
    this.buildOverlay();
    // Auto-fill from ?room=
    const params = new URLSearchParams(window.location.search);
    const presetCode = params.get("room");
    if (presetCode) {
      const codeInput = this.overlay.querySelector<HTMLInputElement>(".snek-lobby-code");
      if (codeInput) codeInput.value = presetCode.toUpperCase();
      // Auto-join after a short tick so the user sees what is happening.
      setTimeout(() => this.handleJoin(), 200);
    }
  }

  private buildOverlay(): void {
    // Remove any stale overlay from a prior scene instance.
    for (const stale of document.querySelectorAll(".snek-lobby")) stale.remove();
    this.overlay = document.createElement("div");
    this.overlay.className = "snek-lobby";
    this.overlay.innerHTML = `
      <h1>snek</h1>
      <p class="snek-lobby-tagline">drag to steer. hold a second finger to boost.</p>
      <label class="snek-lobby-name-row">
        Name
        <input class="snek-lobby-name" type="text" maxlength="12" placeholder="anon" autocomplete="off" />
      </label>
      <button class="snek-lobby-host">Host new room</button>
      <div class="snek-lobby-join-row">
        <input class="snek-lobby-code" type="text" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" />
        <button class="snek-lobby-join">Join</button>
      </div>
      <button class="snek-lobby-offline">Play offline</button>
      <div class="snek-lobby-bests">
        <div class="snek-lobby-bests-title">Your offline runs</div>
        <ol class="snek-lobby-bests-list"></ol>
        <div class="snek-lobby-bests-empty">No runs yet - go!</div>
      </div>
      <div class="snek-lobby-status"></div>
    `;
    document.body.appendChild(this.overlay);

    const nameInput = this.overlay.querySelector<HTMLInputElement>(".snek-lobby-name");
    if (nameInput) {
      nameInput.value = getStoredName();
      nameInput.addEventListener("input", () => setStoredName(nameInput.value));
      nameInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    const codeInput = this.overlay.querySelector<HTMLInputElement>(".snek-lobby-code");
    if (codeInput) {
      codeInput.addEventListener("input", () => {
        codeInput.value = codeInput.value.toUpperCase();
      });
      codeInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    this.overlay
      .querySelector<HTMLButtonElement>(".snek-lobby-host")
      ?.addEventListener("click", () => this.handleHost());
    this.overlay
      .querySelector<HTMLButtonElement>(".snek-lobby-join")
      ?.addEventListener("click", () => this.handleJoin());
    this.overlay
      .querySelector<HTMLButtonElement>(".snek-lobby-offline")
      ?.addEventListener("click", () => this.handleOffline());

    this.renderPersonalBests();
  }

  private async handleHost(): Promise<void> {
    if (this.joining) return;
    this.joining = true;
    this.setStatus("creating room...");
    try {
      const { code } = await this.netClient.createRoom();
      this.setStatus(`joining ${code}...`);
      const nickname = this.getNickname();
      const room = await this.netClient.joinRoom(code, nickname, 0);
      this.tearDown();
      this.scene.start("GameScene", { mode: "mp", room, code });
    } catch (err) {
      this.setStatus(`failed: ${(err as Error).message}`);
      this.joining = false;
    }
  }

  private async handleJoin(): Promise<void> {
    if (this.joining) return;
    const codeInput = this.overlay.querySelector<HTMLInputElement>(".snek-lobby-code");
    const code = (codeInput?.value ?? "").toUpperCase();
    if (code.length !== 4) {
      this.setStatus("enter a 4-letter code");
      return;
    }
    this.joining = true;
    this.setStatus(`joining ${code}...`);
    try {
      const nickname = this.getNickname();
      const room = await this.netClient.joinRoom(code, nickname, 0);
      this.tearDown();
      this.scene.start("GameScene", { mode: "mp", room, code });
    } catch (err) {
      this.setStatus(`failed: ${(err as Error).message}`);
      this.joining = false;
    }
  }

  private handleOffline(): void {
    this.tearDown();
    this.scene.start("GameScene", { mode: "solo" });
  }

  private renderPersonalBests(): void {
    const list = getPersonalBests();
    const olEl = this.overlay.querySelector<HTMLOListElement>(".snek-lobby-bests-list");
    const empty = this.overlay.querySelector<HTMLDivElement>(".snek-lobby-bests-empty");
    if (!olEl || !empty) return;
    olEl.innerHTML = "";
    if (list.length === 0) {
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    for (const pb of list.slice(0, 5)) {
      const li = document.createElement("li");
      li.textContent = String(pb.score);
      olEl.appendChild(li);
    }
  }

  private getNickname(): string {
    const input = this.overlay.querySelector<HTMLInputElement>(".snek-lobby-name");
    const v = (input?.value ?? "").trim();
    return v.length > 0 ? v : "anon";
  }

  private setStatus(msg: string): void {
    const el = this.overlay.querySelector<HTMLDivElement>(".snek-lobby-status");
    if (el) el.textContent = msg;
  }

  private tearDown(): void {
    this.overlay.remove();
  }
}
