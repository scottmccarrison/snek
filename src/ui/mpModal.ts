import type { PlayerRosterEntry } from "../../shared/protocol";
import { type NetClient, makeNetClient } from "../net/client";
import type { RoomHandle } from "../net/wsClient";
import { LeaderboardPanel } from "./leaderboardPanel";
import { renderQrCanvas } from "./qrCode";

export interface MpModalCallbacks {
  onGameStart: (room: RoomHandle, code: string) => void;
  onCancel: () => void;
  onGameEnded: () => void;
}

export class MpModal {
  private el: HTMLDivElement;
  private cbs: MpModalCallbacks;
  private netClient: NetClient;
  private busy = false;
  private nickname = "ANO";
  private room: RoomHandle | null = null;
  private myReady = false;
  private stateUnsub: (() => void) | null = null;
  private endedUnsub: (() => void) | null = null;
  private leaderboardPanel: LeaderboardPanel | null = null;

  constructor(cbs: MpModalCallbacks) {
    this.cbs = cbs;
    this.netClient = makeNetClient();
    for (const stale of document.querySelectorAll(".snek-mp-modal")) stale.remove();
    this.el = document.createElement("div");
    this.el.className = "snek-mp-modal";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <h2 class="snek-mp-title">Multiplayer</h2>
      <button class="snek-mp-host">Host new room</button>
      <div class="snek-mp-or">or</div>
      <div class="snek-mp-join-row">
        <input class="snek-mp-code" type="text" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" />
        <button class="snek-mp-join">Join</button>
      </div>
      <button class="snek-mp-cancel">Cancel</button>
      <div class="snek-mp-status"></div>
      <div class="snek-mp-leaderboard-slot"></div>
      <div class="snek-mp-lobby" style="display:none">
        <div class="snek-mp-lobby-code-and-qr">
          <div class="snek-mp-lobby-title">Room <span class="snek-mp-lobby-code"></span></div>
          <canvas class="snek-mp-lobby-qr" width="120" height="120"></canvas>
        </div>
        <ol class="snek-mp-roster"></ol>
        <button class="snek-mp-ready">READY</button>
      </div>
    `;
    document.body.appendChild(this.el);

    const codeInput = this.el.querySelector<HTMLInputElement>(".snek-mp-code");
    if (codeInput) {
      codeInput.addEventListener("input", () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "");
      });
      codeInput.addEventListener("keydown", (e) => e.stopPropagation());
    }

    this.el
      .querySelector<HTMLButtonElement>(".snek-mp-host")
      ?.addEventListener("click", () => this.handleHost());
    this.el
      .querySelector<HTMLButtonElement>(".snek-mp-join")
      ?.addEventListener("click", () => this.handleJoin());
    this.el.querySelector<HTMLButtonElement>(".snek-mp-cancel")?.addEventListener("click", () => {
      if (this.room) {
        this.room.leave();
        this.room = null;
      }
      this.cbs.onCancel();
    });
  }

  show(nickname: string): void {
    this.nickname = nickname;
    this.busy = false;
    this.myReady = false;
    this.setStatus("");
    this.el.style.display = "flex";
    // Mount leaderboard panel into the slot if not already mounted.
    if (!this.leaderboardPanel) {
      const slot = this.el.querySelector<HTMLDivElement>(".snek-mp-leaderboard-slot");
      if (slot) {
        this.leaderboardPanel = new LeaderboardPanel(10);
        this.leaderboardPanel.mount(slot);
      }
    }
  }

  hide(): void {
    this.el.style.display = "none";
    this.leaderboardPanel?.destroy();
    this.leaderboardPanel = null;
  }

  destroy(): void {
    this.tearDownLobbySubs();
    this.leaderboardPanel?.destroy();
    this.leaderboardPanel = null;
    this.hide();
    this.el.remove();
  }

  switchToLobby(room: RoomHandle, code: string): void {
    this.room = room;
    this.myReady = false;
    // Clear any "joining..." / "creating..." status from the pre-join flow.
    this.setStatus("");
    // Hide prejoin UI.
    const hostBtn = this.el.querySelector<HTMLButtonElement>(".snek-mp-host");
    const joinRow = this.el.querySelector<HTMLDivElement>(".snek-mp-join-row");
    const orDiv = this.el.querySelector<HTMLDivElement>(".snek-mp-or");
    if (hostBtn) hostBtn.style.display = "none";
    if (joinRow) joinRow.style.display = "none";
    if (orDiv) orDiv.style.display = "none";
    // Show lobby UI.
    const lobby = this.el.querySelector<HTMLDivElement>(".snek-mp-lobby");
    if (lobby) lobby.style.display = "block";
    const codeSpan = this.el.querySelector<HTMLSpanElement>(".snek-mp-lobby-code");
    if (codeSpan) codeSpan.textContent = code;
    // Render QR code pointing at the share URL.
    const qrCanvas = this.el.querySelector<HTMLCanvasElement>(".snek-mp-lobby-qr");
    if (qrCanvas) {
      const shareUrl = `https://mccarrison.me/snek/?room=${code}`;
      renderQrCanvas(qrCanvas, shareUrl, 120).catch((err) => {
        console.warn(`[qr] render failed: ${err}`);
      });
    }
    // READY toggle.
    const readyBtn = this.el.querySelector<HTMLButtonElement>(".snek-mp-ready");
    if (readyBtn) {
      // Remove any old listeners by cloning.
      const fresh = readyBtn.cloneNode(true) as HTMLButtonElement;
      readyBtn.parentNode?.replaceChild(fresh, readyBtn);
      fresh.addEventListener("click", () => {
        this.myReady = !this.myReady;
        fresh.classList.toggle("ready-active", this.myReady);
        fresh.textContent = this.myReady ? "READY (waiting)" : "READY";
        room.send({ type: "set_ready", ready: this.myReady });
      });
    }
    // Subscribe to state for roster updates.
    this.stateUnsub = room.onMessage("state", (msg) => {
      if (msg.phase === "playing") {
        this.tearDownLobbySubs();
        this.cbs.onGameStart(room, code);
        return;
      }
      this.renderRoster(msg.players);
    });
    this.endedUnsub = room.onMessage("game_ended", () => {
      this.tearDownLobbySubs();
      this.cbs.onGameEnded();
    });
  }

  private renderRoster(players: PlayerRosterEntry[]): void {
    const ol = this.el.querySelector<HTMLOListElement>(".snek-mp-roster");
    if (!ol) return;
    ol.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      const hostTag = p.isHost ? '<span class="snek-mp-host-tag">HOST</span> ' : "";
      const readyBadge = p.ready
        ? '<span class="snek-mp-ready-check">READY</span>'
        : '<span class="snek-mp-ready-not">not ready</span>';
      li.innerHTML = `${hostTag}<span class="snek-mp-roster-name">${p.nickname || "ANO"}</span> ${readyBadge}`;
      ol.appendChild(li);
    }
    // Gate the READY button: needs at least 2 players. Avoids the case where
    // a lone host readies up and the game starts the moment a second player
    // joins (before they had a chance to ready themselves).
    const readyBtn = this.el.querySelector<HTMLButtonElement>(".snek-mp-ready");
    if (readyBtn) {
      const enoughPlayers = players.length >= 2;
      readyBtn.disabled = !enoughPlayers;
      readyBtn.classList.toggle("ready-disabled", !enoughPlayers);
      if (!enoughPlayers) {
        readyBtn.textContent = "Waiting for another player...";
        if (this.myReady) {
          // If our local ready state was true, server now sees only us
          // ready - it won't flip phase due to the size>=2 guard, but
          // sync UI state to false so the button stays disabled.
          this.myReady = false;
          readyBtn.classList.remove("ready-active");
        }
      } else if (!this.myReady) {
        readyBtn.textContent = "READY";
      } else {
        readyBtn.textContent = "READY (waiting)";
      }
    }
  }

  private tearDownLobbySubs(): void {
    this.stateUnsub?.();
    this.endedUnsub?.();
    this.stateUnsub = null;
    this.endedUnsub = null;
  }

  private async handleHost(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setStatus("creating room...");
    try {
      const { code } = await this.netClient.createRoom();
      this.setStatus(`joining ${code}...`);
      const room = await this.netClient.joinRoom(code, this.nickname, 0);
      this.switchToLobby(room, code);
    } catch (err) {
      this.setStatus(`host failed: ${(err as Error).message}`);
      this.busy = false;
    }
  }

  private async handleJoin(): Promise<void> {
    if (this.busy) return;
    const codeInput = this.el.querySelector<HTMLInputElement>(".snek-mp-code");
    const code = (codeInput?.value ?? "").toUpperCase();
    if (code.length !== 4) {
      this.setStatus("enter a 4-letter code");
      return;
    }
    this.busy = true;
    this.setStatus(`joining ${code}...`);
    try {
      const room = await this.netClient.joinRoom(code, this.nickname, 0);
      this.switchToLobby(room, code);
    } catch (err) {
      this.setStatus(`join failed: ${(err as Error).message}`);
      this.busy = false;
    }
  }

  private setStatus(msg: string): void {
    const el = this.el.querySelector<HTMLDivElement>(".snek-mp-status");
    if (el) el.textContent = msg;
  }
}
