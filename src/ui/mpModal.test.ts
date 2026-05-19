// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MpModal } from "./mpModal";

function makeMockRoom() {
  const handlers = new Map<string, Set<(msg: unknown) => void>>();
  const sent: unknown[] = [];
  const room = {
    sessionId: "s1",
    resumeToken: "r1",
    snakeId: "p_s1",
    worldDims: { w: 4000, h: 4000 },
    tickHz: 20,
    send: vi.fn((msg: unknown) => sent.push(msg)),
    onMessage: vi.fn((type: string, cb: (msg: unknown) => void) => {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(cb);
      return () => set?.delete(cb);
    }),
    onClose: vi.fn(() => () => {}),
    leave: vi.fn(),
  };
  function dispatch(type: string, msg: unknown) {
    const set = handlers.get(type);
    if (set) for (const cb of set) cb(msg);
  }
  return { room, sent, dispatch };
}

describe("MpModal lobby", () => {
  afterEach(() => {
    for (const el of document.querySelectorAll(".snek-mp-modal")) el.remove();
  });

  it("renders roster from state messages in lobby phase", () => {
    const { room, dispatch } = makeMockRoom();
    const modal = new MpModal({
      onGameStart: vi.fn(),
      onCancel: vi.fn(),
      onGameEnded: vi.fn(),
    });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    dispatch("state", {
      type: "state",
      serverTime: 0,
      phase: "lobby",
      players: [
        {
          sessionId: "s1",
          snakeId: "p_s1",
          nickname: "ABC",
          colorIdx: 0,
          ready: false,
          isHost: true,
        },
        {
          sessionId: "s2",
          snakeId: "p_s2",
          nickname: "XYZ",
          colorIdx: 1,
          ready: true,
          isHost: false,
        },
      ],
      snakes: [],
      foods: [],
    });
    const items = document.querySelectorAll(".snek-mp-roster li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("ABC");
    expect(items[0].textContent).toContain("HOST");
    expect(items[1].textContent).toContain("XYZ");
    expect(items[1].textContent).toContain("READY");
    modal.destroy();
  });

  it("READY button sends set_ready ClientMsg and toggles", () => {
    const { room, sent } = makeMockRoom();
    const modal = new MpModal({ onGameStart: vi.fn(), onCancel: vi.fn(), onGameEnded: vi.fn() });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    const btn = document.querySelector<HTMLButtonElement>(".snek-mp-ready");
    expect(btn).toBeTruthy();
    btn?.click();
    expect(sent).toContainEqual({ type: "set_ready", ready: true });
    btn?.click();
    expect(sent).toContainEqual({ type: "set_ready", ready: false });
    modal.destroy();
  });

  it("READY button text changes to waiting when active", () => {
    const { room } = makeMockRoom();
    const modal = new MpModal({ onGameStart: vi.fn(), onCancel: vi.fn(), onGameEnded: vi.fn() });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    const btn = document.querySelector<HTMLButtonElement>(".snek-mp-ready");
    expect(btn?.textContent).toBe("READY");
    btn?.click();
    expect(btn?.textContent).toBe("READY (waiting)");
    btn?.click();
    expect(btn?.textContent).toBe("READY");
    modal.destroy();
  });

  it("transition to playing fires onGameStart", () => {
    const { room, dispatch } = makeMockRoom();
    const onGameStart = vi.fn();
    const modal = new MpModal({ onGameStart, onCancel: vi.fn(), onGameEnded: vi.fn() });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    dispatch("state", {
      type: "state",
      serverTime: 0,
      phase: "playing",
      players: [],
      snakes: [],
      foods: [],
    });
    expect(onGameStart).toHaveBeenCalledOnce();
    modal.destroy();
  });

  it("game_ended fires onGameEnded", () => {
    const { room, dispatch } = makeMockRoom();
    const onGameEnded = vi.fn();
    const modal = new MpModal({ onGameStart: vi.fn(), onCancel: vi.fn(), onGameEnded });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    dispatch("game_ended", { type: "game_ended", reason: "host_left" });
    expect(onGameEnded).toHaveBeenCalledOnce();
    modal.destroy();
  });

  it("lobby section is hidden initially, shown after switchToLobby", () => {
    const { room } = makeMockRoom();
    const modal = new MpModal({ onGameStart: vi.fn(), onCancel: vi.fn(), onGameEnded: vi.fn() });
    modal.show("ABC");
    const lobby = document.querySelector<HTMLDivElement>(".snek-mp-lobby");
    expect(lobby).toBeTruthy();
    expect(lobby?.style.display).toBe("none");
    modal.switchToLobby(room as never, "ABCD");
    expect(lobby?.style.display).not.toBe("none");
    const codeSpan = document.querySelector(".snek-mp-lobby-code");
    expect(codeSpan?.textContent).toBe("ABCD");
    modal.destroy();
  });

  it("non-ready player shows 'not ready' in roster", () => {
    const { room, dispatch } = makeMockRoom();
    const modal = new MpModal({ onGameStart: vi.fn(), onCancel: vi.fn(), onGameEnded: vi.fn() });
    modal.show("ABC");
    modal.switchToLobby(room as never, "ABCD");
    dispatch("state", {
      type: "state",
      serverTime: 0,
      phase: "lobby",
      players: [
        {
          sessionId: "s1",
          snakeId: "p_s1",
          nickname: "ABC",
          colorIdx: 0,
          ready: false,
          isHost: true,
        },
      ],
      snakes: [],
      foods: [],
    });
    const items = document.querySelectorAll(".snek-mp-roster li");
    expect(items[0].textContent).toContain("not ready");
    modal.destroy();
  });
});
