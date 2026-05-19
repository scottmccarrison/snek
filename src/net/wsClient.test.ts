// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { joinRoom } from "./wsClient";

class MockWS {
  static instances: MockWS[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
    });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe("joinRoom", () => {
  it("resolves on welcome", async () => {
    MockWS.instances = [];
    vi.stubGlobal("WebSocket", MockWS);
    const p = joinRoom("ws://x", "ABCD", "scott", 0);
    // Allow the ws to be created
    await Promise.resolve();
    const ws = MockWS.instances[MockWS.instances.length - 1];
    ws.onmessage?.({
      data: JSON.stringify({
        type: "welcome",
        sessionId: "s1",
        resumeToken: "abc",
        snakeId: "p_s1",
        worldDims: { w: 4000, h: 4000 },
        tickHz: 20,
      }),
    });
    const handle = await p;
    expect(handle.sessionId).toBe("s1");
    expect(handle.snakeId).toBe("p_s1");
    vi.unstubAllGlobals();
  });

  it("send dispatches typed JSON", async () => {
    MockWS.instances = [];
    vi.stubGlobal("WebSocket", MockWS);
    const p = joinRoom("ws://x", "ABCD", "scott", 0);
    await Promise.resolve();
    const ws = MockWS.instances[MockWS.instances.length - 1];
    ws.onmessage?.({
      data: JSON.stringify({
        type: "welcome",
        sessionId: "s2",
        resumeToken: "t",
        snakeId: "p_s2",
        worldDims: { w: 0, h: 0 },
        tickHz: 20,
      }),
    });
    const handle = await p;
    // readyState must be OPEN (1) for send to go through
    ws.readyState = 1;
    handle.send({ type: "input_boost", active: true });
    expect(ws.sent[0]).toBe(JSON.stringify({ type: "input_boost", active: true }));
    vi.unstubAllGlobals();
  });
});
