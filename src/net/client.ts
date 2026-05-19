/**
 * NetClient factory for snek multiplayer (Phase 5).
 * Verbatim shape adapted from ~/worms/src/net/client.ts.
 * Computes httpBase + wsBase from window.location + Vite BASE_URL.
 */

import { type RoomHandle, joinRoom } from "./wsClient";

export type { RoomHandle } from "./wsClient";

export interface NetClient {
  httpBase: string;
  wsBase: string;
  createRoom(): Promise<{ code: string }>;
  joinRoom(
    code: string,
    nickname: string,
    colorIdx: number,
    resumeToken?: string,
  ): Promise<RoomHandle>;
}

export function makeNetClient(): NetClient {
  const httpBase = (() => {
    if (typeof window === "undefined") return "";
    // Vite's BASE_URL is "/snek/" in prod.
    const base = import.meta.env?.BASE_URL ?? "/";
    return window.location.origin + base.replace(/\/$/, "");
  })();
  const wsBase = httpBase.replace(/^http/, "ws");

  return {
    httpBase,
    wsBase,
    async createRoom() {
      const r = await fetch(`${httpBase}/api/room`, { method: "POST" });
      if (!r.ok) throw new Error(`createRoom failed: ${r.status}`);
      return (await r.json()) as { code: string };
    },
    async joinRoom(code, nickname, colorIdx, resumeToken) {
      return joinRoom(wsBase, code, nickname, colorIdx, resumeToken);
    },
  };
}
