import * as Phaser from "phaser";
import { getStoredName } from "../leaderboard";
import { MainMenu } from "../ui/mainMenu";
import { MpModal } from "../ui/mpModal";

function currentNick(): string {
  const s = getStoredName()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
  return s.length > 0 ? s : "ANO";
}

export class BootScene extends Phaser.Scene {
  private mainMenu: MainMenu | null = null;
  private mpModal: MpModal | null = null;

  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    // ?offline=1 is a dev shortcut. Skips MainMenu entirely.
    const params = new URLSearchParams(window.location.search);
    if (params.get("offline") === "1") {
      this.scene.start("GameScene", { mode: "solo" });
      return;
    }

    this.mainMenu = new MainMenu({
      onStart: (nickname) => {
        this.tearDown();
        this.scene.start("GameScene", { mode: "solo", nickname });
      },
      onMultiplayer: () => {
        this.mainMenu?.hide();
        this.mpModal = new MpModal({
          onGameStart: (room, code) => {
            this.tearDown();
            this.scene.start("GameScene", { mode: "mp", room, code });
          },
          onCancel: () => {
            this.mpModal?.destroy();
            this.mpModal = null;
            this.mainMenu?.show("title");
          },
          onGameEnded: () => {
            this.mpModal?.destroy();
            this.mpModal = null;
            this.mainMenu?.show("title");
          },
        });
        this.mpModal.show(currentNick());
      },
      onRestart: () => {
        /* no-op in title mode */
      },
      onLeave: () => {
        /* no-op in title mode */
      },
    });
    this.mainMenu.show("title");

    // Deep link: ?room=XXXX auto-opens MpModal and pre-fills the code.
    const rawCode = params.get("room");
    // Scrub the query string after reading so refresh doesn't re-trigger.
    if (params.has("room")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const presetCode = rawCode ? rawCode.toUpperCase() : null;
    if (presetCode && /^[A-Z]{4}$/.test(presetCode)) {
      this.mainMenu.hide();
      this.mpModal = new MpModal({
        onGameStart: (room, code) => {
          this.tearDown();
          this.scene.start("GameScene", { mode: "mp", room, code });
        },
        onCancel: () => {
          this.mpModal?.destroy();
          this.mpModal = null;
          this.mainMenu?.show("title");
        },
        onGameEnded: () => {
          this.mpModal?.destroy();
          this.mpModal = null;
          this.mainMenu?.show("title");
        },
      });
      this.mpModal.show(currentNick());
      // Best-effort: fill the code input and click Join after a tick.
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(".snek-mp-code");
        if (input) input.value = presetCode;
        document.querySelector<HTMLButtonElement>(".snek-mp-join")?.click();
      }, 100);
    }
  }

  private tearDown(): void {
    this.mainMenu?.destroy();
    this.mainMenu = null;
    this.mpModal?.destroy();
    this.mpModal = null;
  }
}
