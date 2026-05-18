# snek - Claude project context

Project-specific instructions for Claude sessions working in this repo. Overrides global `~/CLAUDE.md` defaults where they conflict.

## Mission

Browser-based snake.io / slither.io clone. Open a link, drag your finger, eat dots, grow longer, ram other snakes' bodies to kill them, watch their corpses turn into bonus food. Mobile-first; desktop secondary. Live at `mccarrison.me/snek/` (post Phase 0).

## Target platforms (first-class)

**Mobile-web (landscape) is the primary target.** Desktop is secondary. The product shape ("text a link, tap to play") is inherently mobile-first.

- **Orientation**: landscape-locked in-game. Portrait shows a "rotate your device" splash.
- **Canvas**: Phaser `Scale.FIT` at 1280x720 logical, scales to any viewport. Verified by letterboxing in narrow browsers.
- **Input**: **touch is the primary control surface**; keyboard/mouse are additive.
  - Steering: drag-from-anywhere = direction vector from snake head to drag point. No virtual stick.
  - Boost: second touch (or hold mouse / hold space). Decision in Phase 4 between "boost button" vs "any second touch" pending real-device test.
- **Performance budget**: 60fps on mid-tier phones (iPhone 12 / Pixel 6 era). 30fps minimum at end of Phase 3 (10 bots) and end of Phase 6 (50 snakes) on emulated devices.
- **Viewport**: `width=device-width, initial-scale=1`; no PR may regress this.

**When writing a plan for any UI- or input-touching phase, the plan MUST include a touch-first section.** Plans that ship "keyboard only" for a gameplay mechanic are incomplete and block merge.

## Status

**Phase 0 - Scaffolding** (in progress). See [docs/ROADMAP.md](docs/ROADMAP.md) for the 7-phase roadmap. Current state:

- [x] 0.1 - Vite + TS + Phaser + Biome scaffold
- [ ] 0.2 - CLAUDE.md + docs scaffolding (this PR)
- [ ] 0.3 - GitHub Actions CI
- [ ] 0.4 - Cloudflare Pages deploy at mccarrison.me/snek

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Renderer | Phaser 3.90 | Same as worms; reuse main.ts boot patterns. |
| Language | TypeScript 5.x, strict | Bundler resolution, `verbatimModuleSyntax`. |
| Build | Vite 6 | `base: "/snek/"`. Dev proxy stub for `/snek/api` -> `:8787`. |
| Lint/format | Biome 1.9 | Single config covers lint + format + import sort. |
| Server | Cloudflare Workers + Durable Objects | Phase 5+; Phase 0.4 ships a static asset Worker. |
| Transport | Native WebSocket, JSON-first | Binary revisited Phase 6 if profiling demands. |
| Physics | None. Hand-rolled circle/circle + circle/segment | planck is overkill; see [ADR-001](docs/decisions/001-stack-choices.md). |
| State machines | None. Plain switch on enum | xstate is overkill for snek's state graph. |
| Spatial structure | Spatial hash grid | From Phase 1. Bucket size in `src/tuning.ts`. |
| Node | 20+, pinned via `.nvmrc` | |
| Deploy | Cloudflare Pages (static) + Workers (server) | `npm run deploy` runs `npm run build` then `wrangler deploy`. |
| CI | GitHub Actions | typecheck, lint, build, test on push to main and PRs. |

**Reference repos** to crib code from (no forks, no clones):

