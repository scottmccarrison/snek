import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  // Served from mccarrison.me/snek/ behind Cloudflare Workers.
  // Built asset URLs need the /snek prefix so the page loads correctly under
  // the subpath route. Dev server (:5173) serves at the root by default;
  // `base` is a build-time transform.
  base: "/snek/",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: false,
    // Dev proxy: client computes API paths relative to BASE_URL.
    // Worker running under `wrangler dev --local` serves at :8787 without the
    // /snek prefix, so rewrite the path before proxying. WebSocket upgrades
    // are proxied identically with ws: true. Wired now even though no API
    // routes exist yet (Phase 0 is static-only); Phase 5 will populate them.
    proxy: {
      "/snek/api": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/snek/, ""),
      },
    },
  },
});
