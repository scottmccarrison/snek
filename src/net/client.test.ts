// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { makeNetClient } from "./client";

describe("makeNetClient", () => {
  it("computes wsBase from window.location", () => {
    const c = makeNetClient();
    expect(c.wsBase.startsWith("ws://") || c.wsBase.startsWith("wss://")).toBe(true);
    expect(c.httpBase.startsWith("http://") || c.httpBase.startsWith("https://")).toBe(true);
  });
});
