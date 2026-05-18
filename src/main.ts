import * as Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: "game-container",
  backgroundColor: "#0b0b0f",
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  dom: {
    createContainer: true,
  },
};

const game = new Phaser.Game(config);

// iOS Safari reports new innerWidth/innerHeight asynchronously after rotation.
// Refresh Phaser's scale twice to catch both windows. Idempotent.
const refreshScale = () => {
  setTimeout(() => game.scale.refresh(), 100);
  setTimeout(() => game.scale.refresh(), 500);
};
window.addEventListener("orientationchange", refreshScale);
if (
  typeof screen !== "undefined" &&
  screen.orientation &&
  typeof screen.orientation.addEventListener === "function"
) {
  screen.orientation.addEventListener("change", refreshScale);
}
