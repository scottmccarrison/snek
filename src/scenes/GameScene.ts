import * as Phaser from "phaser";
import type { FoodRenderState, MinimapHead, SnakeRenderState } from "../../shared/protocol";
import { SoundManager } from "../audio/sound";
import { FoodSpawner } from "../food/foodSpawner";
import { PointerSteering } from "../input/pointer";
import type { RoomHandle } from "../net/wsClient";
import { BotManager } from "../sim/botManager";
import { ClientPrediction } from "../sim/clientPrediction";
import { SnapshotBuffer, type SnapshotFrame, interpSnake } from "../sim/snapshotBuffer";
import { World } from "../sim/world";
import { Snake } from "../snake/snake";
import { type RenderableSnake, SnakeView } from "../snake/snakeView";
import { tuning } from "../tuning";
import { HUD } from "../ui/hud";
import { JoystickIndicator } from "../ui/joystickIndicator";
import { type GameoverStats, MainMenu } from "../ui/mainMenu";
import { Minimap } from "../ui/minimap";

// Deterministic 3-letter initials derived from a snake id. Same id always
// produces the same initials so the leaderboard reads stably across frames.
// Solo-mode only - in MP the leaderboard shows the bot's snake id directly
// (bot1, bot2, ...) since bot display names aren't sent over the wire.
function initialsFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return (
    a[Math.abs(h) % 26] +
    a[Math.abs(Math.imul(h, 7) + 1) % 26] +
    a[Math.abs(Math.imul(h, 13) + 7) % 26]
  );
}

export class GameScene extends Phaser.Scene {
  private world!: World;
  private botManager!: BotManager;
  private snakeViews: Map<string, SnakeView> = new Map();
  private steering!: PointerSteering;
  private joystick!: JoystickIndicator;
  private foodSpawner!: FoodSpawner;
  private minimap!: Minimap;
  private soundManager!: SoundManager;
  // Guard so we only call soundManager.unlock() once per game session.
  private audioUnlocked = false;
  private hud!: HUD;
  private mainMenu: MainMenu | null = null;
  private waitingForRestart = false;
  private worldChromeCreated = false;

