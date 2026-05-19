// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isClientMsg } from "./protocol";
import type { ClientMsg, ServerMsg } from "./protocol";

describe("protocol", () => {
  it("isClientMsg returns true for a valid ClientMsg", () => {
    const msg: ClientMsg = { type: "set_nickname", nickname: "Alice" };
    expect(isClientMsg(msg)).toBe(true);

    const msg2: ClientMsg = { type: "input_dir", angle: 1.57 };
    expect(isClientMsg(msg2)).toBe(true);

    const msg3: ClientMsg = { type: "respawn" };
    expect(isClientMsg(msg3)).toBe(true);
  });

  it("isClientMsg returns false for null / non-object / missing type", () => {
    expect(isClientMsg(null)).toBe(false);
    expect(isClientMsg(undefined)).toBe(false);
    expect(isClientMsg("string")).toBe(false);
    expect(isClientMsg(42)).toBe(false);
    expect(isClientMsg({})).toBe(false);
    expect(isClientMsg({ foo: "bar" })).toBe(false);
  });

  it("JSON round-trip preserves welcome message", () => {
    const welcome: ServerMsg = {
      type: "welcome",
      sessionId: "sess-1",
      resumeToken: "abc123",
      snakeId: "snake-1",
      worldDims: { w: 4000, h: 4000 },
      tickHz: 20,
    };
    const parsed = JSON.parse(JSON.stringify(welcome)) as ServerMsg;
    expect(parsed.type).toBe("welcome");
    if (parsed.type === "welcome") {
      expect(parsed.sessionId).toBe("sess-1");
      expect(parsed.resumeToken).toBe("abc123");
      expect(parsed.snakeId).toBe("snake-1");
      expect(parsed.worldDims.w).toBe(4000);
      expect(parsed.tickHz).toBe(20);
    }
  });

  it("discriminated union narrows on type", () => {
    // This test compiles correctly if and only if the discriminated union narrows.
    const msgs: ServerMsg[] = [
      { type: "snake_died", snakeId: "s1", killedBy: "s2" },
      { type: "food_eaten", ids: ["f1", "f2"] },
      { type: "snake_respawned", snakeId: "s1" },
      { type: "error", code: "rate_limit", message: "Too many messages" },
    ];
    for (const msg of msgs) {
      if (msg.type === "snake_died") {
        expect(typeof msg.snakeId).toBe("string");
      } else if (msg.type === "food_eaten") {
        expect(Array.isArray(msg.ids)).toBe(true);
      } else if (msg.type === "snake_respawned") {
        expect(typeof msg.snakeId).toBe("string");
      } else if (msg.type === "error") {
        expect(typeof msg.code).toBe("string");
        expect(typeof msg.message).toBe("string");
      }
    }
    expect(msgs.length).toBe(4);
  });
});
