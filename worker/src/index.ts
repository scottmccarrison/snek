/**
 * snek-api fetch handler.
 *
 * Phase 0.4: static-only. Worker serves `dist/` via the ASSETS binding at
 * `mccarrison.me/snek/*`. A bare-prefix redirect `/snek` -> `/snek/` keeps
 * relative asset URLs inside index.html resolving cleanly.
 *
 * Phase 5 adds room creation + WebSocket upgrade routes.
 */

import { generateCode, isValidCode } from "./codegen";
import type { Env } from "./room";

export { Room } from "./room";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const prefix = env.PATH_PREFIX ?? "/snek";

    // Bare-prefix redirect so the SPA's relative asset URLs resolve under
    // the subpath route.
    if (url.pathname === prefix) {
      return Response.redirect(`${url.origin}${prefix}/`, 301);
    }

    // Room creation: POST /snek/api/room
    // Generates a fresh 4-letter code and returns it. The Durable Object
    // for that code spins up lazily on first WebSocket join.
    if (url.pathname === `${prefix}/api/room` && request.method === "POST") {
      const code = generateCode();
      return new Response(JSON.stringify({ code }), {
        headers: { "content-type": "application/json" },
      });
    }

    // WebSocket upgrade: GET /snek/api/room/{CODE}
    if (
      url.pathname.startsWith(`${prefix}/api/room/`) &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      const code = url.pathname.split("/").pop()?.toUpperCase() ?? "";
      if (!isValidCode(code)) return new Response("bad code", { status: 400 });
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
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
