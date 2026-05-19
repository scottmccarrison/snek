# snek Phase 4 - Polish + feel

## Context

Phase 4 of the snek roadmap. Game is fun and stable through Phase 3 + recent tuning (issues #46 - #55). This phase adds the things needed for "fun for 5+ minutes on a real phone": boost mechanic, HUD with score+leaderboard, death/respawn screen, mobile touch polish, minimal audio. Exit criterion: Scott plays for an evening before greenlighting Phase 5 (multiplayer).

Per the snek CLAUDE.md, this is the milestone after which we tag `v0.1.0-mvp` and start MP work.

## Workstream split

Two agents implementing in parallel worktrees, merged sequentially.

**PR 1 - Input + Audio (WS A)**: boost mechanic, touch refinement, audio.
**PR 2 - UI overlays (WS B)**: HUD with top-5 leaderboard, death screen DOM overlay.
**PR 3 - Phase doc + tag**: commit canonical plan to `docs/plans/phase-4-polish.md`, tag `v0.1.0-mvp` on main.

**Parallel build, sequential merge.** Both PRs branch from main and develop independently. PR 1 lands first. PR 2 then rebases on main and merges. The HUD's mute button depends directly on `SoundManager` (PR 1) - no try/catch fallbacks; PR 2 imports it normally.

## Hard constraints (every agent prompt)

- **No em dashes anywhere.** grep-verify before commit.
- **All new tunables in `src/tuning.ts`** under the appropriate block.
- **Mobile-first**: every change must keep working on touch.
- **Existing tests must pass.** 61 tests on main today. Each PR adds tests for new behavior.
- **Touch-first UX**: boost must work on a single thumb. HUD must not block thumb steering area.

## PR 1 - Input + Audio (WS A)

**Worktree**: `/home/scott/snek-ws1`
**Branch**: `feature/phase-4-boost-audio`

### 4.1 Boost mechanic

**Tuning additions** (`tuning.snake.*`):
```ts
boostSpeedMultiplier: 1.7;          // 1.7x base speed during boost
boostDrainPerSec: 1.2;              // segments shed per second of boost
boostMinLength: 8;                  // must have at least this many segments to boost
```
(Shed pellets reuse `tuning.death.pelletGrowthMultiplier`.)

**Snake API changes** (`src/snake/snake.ts`):
- New field `boostActive: boolean = false`. Set externally (GameScene reads input, sets the flag).
- New internal `boostShedAccumulator: number = 0` (fractional segments owed for shedding).
- New internal `shedPositions: {x:number; y:number}[] = []` (positions of segments shed this frame).
- In `update()`:
  - Precompute `const speedMul = this.boostActive && this.segments.length > tuning.snake.boostMinLength ? tuning.snake.boostSpeedMultiplier : 1;`. Use `speedMul * tuning.snake.speedPxPerSec` in BOTH the head-advance math (lines 110-111) AND the `minEntriesNeeded` headPath ring-buffer math (lines 152-158) - the buffer must grow proportionally with speed or the chain visually snaps during boost.
  - If `boostActive && segments.length > tuning.snake.boostMinLength`:
    - `boostShedAccumulator += tuning.snake.boostDrainPerSec * dt`
    - while accumulator >= 1: pop a tail segment via `segments.pop()`, push its position into `shedPositions`, accumulator -= 1
    - if length drops to `boostMinLength`, force `boostActive = false`
- Expose `consumeShedPositions(): {x:number, y:number}[]` that returns and clears `shedPositions`. GameScene calls this for the player only.

**FoodSpawner change** (`src/food/foodSpawner.ts`):
- New `spawnPelletsAt(positions: ReadonlyArray<{x:number; y:number}>)`: helper to spawn pellets at exact positions (no jitter ring, no count math - we're passing the literal tail positions). Sets `isPellet: true` on each FoodItem.
- Boost-shed pellets reuse the existing death-pellet growth math (`tuning.death.pelletGrowthMultiplier`). We do NOT introduce a separate `isBoostShed` flag or `boostPelletGrowthMultiplier` tuning - keep `FoodItem` schema lean. (If boost pellets ever need different growth, that's a future tuning addition; for the MVP, "shed pellet behaves like death pellet" is fine.)

**Input** (`src/input/pointer.ts`):
- Add `private touchCount: number = 0`. **Increment BEFORE the early-return guard** in `onPointerDown` (the existing `if (this.activeTouchId !== null) return;` at line 76 rejects secondary touches - if we incremented after, we'd never see secondary touches). Same in `onPointerUp` - decrement BEFORE the `if (p.id !== this.activeTouchId) return;` at line 107. Decrement to a `Math.max(0, touchCount - 1)` floor so we never go negative on stray events.
- Add Space-bar boost via explicit key: in constructor, `this.spaceKey = scene.input.keyboard?.addKey("SPACE") ?? null;`. Read via `this.spaceKey?.isDown`. Do NOT rely on `arrows.space` (CursorKeys shape varies across Phaser versions).
- `getBoostHeld(): boolean { return this.touchCount > 1 || !!this.spaceKey?.isDown; }`

**GameScene wiring**:
- After `steering.update(...)`, read `boost = steering.getBoostHeld()` and set `player.boostActive = boost`.
- After `world.update`, ONLY for the player snake (NOT iterated over all snakes): `const shed = player.consumeShedPositions(); if (shed.length) foodSpawner.spawnPelletsAt(shed);`. Bots never set boostActive=true so they never have shed positions, but explicitly gating to player avoids confusion.

**Bots**: do NOT boost in Phase 4. Keep their `boostActive = false` always. Simplifies AI and avoids new heuristics during MVP. Add a regression test: after 500 bot frames in a fully-stocked world, no bot has `boostActive === true`.

**Visual**: glow during boost. Add an outline ring tint to `SnakeView` when `snake.boostActive` is true. Reuse the existing playerOutline mechanism with a hotter color (e.g. tuning addition `bot.playerBoostOutlineColor: 0xffeb3b`).

**Tests** (boost - new in PR 1):
1. `snake boost: speed is multiplied when boostActive`
2. `snake boost: shed accumulator drains length over time`
3. `snake boost: forced off when length drops to boostMinLength`
4. `snake boost: consumeShedPositions returns and clears`
5. `bots never set boostActive=true across a 500-frame run`
6. `pointer: touchCount > 1 reports boost held`
7. `pointer: Space key reports boost held`

### 4.4 Mobile touch refinement (rolled into PR 1)

Touch-input is the same file. Bundling.

- Add `pointercancel` handler that mirrors `pointerup`: releases the active touch AND decrements `touchCount`. Fixes iOS Safari focus-loss (address bar, share sheet, context menu eat the touch without firing pointerup).
- Add a `visibilitychange` listener at the document level: if the page becomes hidden (`document.hidden === true`), release the active touch and zero the touchCount. Covers the "user switched apps mid-game" case.
- **Do NOT use a time-since-move timeout.** A stationary held thumb fires no `pointermove` events but is still a valid intentional input (gliding straight forward). The original review caught this; the timeout approach is rejected.
- `tuning.joystick.minDragPx` stays at 8 unless mobile QA shows micro-twitching during real-device testing.

**Tests** (touch refinement - new in PR 1):
8. `pointer: pointercancel releases active touch and decrements touchCount`
9. `pointer: visibilitychange to hidden releases active touch`
10. `pointer: held-stationary touch is NOT released after a long pause` (regression for the rejected timeout approach)

### 4.5 Audio

**Files**: `public/sfx/eat.mp3`, `public/sfx/die.mp3`, `public/sfx/boost.mp3`. All CC0 from Freesound.org. Add attribution in `NOTICE` (or create one if missing).

**Sound manager** (`src/audio/sound.ts` - new file):
```ts
export class SoundManager {
  private scene: Phaser.Scene;
  private muted: boolean;
  private lastEatMs = 0;
  private eatRateLimitMs = 80;
  private boostLoop: Phaser.Sound.BaseSound | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.muted = localStorage.getItem("snek.mute") === "1";
    scene.load.audio("eat", "sfx/eat.mp3");
    scene.load.audio("die", "sfx/die.mp3");
    scene.load.audio("boost", "sfx/boost.mp3");
  }

  playEat() {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastEatMs < this.eatRateLimitMs) return;
    this.lastEatMs = now;
    this.scene.sound.play("eat", { volume: 0.4 });
  }

  playDie() {
    if (this.muted) return;
    this.scene.sound.play("die", { volume: 0.6 });
  }

  setBoosting(active: boolean) {
    if (this.muted) {
      this.boostLoop?.stop();
      this.boostLoop = null;
      return;
    }
    if (active && !this.boostLoop) {
      this.boostLoop = this.scene.sound.add("boost", { loop: true, volume: 0.3 });
      this.boostLoop.play();
    } else if (!active && this.boostLoop) {
      this.boostLoop.stop();
      this.boostLoop = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("snek.mute", this.muted ? "1" : "0");
    if (this.muted) this.boostLoop?.stop();
    return this.muted;
  }

  isMuted(): boolean { return this.muted; }
}
```

**Phaser config** (`src/main.ts`): no change needed; Phaser sound is built-in. iOS unlock happens automatically on first pointerdown after `game.sound.unlock()` is called - Phaser does this implicitly with `disableWebAudio: false` (default).

**Wiring in GameScene**:
- Add a `preload()` method (GameScene currently has none). In `preload()`:
  ```ts
  preload(): void {
    this.load.audio("eat", "sfx/eat.mp3");
    this.load.audio("die", "sfx/die.mp3");
    this.load.audio("boost", "sfx/boost.mp3");
  }
  ```
- Construct `this.soundManager = new SoundManager(this);` in `startGame()` BEFORE anything that reads it (HUD will need it in PR 2). The SoundManager constructor does NOT load audio - that's done in `preload()` - it just wires the cached audio keys for playback.
- `foodSpawner.checkEat` already returns the number of pellets eaten. Wire `sound.playEat()` ONLY for the player snake: `if (snake.id === "player" && foodSpawner.checkEat(snake) > 0) sound.playEat();`. Bot eats must not trigger the player's eat sound.
- `onSnakeDiedHandler` for player calls `sound.playDie()` and `sound.setBoosting(false)` (in case the player died while boosting).
- Per-frame after setting `player.boostActive`, call `sound.setBoosting(player.boostActive)`.

**Tests** (audio - new in PR 1, sound.test.ts):
11. `eat sound is rate-limited (calls within 80ms suppressed)`
12. `mute persists to localStorage on toggle`
13. `toggleMute returns new state`

(Sound playback itself is hard to unit-test without DOM/Phaser - we test the rate-limit and mute logic only. Audio loading needs a stub for the Phaser scene.)

**PR 1 test count**: 13 new. Total: 61 baseline + 13 = **74**.

### PR 1 commit message

```
[Phase 4] Boost + touch refinement + audio

4.1 Boost: hold second touch (or Space) for 1.7x speed; drains
1.2 segments/sec; shed segments become pellets via FoodSpawner.
Glow outline while boosting. Min length 8 to engage.

4.4 Touch: handle pointercancel (iOS focus-loss recovery). Stale-
active-touch timeout (5s no move = release) defends against the
"address bar steals focus" edge case.

4.5 Audio: SoundManager wraps Phaser sound. Eat (rate-limited),
die, boost (loop) sfx. Mute persists to localStorage. CC0 sources
in NOTICE.

N new tests. Total: 6X.

Closes part of #56 (the Phase 4 meta issue we'll file).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## PR 2 - UI Overlays (WS B)

**Worktree**: `/home/scott/snek-ws2`
**Branch**: `feature/phase-4-hud-deathscreen`

### 4.2 HUD

**New file** `src/ui/hud.ts`. Phaser Graphics + Text, `setScrollFactor(0)`, `setDepth(2100)`. Mirrors Minimap pattern.

Layout (in 1280x720 logical viewport):
- **Top-left**: Your length (large) + score (smaller) below it. Score = length - initialLength (i.e. eaten pellets).
- **Top-right**: Top-5 leaderboard. Each row: color swatch, rank, length. Sorted descending. Player highlighted (yellow outline).
- **Always-show-player rule**: If the player is NOT in the top 5, render a 6th row after a `...` separator showing the player's actual rank (computed from full sort) and length. Tunable: `tuning.hud.alwaysShowPlayerRow: true`.
- **Bottom-left** (above joystick area, but offset to NOT overlap the joystick anchor zone): Mute toggle. Tap area 44x44 (iOS safe target). Position at `(safeInsetPx, viewportHeight - safeInsetPx - 44)` and add a hit-test method `hitsMuteButton(screenX, screenY): boolean`.

**Joystick conflict resolution**: extend PointerSteering's `shouldIgnore` callback to OR-combine minimap and mute button hit tests, so tapping mute doesn't also anchor the joystick:
```ts
this.steering = new PointerSteering(this, (sx, sy) =>
  this.minimap.hitsMinimap(sx, sy) || this.hud.hitsMuteButton(sx, sy), ...);
```

iOS safe areas: respect 24px inset from each edge (`tuning.hud.safeInsetPx`).

```ts
export class HUD {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private lengthText: Phaser.GameObjects.Text;
  private scoreText: Phaser.GameObjects.Text;
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];
  private muteButton: Phaser.GameObjects.Container;
  private sound: SoundManager;

  constructor(scene: Phaser.Scene, sound: SoundManager) { ... }

  render(player: Snake, world: World): void {
    // length + score from player.segments.length
    // top-5 from sorting world.snakes
  }

  destroy() { ... }
}
```

**Tuning** (`tuning.hud.*`):
```ts
hud: {
  safeInsetPx: 24,
  leaderboardCount: 5,
  textColor: 0xffffff,
  playerHighlightColor: 0xffeb3b,
  muteButtonSizePx: 44,
};
```

**Wiring**:
- **Construction order**: `soundManager` before `hud` in `startGame()` - HUD constructor takes a SoundManager reference for the mute button.
- Create HUD in `startGame()` after Minimap.
- Call `hud.render(player, world)` in update loop.
- Destroy in `restart()`.
- The mute button's `onClick` calls `soundManager.toggleMute()` and refreshes the button visual (filled vs hollow icon).

### 4.3 Death screen

**New file** `src/ui/deathScreen.ts`. DOM overlay (Phaser DOMContainer or plain DOM appended to game container).

```html
<div class="snek-death-screen">
  <h1>You died</h1>
  <p class="snek-death-stats">
    Length <span class="snek-death-length">42</span><br>
    Score <span class="snek-death-score">22</span>
  </p>
  <p class="snek-death-killer">Killed by Bot-3</p>
  <button class="snek-death-respawn">Tap to play again</button>
  <p class="snek-death-auto">Auto-respawn in <span class="snek-death-timer">10</span>s</p>
</div>
```

Killer name: if `killedBy === "player"`, "Killed by you" (only happens if player dies from OOB on own snake which doesn't happen since OOB is separate, or self-collision - so probably "Killed by the wall" or "Killed by yourself"). If killedBy starts with "bot-", show "Killed by Bot-N". If null (wall/self), show "Killed by the wall" or "Killed by yourself" based on context (we don't currently track this distinction - good follow-up issue but for Phase 4, just say "Killed by the wall" when killedBy is null).

Auto-respawn after 10s (use `setTimeout`). Tap-to-respawn earlier if user taps button.

**Replace the existing `restartPrompt` in GameScene with DeathScreen.show(stats)** when player dies. Keep the existing keyboard-Space handler.

**Lifecycle**:
- `DeathScreen` is constructed once in `startGame()` (initially hidden DOM).
- `handleDeath()` calls `deathScreen.show(stats)`.
- `restart()` calls `deathScreen.hide()` BEFORE `startGame()` so the overlay is removed before the next game starts. Without this, a player who dies twice fast (auto-respawn into another death) would stack overlays.
- `destroy()` (called from GameScene.restart) removes the DOM and cancels any pending auto-respawn timer.

Test: `restart() removes existing death screen DOM`.

CSS (`src/ui/deathScreen.css` - new file, imported from main.ts or index.html):
```css
.snek-death-screen {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.85);
  color: #fff;
  border: 2px solid #c62828;
  border-radius: 8px;
  padding: 24px 32px;
  font-family: system-ui, sans-serif;
  text-align: center;
  z-index: 100;
}
.snek-death-screen h1 { font-size: 32px; margin: 0 0 16px; }
.snek-death-stats { font-size: 20px; margin: 0 0 16px; }
.snek-death-killer { font-size: 16px; color: #ddd; }
.snek-death-respawn {
  background: #4caf50; color: #fff; border: 0; border-radius: 4px;
  padding: 16px 32px; font-size: 18px; cursor: pointer; margin-top: 8px;
}
```

**Tests** (PR 2 - HUD + death screen):
1. `HUD: renders length and score from player snake`
2. `HUD: top-5 sorted by length descending`
3. `HUD: player row always rendered even when not in top 5`
4. `HUD: mute button hit-test returns true inside box, false outside`
5. `deathScreen: show creates DOM and sets stats correctly`
6. `deathScreen: tap respawn fires callback`
7. `deathScreen: auto-respawn fires callback after timeout (vi.useFakeTimers)`
8. `deathScreen: restart removes existing DOM (no stacked overlays)`

**PR 2 test count**: 8 new. After PR 1 (74) + PR 2 = **82**.

### PR 2 commit message

```
[Phase 4] HUD + death screen

4.2 HUD: Phaser overlay with length, score, top-5 leaderboard,
mute toggle button. setScrollFactor(0). Respects 24px safe inset
on all edges so it doesn't overlap joystick area or minimap.

4.3 Death screen: DOM overlay replaces the previous "tap to play
again" text prompt. Shows final length, score, and killer.
Tap-to-respawn button + 10s auto-respawn for kiosk mode.

N new tests. Total: 6X.

Closes part of #56.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## PR 3 - Phase doc + v0.1.0-mvp tag (WS C)

After PR 1 + 2 merge and deploy.

- New file `docs/plans/phase-4-polish.md` - canonical phase plan committed to repo. Copy from this plan with status updates.
- Update `docs/ROADMAP.md` - mark Phase 4 done, link to PRs.
- Update `CLAUDE.md` status table.
- Update README with "Play it" link + a screenshot or GIF.
- Tag `v0.1.0-mvp` on main after merge.

```bash
git tag v0.1.0-mvp -m "MVP: solo + bots + polish complete (Phase 0-4)"
git push origin v0.1.0-mvp
```

### PR 3 commit message

```
docs: Phase 4 plan, ROADMAP update, README v0.1.0-mvp

Phase 4 shipped. Solo + bots MVP complete. Next: Phase 5 (MP).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Order of operations

1. File GitHub meta-issue #56 for Phase 4 with bullet list of sub-tasks. Each PR closes part of #56.
2. Create both worktrees from main.
3. Dispatch WS A + WS B agents in parallel (general-purpose, Sonnet).
4. Haiku verifiers check each branch's diff.
5. Run /bugcheck against the integration of both branches merged into `integrate/phase-4`.
6. Open PRs 1 and 2 sequentially (PR 1 first, then PR 2 against main once PR 1 merges, to avoid merge conflicts in GameScene.ts).
7. CI + mobile-emulation visual check per PR.
8. After both merge, deploy. File PR 3 for the doc + tag.

## Mobile-emulation visual check (mandatory before each PR merge)

Each PR needs a Chrome mobile emulation pass via mcp__claude-in-chrome:
- PR 1: hold second touch, confirm boost speed + shedding pellets + glow.
- PR 2: HUD readable in landscape, doesn't overlap joystick, death screen appears on player death.

If the user is offline I'll defer mobile QA to post-merge with a "verify in production" note.

## Risks

| Risk | Mitigation |
|---|---|
| iOS audio context never unlocks | Phaser handles this; if it fails, fall back to silent mode + log. Mute persists so user can opt out. |
| Boost-while-too-short softlock | Forced `boostActive = false` when length drops to min. Test for this. |
| HUD overlaps joystick on small screens | 24px safe inset + 1280x720 logical viewport ensures spacing. Test in 375x667 emulation (iPhone SE). |
| Death screen auto-respawn surprises user | 10s is the documented kiosk default; tap-to-respawn always works first. Could make tunable in tuning.deathScreen if feedback dislikes. |
| Pointer focus-loss timeout (5s) feels long | 5s is conservative. Real-world focus loss (address bar/share sheet) usually <2s. The user just has to lift+retouch if it expires. Tunable. |
| Bots accidentally boost via API change | Bot path never sets boostActive=true. Add a test: bot snakes never boost across a sim run. |

## Verification (after each PR deploys)

PR 1:
1. Hold second touch -> snake speeds up, shed pellets appear.
2. Eat a shed pellet -> grows slightly (1.5x multiplier).
3. Hold to length 8 -> boost auto-stops.
4. Audio: eat sound plays (rate-limited if you mash food). Die sound plays. Boost loop plays/stops cleanly.
5. Mute button toggles, persists across reload.
6. iOS: touch the address bar mid-drag -> when you come back, controls work again.

PR 2:
1. HUD shows length, score, top-5 in landscape on mobile emulation.
2. Player row highlighted yellow when in top 5.
3. Mute button is tappable at 44x44.
4. On death, screen shows "Killed by Bot-N" (or "the wall") with final stats.
5. Tap-to-respawn works. Auto-respawn fires at 10s.

## Changes from adversarial review

Adversarial pass returned 2 blocking, 9 should-fix, 3 nice-to-have. All blocking + should-fix applied; 2 nice-to-have applied; 1 deferred as redundant.

**Blocking (applied):**
- **B1** Pointer focus-loss timeout uses wrong signal. The original "no-pointermove for 5s = release" approach would falsely release a held-stationary thumb (a valid steering input). Replaced with `pointercancel` handler + `visibilitychange` listener. Added a regression test that a held thumb is NEVER released by a timeout.
- **B2** PR 1/2 parallel-vs-sequential contradiction. Now explicit: parallel implementation in separate worktrees, sequential merge (PR 1 first, PR 2 rebases). Dropped the "no-op cleanly without PR 1" hand-wave; PR 2 imports SoundManager directly.

**Should-fix (applied):**
- **SF1** Space key via explicit `addKey("SPACE")`, not CursorKeys shape.
- **SF2** Eat sound only fires for the player snake (not for bot eats).
- **SF3** `touchCount` increment/decrement placed BEFORE the early-return guards in pointerdown/pointerup.
- **SF4** `DeathScreen.hide()` is called from `restart()` before `startGame()`. Test verifies no stacked overlays.
- **SF5** Mute button hit-test extends PointerSteering's `shouldIgnore` predicate alongside the minimap.
- **SF6** Player row always rendered in HUD even when not in top 5 (`tuning.hud.alwaysShowPlayerRow: true`).
- **SF7** Audio loading moved to a new `preload()` method on GameScene. SoundManager constructor is now lean (no `load.audio` calls).
- **SF8** `minEntriesNeeded` math in `snake.ts:152-158` also uses `speedMul` factor. Without this, the headPath ring-buffer underflows during boost and the body chain "snaps".
- **SF9** Dropped the separate `boostPelletGrowthMultiplier` tuning. Boost-shed pellets reuse the existing `tuning.death.pelletGrowthMultiplier`. Keeps `FoodItem` schema lean.

**Nice-to-have (applied):**
- **NH1** Concrete test counts: PR 1 = 13 new (total 74), PR 2 = 8 new (total 82).
- **NH2** Construction order: `soundManager` before `hud` (HUD's mute button needs a SoundManager reference).

**Nice-to-have (deferred):**
- **NH3** Avoid changing `FoodItem` schema for boost-shed - already handled by SF8 (reuse death pellet path).
