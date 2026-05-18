import * as Phaser from "phaser";

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    const { width, height } = this.scale.gameSize;
    const rect = this.add.rectangle(width / 2, height / 2, 200, 200, 0x4caf50);
    this.add
      .text(width / 2, height / 2 + 140, "snek", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#e0e0e0",
      })
      .setOrigin(0.5);
    void rect;
  }
}