- [owenashurst/agar.io-clone](https://github.com/owenashurst/agar.io-clone) - server-authoritative tick loop, viewport-culled state broadcast, food balance
- [jondubois/iogrid](https://github.com/jondubois/iogrid) - spatial hash grid (client AND server)
- [knagaitsev/slither.io-clone](https://github.com/knagaitsev/slither.io-clone) - segment-chain kinematics, mouse-angle math, death-to-pellets burst, boost
- [ClitherProject/Slither.io-Protocol](https://github.com/ClitherProject/Slither.io-Protocol) - reverse-engineered binary wire format (reference only, JSON until Phase 6)

**Crib policy**: copy specific files or functions; rewrite in our TS style; attribute the source in a comment at the top of the destination file; track in `NOTICE`. No forks.

## Conventions

- **GitHub issues are the source of truth** for work tracking. Phase 0-7 milestones. Area labels: `area:client`, `area:server`, `area:netcode`, `area:art`, `area:infra`. Type: `enhancement`, `bug`.
- **Plans live in the repo** at `docs/plans/phase-N-<shortname>.md`. Committed with the first PR of that phase. Working copies at `~/.claude/plans/*.md` are not canonical.
- **No em dashes** in any file or commit message. Use regular hyphens. User preference.
- **Tunables in `src/tuning.ts`**: head speed, body spacing, food spawn rate, bot count, boost cost, view radius, spatial hash bucket size. No magic numbers in game logic.
- **Auto-merge** docs/config/infra PRs immediately. **Hold for review**: game logic, netcode, user-visible behavior.
- **Plans must explicitly invoke relevant skills.** Not optional:
  - UI-touching phases (HUD, lobby, leaderboard, death screen): `/frontend-design` so we don't ship generic-AI-looking UI
  - Pre-Phase-5 ship + anything touching WS auth/security: `/security-review`
  - Risky PRs (netcode, wire format changes): `/review` for a second pass
- **Touch-first for gameplay + UI phases.** See "Target platforms" above.

## Pick-up ritual

When resuming work after `/clear` or a new session:

1. Read this file
2. Skim `docs/decisions/` for ADRs that affect upcoming work
3. Read `docs/ROADMAP.md` for current phase and open issues
4. `gh pr list --repo scottmccarrison/snek --state all --limit 5` for recent activity
5. `git log --oneline -10` for recent commits
6. Check `docs/plans/` for plans on in-progress phases
7. Ask user what to work on, or propose based on ROADMAP

## Key decisions (rationale that isn't obvious from code)

- **No physics engine** (planck dropped): snek needs circle/circle + circle/segment collision and unit-vector movement. planck adds bundle size and complexity for no benefit. See [ADR-001](docs/decisions/001-stack-choices.md).
- **No state machine library** (xstate dropped): snek's state graph (menu, playing, dead, restart) fits in a plain switch on an enum. Adding xstate is over-engineering.
- **Hand-roll WS over Colyseus**: worms validated the Cloudflare Workers + Durable Objects + native WS pattern (see worms `worker/src/room.ts`). Reuse the shape.
- **JSON wire format first, binary if profiling demands**: snek is unlikely to hit Slither's exact wire-volume problem at expected player counts. Defer binary until measured.
- **Solo + bots first, MP later**: bots are reusable as MP room-fillers; the game is "fun" by end of Phase 3 without any backend; netcode complexity is easier to design once the deterministic sim works locally.
- **Public path-prefix** (`mccarrison.me/snek`): same hosting shape as worms. Cloudflare Worker route owns the `/snek` prefix.

## Plan-time resources

Before writing a phase plan, pull current docs via Context7 MCP for any library the phase depends on. Don't rely on training-cutoff knowledge for specific API surfaces.

When Context7 doesn't have a library or the topic is non-library (game netcode theory, asset licensing, hosting), use WebFetch against the authoritative URL. See "References by phase" below.

## References by phase

### Phase 0 - Scaffolding
- Worms repo at `~/worms` (verbatim source for vite/tsconfig/biome/CI/wrangler shapes)
- Cloudflare Workers + Pages docs (Context7: `cloudflare workers static assets`)

### Phase 1 - Solo snake
- Phaser docs (Context7: `phaser scene`, `phaser graphics`, `phaser input`)
- knagaitsev/slither.io-clone segment-chain code (`src/client/Snake.js`)

### Phase 2 - World + camera + minimap
- Phaser camera docs (Context7: `phaser camera startFollow`)
- jondubois/iogrid spatial hash impl

### Phase 3 - Bot snakes
- General FSM patterns; no specific external doc needed
- knagaitsev/slither.io-clone death-to-pellets

### Phase 4 - Polish + feel
- `/frontend-design` skill for HUD + leaderboard
- Freesound.org CC0 search for audio
- Phaser sound docs

### Phase 5 - MP foundation
- Cloudflare Workers + Durable Objects (Context7: `cloudflare durable objects`, `cloudflare workers websockets`)
- worms `worker/src/room.ts` as the canonical authoritative-tick-loop shape
- `/security-review` required before merge

### Phase 6 - MP correctness
- [Gaffer On Games - Networked Physics](https://gafferongames.com/categories/networked-physics/) (prediction, interpolation, lag compensation)
- ClitherProject/Slither.io-Protocol (binary wire format reference)
- `/review` required

### Phase 7 - MP feel + polish
- `/frontend-design` for killfeed
- Cloudflare Durable Objects RPC (Context7: `durable objects rpc`) for cross-room leaderboard
- `/security-review` for anti-grief + rate limiting

## Agent workflow

- `/plan` produces a plan file; user approves; commit canonical version to `docs/plans/phase-N-<shortname>.md`
- `/build` (when available) creates worktrees at `../snek-wsN`, dispatches Sonnet agents (general-purpose type, NOT Bash) with exact specs, Haiku agents verify diffs
- `/bugcheck` runs on the merged integration branch before PR
- PR squash-merged, issues auto-close via `Closes #N`
- Worktrees and local branches cleaned up

## Compact instructions

Preserve: file paths, code changes, decisions + rationale, task state, git state (branch/commits/PRs), errors + fixes, current phase + issue numbers.
Discard: exploratory reads that didn't lead to changes, verbose tool output already summarized, intermediate search results.
