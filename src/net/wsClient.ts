/**
 * RoomHandle: connect, send, dispatch typed messages, onClose.
 * Phase 5 client WebSocket transport for snek multiplayer.
 * Adapted from ~/worms/src/net/wsClient.ts.
 */

import type { ClientMsg, ServerMsg } from "../../shared/protocol";

export interface RoomState {
  sessionId: string;
  resumeToken: string;
  snakeId: string;
  worldDims: { w: number; h: number };
  tickHz: number;
}

export interface RoomHandle {
  sessionId: string;
  resumeToken: string;
  snakeId: string;
  worldDims: { w: number; h: number };
  send(msg: ClientMsg): void;
  onMessage<T extends ServerMsg["type"]>(
    type: T,
    cb: (msg: Extract<ServerMsg, { type: T }>) => void,
  ): () => void;
  onClose(cb: () => void): () => void;
  leave(): void;
}

const WELCOME_TIMEOUT_MS = 8000;

export async function joinRoom(
  wsBase: string,
  code: string,
  nickname: string,
  colorIdx: number,
  resumeToken?: string,
): Promise<RoomHandle> {
  const url = new URL(`${wsBase}/api/room/${code}`);
  url.searchParams.set("nickname", nickname);
  url.searchParams.set("color", String(colorIdx));
  if (resumeToken) url.searchParams.set("resumeToken", resumeToken);

  return new Promise<RoomHandle>((resolve, reject) => {
    const ws = new WebSocket(url.toString());
    const messageHandlers = new Map<string, Set<(msg: ServerMsg) => void>>();
    const closeHandlers = new Set<() => void>();
    let welcomeTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      ws.close();
      reject(new Error("no welcome from server within 8s"));
    }, WELCOME_TIMEOUT_MS);

    ws.onmessage = (e) => {
      let parsed: ServerMsg;
      try {
        parsed = JSON.parse(e.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (parsed.type === "welcome" && welcomeTimer !== null) {
        clearTimeout(welcomeTimer);
        welcomeTimer = null;
        const handle: RoomHandle = {
          sessionId: parsed.sessionId,
          resumeToken: parsed.resumeToken,
          snakeId: parsed.snakeId,
          worldDims: parsed.worldDims,
          send(msg) {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify(msg));
          },
          onMessage(type, cb) {
            let set = messageHandlers.get(type);
            if (!set) {
              set = new Set();
              messageHandlers.set(type, set);
            }
            set.add(cb as (m: ServerMsg) => void);
            return () => set?.delete(cb as (m: ServerMsg) => void);
          },
          onClose(cb) {
            closeHandlers.add(cb);
            return () => closeHandlers.delete(cb);
          },
          leave() {
            try {
              ws.send(JSON.stringify({ type: "leave" } satisfies ClientMsg));
            } catch {
              // already closing
            }
            ws.close();
          },
        };
        resolve(handle);
        return;
      }
      // Dispatch typed messages to subscribers.
      const subs = messageHandlers.get(parsed.type);
      if (subs) {
        for (const cb of subs) {
          try {
            cb(parsed);
          } catch {
            // don't let one handler break others
          }
        }
      }
    };
    ws.onclose = () => {
      if (welcomeTimer !== null) {
        clearTimeout(welcomeTimer);
        welcomeTimer = null;
        reject(new Error("socket closed before welcome"));
        return;
      }
      for (const cb of closeHandlers) {
        try {
          cb();
        } catch {
          // don't let one handler break others
        }
      }
    };
    ws.onerror = () => {
      if (welcomeTimer !== null) {
        clearTimeout(welcomeTimer);
        welcomeTimer = null;
        reject(new Error("socket error before welcome"));
      }
    };
  });
}
