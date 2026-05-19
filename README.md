# snek

Browser-based snake.io / slither.io clone. Mobile-first (touch primary, keyboard secondary). Phaser 3 + Cloudflare Workers + Durable Objects.

**Play it: https://mccarrison.me/snek/**

Solo + bots MVP complete (Phases 0-4). Multiplayer (Phases 5-7) up next.

Controls (mobile): drag-from-anywhere to steer, hold a second finger to boost.
Controls (desktop): mouse to steer, hold Space to boost.

## Run locally

```bash
nvm use
npm install
npm run dev
```

Then open http://localhost:5173/snek/.

## Scripts

- `npm run dev` - Vite dev server with hot reload at :5173.
- `npm run typecheck` - TypeScript type check (no emit).
- `npm run lint` - Biome lint + format check.
- `npm run format` - Biome format in place.
- `npm run test` - Vitest in watch mode.
- `npm run test:run` - Vitest one-shot.
- `npm run build` - Production build to `dist/`.
- `npm run deploy` - Build, then wrangler deploy from `worker/` (Cloudflare).

## Phases

See `docs/ROADMAP.md` and individual `docs/plans/phase-N-*.md` for current state.

## License

TBD.
