import * as Phaser from "phaser";
import { SpatialHash } from "../../shared/spatialHash";
import { SoundManager } from "../audio/sound";
import { type FoodItem, FoodSpawner } from "../food/foodSpawner";
import { PointerSteering } from "../input/pointer";
import { BotManager } from "../sim/botManager";
import { World } from "../sim/world";
import { Snake } from "../snake/snake";
import { SnakeView } from "../snake/snakeView";
import { tuning } from "../tuning";
import { DeathScreen } from "../ui/deathScreen";
import { HUD } from "../ui/hud";
import { JoystickIndicator } from "../ui/joystickIndicator";
import { Minimap } from "../ui/minimap";

export class GameScene extends Phaser.Scene {
  private world!: World;
  private botManager!: BotManager;
  private snakeViews: Map<string, SnakeView> = new Map();
  private steering!: PointerSteering;
  private joystick!: JoystickIndicator;
  private foodHash!: SpatialHash<FoodItem>;
  private foodSpawner!: FoodSpawner;
  private minimap!: Minimap;
  private soundManager!: SoundManager;
  // Guard so we only call soundManager.unlock() once per game session.
  private audioUnlocked = false;
  private hud!: HUD;
  private deathScreen!: DeathScreen;
  private waitingForRestart = false;
  private worldChromeCreated = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.createWorldChrome();
    this.startGame();
  }

  // Static world dressing - background grid, edges, vignette. Created once.
  private createWorldChrome(): void {
    if (this.worldChromeCreated) return;
    this.worldChromeCreated = true;

    // Procedural grid texture.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(tuning.world.bgFillColor, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, tuning.world.bgGridColor, 0.5);
    g.lineBetween(0, 0, 32, 0);
    g.lineBetween(0, 0, 0, 32);
    g.generateTexture("snek-grid", 32, 32);
    g.destroy();

    // Tiled background filling the world.
    const bg = this.add.tileSprite(
      tuning.world.widthPx / 2,
      tuning.world.heightPx / 2,
      tuning.world.widthPx,
      tuning.world.heightPx,
      "snek-grid",
    );
    bg.setDepth(-100);

    // Edge vignette (semi-transparent rects, one per edge).
    const v = this.add.graphics();
    v.fillStyle(tuning.edge.vignetteColor, tuning.edge.vignetteAlpha);
    v.fillRect(0, 0, tuning.world.widthPx, tuning.edge.vignettePx);
    v.fillRect(
      0,
      tuning.world.heightPx - tuning.edge.vignettePx,
      tuning.world.widthPx,
      tuning.edge.vignettePx,
    );
    v.fillRect(0, 0, tuning.edge.vignettePx, tuning.world.heightPx);
    v.fillRect(
      tuning.world.widthPx - tuning.edge.vignettePx,
      0,
      tuning.edge.vignettePx,
      tuning.world.heightPx,
    );
    v.setDepth(-95);

    // World boundary stroke.
    const border = this.add.graphics();
    border.lineStyle(tuning.edge.borderPx, tuning.edge.borderColor, 1);
    border.strokeRect(0, 0, tuning.world.widthPx, tuning.world.heightPx);
    border.setDepth(-90);

    // Camera bounds.
    this.cameras.main.setBounds(0, 0, tuning.world.widthPx, tuning.world.heightPx);
  }

  private startGame(): void {
    const cx = tuning.world.widthPx / 2;
    const cy = tuning.world.heightPx / 2;

    // SoundManager first - constructed before anything that might reference it.
    this.soundManager = new SoundManager();
    this.audioUnlocked = false;

    // Set up world with event handler.
    this.world = new World({
      onSnakeDied: (snakeId, killedBy) => this.onSnakeDiedHandler(snakeId, killedBy),
    });

    // Create player snake with explicit config (white outline for distinction).
    const player = new Snake(cx, cy, {
      id: "player",
      ownerType: "player",
      color: tuning.snake.headColor,
    });
    this.world.addSnake(player);
    const playerView = new SnakeView(this, player, {
      outlineExtraPx: tuning.bot.playerOutlineExtraPx,
      outlineColor: tuning.bot.playerOutlineColor,
      outlineAlpha: tuning.bot.playerOutlineAlpha,
    });
    this.snakeViews.set("player", playerView);

    // Construct minimap first so the steering callback can reference it.
    this.minimap = new Minimap(this);

    // HUD above minimap (depth 2100). SoundManager (from PR 1) satisfies
    // the MuteController interface that HUD's mute button needs.
    this.hud = new HUD(this, this.soundManager);

    // DeathScreen replaces the old Phaser restartPrompt.
    this.deathScreen = new DeathScreen(() => this.restart());

    this.joystick = new JoystickIndicator(this);
    // Extend steering's shouldIgnore to OR-combine minimap + mute button so
    // tapping mute does not also anchor the joystick.
    this.steering = new PointerSteering(
      this,
      (screenX, screenY) =>
        this.minimap.hitsMinimap(screenX, screenY) || this.hud.hitsMuteButton(screenX, screenY),
      {
        onTouchStart: (sx, sy) => this.joystick.show(sx, sy),
        onTouchMove: (sx, sy) => this.joystick.updateStick(sx, sy),
        onTouchEnd: () => this.joystick.hide(),
      },
    );

    this.foodHash = new SpatialHash<FoodItem>(tuning.world.spatialBucketPx);
    this.foodSpawner = new FoodSpawner(this, this.foodHash);
    this.foodSpawner.update(this.world);

    // Set up bot manager with onBotSpawned callback to create views.
    this.botManager = new BotManager(this.world, this.foodSpawner);
    this.botManager.onBotSpawned = (snake) => {
      const view = new SnakeView(this, snake);
      this.snakeViews.set(snake.id, view);
    };

    // Camera follows the snake head. Phaser.Camera.startFollow's signature
    // accepts `GameObject | object` and reads `.x`/`.y` each frame, so the
    // plain segments[0] works directly with no cast. Re-call after every
    // Snake construction OR Snake.reset() - segments[0] object identity
    // changes on reset.
    this.cameras.main.startFollow(player.segments[0], true, tuning.camera.lerp, tuning.camera.lerp);

    this.waitingForRestart = false;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    // Unlock audio on first frame with any input (satisfies iOS gesture policy).
    if (!this.audioUnlocked && this.input.activePointer.isDown) {
      this.soundManager.unlock();
      this.audioUnlocked = true;
    }

    if (this.waitingForRestart) return;

    const player = this.world.snakes.get("player");
    if (!player || player.dead) return;

    const head = player.segments[0];
    const { dirX, dirY } = this.steering.update(dt, head.x, head.y);
    player.pendingDirX = dirX;
    player.pendingDirY = dirY;

    // Boost: read second-touch or Space from steering, apply to player only.
    // Bots do NOT boost in Phase 4.
    player.boostActive = this.steering.getBoostHeld();
    this.soundManager.setBoosting(player.boostActive);

    this.botManager.update(dt, head.x, head.y);
    this.world.update(dt);

    // Consume shed positions from boost and spawn them as pellets.
    // Player only - bots never shed via boost in Phase 4.
    const shed = player.consumeShedPositions();
    if (shed.length > 0) {
      this.foodSpawner.spawnPelletsAt(shed);
    }

    // Every living snake gets a chance to eat food (not just the player).
    // Without this, bots stop on top of pellets without consuming them and
    // oscillate around them via the seek_food FSM state.
    for (const snake of this.world.snakes.values()) {
      if (snake.dead) continue;
      const eaten = this.foodSpawner.checkEat(snake);
      // Eat sound fires only for the player to avoid bot-eat spam.
      if (snake.id === "player" && eaten > 0) {
        this.soundManager.playEat();
      }
    }
    this.foodSpawner.update(this.world);

    // Death checks (self-collision, out-of-bounds, snake-vs-snake) all run
    // inside World.update and fire onSnakeDied uniformly. GameScene's
    // handler routes player deaths to handleDeath and bot deaths to
    // BotManager's respawn timer. Nothing to check here.

    // Render all snake views.
    for (const view of this.snakeViews.values()) {
      view.render();
    }

    this.minimap.render(head.x, head.y, this.world);
    this.hud.render(player, this.world);
  }

  private onSnakeDiedHandler(snakeId: string, _killedBy: string | null): void {
    if (snakeId === "player") {
      void this.handleDeath();
      return;
    }
    // Bot death: remove its view and let BotManager handle respawn + pellets.
    const view = this.snakeViews.get(snakeId);
    if (view) {
      view.destroy();
      this.snakeViews.delete(snakeId);
    }
    this.botManager.handleSnakeDeath(snakeId);
  }

  private async handleDeath(): Promise<void> {
    const player = this.world.snakes.get("player");
    if (!player) return;
    player.die();
    // Stop boost loop and play death sound. Order matters: stop boost first
    // so the oscillator doesn't overlap the die sound.
    this.soundManager.setBoosting(false);
    this.soundManager.playDie();
    const view = this.snakeViews.get("player");
    if (view) await view.playDeathAnimation();

    this.waitingForRestart = true;
    const stats = {
      length: player.segments.length,
      score: Math.max(0, player.segments.length - tuning.snake.initialLength),
      killedBy: player.killedBy,
    };
    this.deathScreen.show(stats);

    // Space-key respawn handler (keyboard users).
    let consumed = false;
    const doRestart = () => {
      if (consumed) return;
      consumed = true;
      this.deathScreen.hide();
      this.restart();
    };
    this.input.keyboard?.once("keydown-SPACE", doRestart);
  }

  private restart(): void {
    // Hide death screen before teardown so a rapid double-death can't stack overlays.
    this.deathScreen.hide();
    this.hud.destroy();

    for (const view of this.snakeViews.values()) {
      view.destroy();
    }
    this.snakeViews.clear();
    this.steering.destroy();
    this.joystick.destroy();
    this.foodSpawner.destroy();
    this.foodHash.clear();
    this.minimap.destroy();
    this.botManager.destroy();
    this.startGame();
  }
}