  // MP mode state
  private mode: "solo" | "mp" = "solo";
  private room: RoomHandle | null = null;
  private mpSnakeStates = new Map<string, SnakeRenderState>();
  private lastSnapshot: {
    snakes: SnakeRenderState[];
    foods: FoodRenderState[];
    minimapHeads: MinimapHead[];
  } | null = null;
  private snapshotBuffer: SnapshotBuffer | null = null;
  private clientPrediction: ClientPrediction | null = null;
  private mpFoodGraphics: Phaser.GameObjects.Graphics | null = null;
  private lastSentAngle: number | null = null;
  private lastSentBoost: boolean | null = null;
  private mpDeathShown = false;
  // Track player's last-seen segment count from server snapshots so we can
  // show meaningful stats on the death screen (player Snake instance does
  // not exist in MP - snapshots are the only source of truth).
  private lastPlayerSegmentCount = 0;
  // Unsub functions returned by room.onMessage. Called on scene shutdown to
  // prevent stale subscribers from firing after a scene restart.
  private mpUnsubs: Array<() => void> = [];
  // Local player's initials (solo mode). Captured from MainMenu's onStart.
  private soloPlayerNickname = "";
  // MP snake-id -> nickname map. Rebuilt every state message from the
  // server's roster so the leaderboard labels stay current as players
  // join / leave / change names.
  private mpNicknames = new Map<string, string>();

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: {
    mode?: "solo" | "mp";
    room?: RoomHandle;
    code?: string;
    nickname?: string;
  }): void {
    this.mode = data.mode ?? "solo";
    this.room = data.room ?? null;
    this.soloPlayerNickname = data.nickname ?? "";
    this.mpNicknames.clear();
    // Reset MP tracking state on each init so a restart is clean.
    this.mpSnakeStates.clear();
    this.lastSnapshot = null;
    this.lastSentAngle = null;
    this.lastSentBoost = null;
    this.mpDeathShown = false;
    this.lastPlayerSegmentCount = 0;
    // Cancel any leftover room.onMessage subscriptions from a prior session.
    // Without this, a re-entry into MP mode would have stale subscribers
    // firing alongside fresh ones, doubling state handling.
    for (const unsub of this.mpUnsubs) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.mpUnsubs = [];
    // Destroy leftover MP food graphics from a prior session.
    if (this.mpFoodGraphics) {
      this.mpFoodGraphics.destroy();
      this.mpFoodGraphics = null;
    }
  }

  create(): void {
    this.createWorldChrome();
    if (this.mode === "mp") {
      this.startMpGame();
    } else {
      this.startGame();
    }
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

    this.foodSpawner = new FoodSpawner(this);
    this.foodSpawner.update(this.world);

    // Set up bot manager with onBotSpawned callback to create views.
    this.botManager = new BotManager(this.world, this.foodSpawner);
    this.botManager.onBotSpawned = (snake) => {
      const view = new SnakeView(this, snake);
      this.snakeViews.set(snake.id, view);
    };

    // Camera follows the snake head. Phaser.Camera.startFollow's signature
    // accepts `GameObject | object` and reads `.x`/`.y` each frame, so the
    // plain segments[0] works directly with no cast. segments[0] object
    // identity is preserved across reset() by the resetWithLength refactor.
    this.cameras.main.startFollow(player.segments[0], true, tuning.camera.lerp, tuning.camera.lerp);

    this.waitingForRestart = false;
  }

  private startMpGame(): void {
    if (!this.room) return;

    this.soundManager = new SoundManager();
    this.audioUnlocked = false;

    this.minimap = new Minimap(this);
    this.hud = new HUD(this, this.soundManager);

    this.joystick = new JoystickIndicator(this);
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

    // MP food graphics layer (redrawn each frame from snapshot).
    this.mpFoodGraphics = this.add.graphics();

    const snakeId = this.room.snakeId;

    this.snapshotBuffer = new SnapshotBuffer(tuning.net.snapshotBufferSize);
    this.clientPrediction = new ClientPrediction(snakeId);

    // Subscribe to server state snapshots. Cache the player's last-seen
    // length so the death screen has stats to show. Also rebuild the
    // snakeId -> nickname map from the server roster so HUD leaderboard
    // labels show real initials (including other humans + 'YOU' resolves
    // to the local player's stored name).
    this.mpUnsubs.push(
      this.room.onMessage("state", (msg) => {
        const frame: SnapshotFrame = {
          serverTime: msg.serverTime,
          receivedAt: performance.now(),
          phase: msg.phase,
          snakes: msg.snakes,
          foods: msg.foods,
          minimapHeads: msg.minimapHeads,
        };
        this.snapshotBuffer?.push(frame);
        this.lastSnapshot = {
          snakes: msg.snakes,
          foods: msg.foods,
          minimapHeads: msg.minimapHeads,
        };
        const playerSnake = msg.snakes.find((s) => s.id === snakeId);
        if (playerSnake) {
          this.lastPlayerSegmentCount = playerSnake.segments.length;
          const result = this.clientPrediction?.reconcile(playerSnake);
          if (result?.snapped && playerSnake.alive) {
            this.cameras.main.centerOn(playerSnake.segments[0].x, playerSnake.segments[0].y);
          }
        }
        this.mpNicknames.clear();
        for (const p of msg.players) {
          if (p.nickname) this.mpNicknames.set(p.snakeId, p.nickname);
        }
      }),
    );

    // Subscribe to death events - show main menu (gameover-mp) for the player's snake.
    this.mpUnsubs.push(
      this.room.onMessage("snake_died", (msg) => {
        if (msg.snakeId === snakeId && !this.mpDeathShown) {
          this.mpDeathShown = true;
          void this.handleMpDeath(msg.snakeId, msg.killedBy);
        }
      }),
    );

    // Subscribe to respawn events - hide menu when player respawns.
    this.mpUnsubs.push(
      this.room.onMessage("snake_respawned", (msg) => {
        if (msg.snakeId === snakeId && this.mpDeathShown) {
          this.mpDeathShown = false;
          this.mainMenu?.hide();
        }
      }),
    );

    // Handle host-left: tear down and return to BootScene.
    this.mpUnsubs.push(
      this.room.onMessage("game_ended", () => {
        this.scene.start("BootScene");
      }),
    );

    // Handle disconnect - log it and show a status overlay for Phase 5.
    // Full reconnect is Phase 6 polish.
    this.mpUnsubs.push(
      this.room.onClose(() => {
        console.warn("[snek] WebSocket closed in MP mode");
      }),
    );

    // Set up camera at world center initially; will follow player head once
    // we receive the first snapshot with the player snake.
    const worldDims = this.room.worldDims;
    this.cameras.main.setBounds(0, 0, worldDims.w, worldDims.h);
    this.cameras.main.setScroll(worldDims.w / 2 - 640, worldDims.h / 2 - 360);

    this.waitingForRestart = false;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    // Unlock audio on first frame with any input (satisfies iOS gesture policy).
    if (!this.audioUnlocked && this.input.activePointer.isDown) {
      this.soundManager.unlock();
      this.audioUnlocked = true;
    }

    if (this.mode === "mp") {
      this.updateMp(dt);
      return;
    }

    // Solo mode.
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
    // Solo nickname lookup: player row shows stored initials; bots get
    // deterministic random 3-letter initials based on a hash of their id
    // (so 'bot-3' always reads the same letters across the run, making
    // the leaderboard feel like a populated room).
    this.hud.render(player, this.world, (id) => {
      if (id === "player") return this.soloPlayerNickname || undefined;
      return initialsFromId(id);
    });
  }

  private updateMp(dt: number): void {
    if (!this.room) return;

    // Find the player's snake in the latest snapshot for steering + camera.
    const playerState = this.lastSnapshot?.snakes.find((s) => s.id === this.room?.snakeId);

    let steeringDirX = 0;
    let steeringDirY = 0;

    if (playerState?.alive) {
      const head = playerState.segments[0];
      const { dirX, dirY } = this.steering.update(dt, head.x, head.y);
      steeringDirX = dirX;
      steeringDirY = dirY;

      // Send input_dir on change (deadband: 0.01 rad). Use shortest-arc
      // difference so a turn across the +pi/-pi seam doesn't trigger a
      // spurious "huge change" send.
      const angle = Math.atan2(dirY, dirX);
      if (this.lastSentAngle === null) {
        this.room.send({ type: "input_dir", angle });
        this.lastSentAngle = angle;
      } else {
        const rawDelta = Math.abs(angle - this.lastSentAngle);
        const shortest = Math.min(rawDelta, 2 * Math.PI - rawDelta);
        if (shortest > 0.01) {
          this.room.send({ type: "input_dir", angle });
          this.lastSentAngle = angle;
        }
      }

      // Send input_boost on change.
      const boost = this.steering.getBoostHeld();
      if (boost !== this.lastSentBoost) {
        this.room.send({ type: "input_boost", active: boost });
        this.lastSentBoost = boost;
        this.soundManager.setBoosting(boost);
      }

      // Camera follows the player's head. Prefer predicted head (instant
      // feel) over server snapshot head to stay consistent with the rendered
      // snake. Center using live camera dims - Scale.RESIZE means cam.width
      // and cam.height track the actual viewport (smaller on phones).
      const predictedHead = this.clientPrediction?.getSnake()?.segments[0];
      const cameraHead = predictedHead ?? head;
      const cam = this.cameras.main;
      cam.setScroll(cameraHead.x - cam.width / 2, cameraHead.y - cam.height / 2);
    } else {
      // No live player - stop boost sound.
      this.soundManager.setBoosting(false);
    }

    // Step local prediction with the steering vector we just used for input.
    // steeringDirX/steeringDirY captured from input dispatch above.
    // dt is already in seconds.
    const latest = this.snapshotBuffer?.latest() ?? null;
    if (this.clientPrediction && latest?.phase === "playing") {
      this.clientPrediction.step(dt, steeringDirX, steeringDirY, this.steering.getBoostHeld());
    }

    if (latest) {
      const localSnakeId = this.room.snakeId;
      const renderTime = latest.serverTime - tuning.net.interpolationDelayMs;
      const bracket = this.snapshotBuffer?.bracket(renderTime) ?? null;
      const predicted = this.clientPrediction?.getSnake() ?? null;
      const renderSnakes: SnakeRenderState[] = [];
      const prevById = new Map(bracket?.prev.snakes.map((s) => [s.id, s]) ?? []);
      for (const next of bracket?.next.snakes ?? latest.snakes) {
        if (next.id === localSnakeId && predicted) continue; // rendered from prediction below
        const prev = prevById.get(next.id);
        renderSnakes.push(bracket ? interpSnake(prev, next, bracket.alpha) : next);
      }
      const serverPlayer = latest.snakes.find((s) => s.id === localSnakeId);
      if (predicted && serverPlayer) {
        renderSnakes.push({
          id: predicted.id,
          ownerType: "player",
          color: predicted.color,
          alive: !predicted.dead,
          segments: predicted.segments.map((s) => ({ x: s.x, y: s.y })),
          boostActive: predicted.boostActive,
          scale: serverPlayer.scale,
        });
      }
      this.syncMpSnakes(renderSnakes);
      this.syncMpFoods(latest.foods);
    }
    for (const view of this.snakeViews.values()) {
      view.render();
    }

    // Render HUD (score + leaderboard + mute) and Minimap using a thin
    // ViewWorld adapter built from the latest snapshot. Each frame is cheap
    // since the snapshot is small (10-14 snakes max) and HUD setText is
    // cached internally.
    if (this.lastSnapshot && playerState) {
      const head = playerState.segments[0];
      // Humans get nicknames via the players roster (mpNicknames). Bots
      // have no display name on the wire - the HUD falls back to the
      // snake id slice for those rows.
      const lookup = (id: string): string | undefined => {
        return this.mpNicknames.get(id);
      };
      // HUD leaderboard + Minimap both use minimapHeads (full world, not
      // viewport-culled). Without this, far-away bots wouldn't appear in
      // either. HUD's adapter uses a sparse array for segments (only
      // .length is read). Minimap's adapter uses a single-segment array
      // with the head position.
      const heads = this.lastSnapshot.minimapHeads;
      const fullWorld = {
        snakes: {
          *values() {
            for (const h of heads) {
              yield {
                id: h.id,
                segments: new Array(h.length) as ReadonlyArray<{ x: number; y: number }>,
                dead: h.dead,
              };
            }
          },
        },
      };
      this.hud.render({ segments: { length: playerState.segments.length } }, fullWorld, lookup);
      const minimapWorld = {
        snakes: {
          *values() {
            for (const h of heads) {
              yield {
                id: h.id,
                color: h.color,
                segments: [{ x: h.x, y: h.y }],
                dead: h.dead,
              };
            }
          },
        },
      };
      this.minimap.render(head.x, head.y, minimapWorld);
    }
  }

  /**
   * Reconcile snake views with the latest server snapshot. Creates new
   * SnakeView instances for newly-appearing snakes and destroys views for
   * snakes that are no longer in the snapshot.
   */
  private syncMpSnakes(snakes: SnakeRenderState[]): void {
    const seen = new Set<string>();
    for (const s of snakes) {
      seen.add(s.id);
      this.mpSnakeStates.set(s.id, s);
      const renderable: RenderableSnake = {
        id: s.id,
        color: s.color,
        segments: s.segments,
        scale: s.scale,
        boostActive: s.boostActive,
        dead: !s.alive,
        headRadius: tuning.snake.headRadiusPx * s.scale,
        bodyRadius: tuning.snake.bodyRadiusPx * s.scale,
      };
      let view = this.snakeViews.get(s.id);
      if (!view) {
        const isPlayer = s.id === this.room?.snakeId;
        view = new SnakeView(
          this,
          renderable,
          isPlayer
            ? {
                outlineExtraPx: tuning.bot.playerOutlineExtraPx,
                outlineColor: tuning.bot.playerOutlineColor,
                outlineAlpha: tuning.bot.playerOutlineAlpha,
              }
            : undefined,
        );
        this.snakeViews.set(s.id, view);
      } else {
        view.applyState(renderable);
      }
    }
    // Destroy views for snakes no longer in the snapshot.
    for (const [id, view] of this.snakeViews) {
      if (!seen.has(id)) {
        view.destroy();
        this.snakeViews.delete(id);
      }
    }
  }

  /**
   * Redraw all visible food pellets from the server snapshot.
   * Simple full-redraw each frame (no per-food sprites - too many objects).
   * Phase 6 can add spawn animations.
   */
  private syncMpFoods(foods: FoodRenderState[]): void {
    if (!this.mpFoodGraphics) return;
    this.mpFoodGraphics.clear();
    this.mpFoodGraphics.fillStyle(tuning.food.color, 1);
    for (const f of foods) {
      const r = f.isPellet ? tuning.death.pelletRadiusPx : tuning.food.radiusPx;
      this.mpFoodGraphics.fillCircle(f.x, f.y, r);
    }
  }

  private async handleMpDeath(snakeId: string, killedBy: string | null): Promise<void> {
    // Play animation if the view still exists.
    const view = this.snakeViews.get(snakeId);
    if (view) await view.playDeathAnimation();

    this.soundManager.setBoosting(false);
    this.soundManager.playDie();

    // Build stats from the last-seen player snapshot (player Snake instance
    // does not exist in MP - snapshots are the only source of truth).
    const length = this.lastPlayerSegmentCount;
    const score = Math.max(0, length - tuning.snake.initialLength);
    const stats: GameoverStats = { score, killedBy };

    // Destroy any prior menu (shouldn't exist, but guard for safety).
    this.mainMenu?.destroy();
    this.mainMenu = new MainMenu({
      onStart: () => {
        /* no-op in gameover */
      },
      onMultiplayer: () => {
        /* no-op in gameover */
      },
      onRestart: () => {
        this.room?.send({ type: "respawn" });
      },
      onLeave: () => {
        this.handleLeave();
      },
    });
    this.mainMenu.show("gameover-mp", stats);

    // Space-key respawn handler for keyboard users.
    let consumed = false;
    const doRespawn = () => {
      if (consumed) return;
      consumed = true;
      this.room?.send({ type: "respawn" });
    };
    this.input.keyboard?.once("keydown-SPACE", doRespawn);
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
    const stats: GameoverStats = {
      score: Math.max(0, player.segments.length - tuning.snake.initialLength),
      killedBy: player.killedBy,
    };

    // Destroy any prior menu (guard against rapid double-death).
    this.mainMenu?.destroy();
    this.mainMenu = new MainMenu({
      onStart: () => {
        /* no-op in gameover */
      },
      onMultiplayer: () => {
        /* no-op in gameover */
      },
      onRestart: () => {
        this.respawnPlayerInPlace();
      },
      onLeave: () => {
        this.handleLeave();
      },
    });
    this.mainMenu.show("gameover-solo", stats);

    // Space-key respawn handler (keyboard users).
    let consumed = false;
    const doRestart = () => {
      if (consumed) return;
      consumed = true;
      this.respawnPlayerInPlace();
    };
    this.input.keyboard?.once("keydown-SPACE", doRestart);
  }

  private respawnPlayerInPlace(): void {
    const player = this.world.snakes.get("player");
    if (!player) return;
    // Hide the gameover menu (it'll show again on next death).
    this.mainMenu?.hide();
    // Pick a safe spawn point (away from other snakes' bodies).
    const { x, y } = this.pickSafeSpawnPoint();
    player.reset(x, y);
    // Hard-cut camera, then resume follow with the existing lerp.
    this.cameras.main.stopFollow();
    this.cameras.main.centerOn(x, y);
    this.cameras.main.startFollow(player.segments[0], true, tuning.camera.lerp, tuning.camera.lerp);
    this.waitingForRestart = false;
  }

  private pickSafeSpawnPoint(): { x: number; y: number } {
    const clearance = tuning.snake.headRadiusPx * 8;
    const c2 = clearance * clearance;
    for (let attempts = 0; attempts < 16; attempts++) {
      const x = 200 + Math.random() * (tuning.world.widthPx - 400);
      const y = 200 + Math.random() * (tuning.world.heightPx - 400);
      let safe = true;
      for (const other of this.world.snakes.values()) {
        if (other.dead || other.id === "player") continue;
        for (const s of other.segments) {
          const dx = s.x - x;
          const dy = s.y - y;
          if (dx * dx + dy * dy < c2) {
            safe = false;
            break;
          }
        }
        if (!safe) break;
      }
      if (safe) return { x, y };
    }
    return { x: tuning.world.widthPx / 2, y: tuning.world.heightPx / 2 };
  }

  private handleLeave(): void {
    this.mainMenu?.destroy();
    this.mainMenu = null;
    if (this.mode === "mp" && this.room) {
      this.room.leave();
    }
    this.scene.start("BootScene");
  }
}
