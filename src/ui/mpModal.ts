import { type NetClient, makeNetClient } from "../net/client";
import type { RoomHandle } from "../net/wsClient";

export interface MpModalCallbacks {
  onJoined: (room: RoomHandle, code: string) => void;
  onCancel: () => void;
}

export class MpModal {
  private el: HTMLDivElement;
  private cbs: MpModalCallbacks;
  private netClient: NetClient;
  private busy = false;
  private nickname = "ANO";

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
    this.el
      .querySelector<HTMLButtonElement>(".snek-mp-cancel")
      ?.addEventListener("click", () => this.cbs.onCancel());
  }

  show(nickname: string): void {
    this.nickname = nickname;
    this.busy = false;
    this.setStatus("");
    this.el.style.display = "flex";
  }

  hide(): void {
    this.el.style.display = "none";
  }

  destroy(): void {
    this.hide();
    this.el.remove();
  }

  private async handleHost(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setStatus("creating room...");
    try {
      const { code } = await this.netClient.createRoom();
      this.setStatus(`joining ${code}...`);
      const room = await this.netClient.joinRoom(code, this.nickname, 0);
      this.cbs.onJoined(room, code);
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
      this.cbs.onJoined(room, code);
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
