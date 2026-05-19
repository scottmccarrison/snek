import * as Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import "./ui/mainMenu.css";
import "./ui/mpModal.css";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#0b0b0f",
  scene: [BootScene, GameScene],
  // Scale.RESIZE: canvas matches the parent (full window) size. No
  // letterboxing on tall phones (iPhone 16 Pro landscape 2.17 ratio vs
  // the old 1280x720 design ratio of 1.78 - the old FIT mode left
  // black bars on the sides). HUD + Minimap listen for the RESIZE event
  // and re-layout to the new viewport dims.
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  dom: {
    createContainer: true,
  },
  // Phaser's default activePointers is 1 - the second touch needed for
  // boost would be silently dropped. 3 = primary steering thumb + boost
  // finger + one slack pointer (palm contact / accidental touches).
  input: {
    activePointers: 3,
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
