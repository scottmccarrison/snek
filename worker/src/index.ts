/**
 * snek-api fetch handler.
 *
 * Phase 0.4: static-only. Worker serves `dist/` via the ASSETS binding at
 * `mccarrison.me/snek/*`. A bare-prefix redirect `/snek` -> `/snek/` keeps
 * relative asset URLs inside index.html resolving cleanly.
 *
 * Phase 5 adds room creation + WebSocket upgrade routes; for now everything
 * non-redirect falls through to ASSETS.
 */

interface Env {
  PATH_PREFIX?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const prefix = env.PATH_PREFIX ?? "/snek";

    // Bare-prefix redirect so the SPA's relative asset URLs resolve under
    // the subpath route.
    if (url.pathname === prefix) {
      return Response.redirect(`${url.origin}${prefix}/`, 301);
    }

    // Strip the configured prefix so the asset bundle (keyed off
    // unprefixed paths like /assets/index-XYZ.js) receives the
    // stripped request.
    let path = url.pathname;
    if (path.startsWith(`${prefix}/`)) path = path.slice(prefix.length) || "/";

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  },
};
