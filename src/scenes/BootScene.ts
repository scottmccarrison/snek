import * as Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get("offline") === "1") {
      this.scene.start("GameScene", { mode: "solo" });
    } else {
      this.scene.start("LobbyScene");
    }
  }
}
