// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We're testing the data layer (entry queue + expiration) without Phaser
// scene. Mock the Phaser surface used by Killfeed.

// Minimum mocks: scene.add.text() returns a stub Text with chainable
// methods; scene.scale.gameSize + .on() are stubbed.

class StubText {
  visible = false;
  text = "";
  x = 0;
  y = 0;
  alpha = 1;
  style: { fontStyle?: string } = {};
  width = 100;
  setScrollFactor() {
    return this;
  }
  setDepth() {
    return this;
  }
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setStyle(s: { fontStyle?: string }) {
    this.style = s;
    return this;
  }
  setText(s: string) {
    this.text = s;
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  destroy() {}
}

function makeScene() {
  const texts: StubText[] = [];
  return {
    texts,
    add: {
      text: () => {
        const t = new StubText();
        texts.push(t);
        return t;
      },
    },
    scale: {
      gameSize: { width: 1280, height: 720 },
      on: vi.fn(),
      off: vi.fn(),
    },
  };
}

// Avoid importing Phaser - mock it before importing Killfeed.
vi.mock("phaser", () => ({}));

import { Killfeed } from "./killfeed";

describe("Killfeed", () => {
  let nowMs = 1_000_000;
  let scene: ReturnType<typeof makeScene>;

  beforeEach(() => {
    nowMs = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    scene = makeScene();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preallocates maxRows text objects", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    new Killfeed(scene as any);
    expect(scene.texts.length).toBe(5); // tuning.killfeed.maxRows
  });

  it("add() enqueues a row and render() makes it visible", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add("ABC", "XYZ", false);
    kf.render();
    expect(scene.texts[0].visible).toBe(true);
    expect(scene.texts[0].text).toBe("ABC -> XYZ");
  });

  it("null killerLabel renders as 'VICTIM crashed'", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add(null, "ABC", false);
    kf.render();
    expect(scene.texts[0].text).toBe("ABC crashed");
  });

  it("victimIsBot sets italic style on the text", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add("ABC", "bot1", true);
    kf.render();
    expect(scene.texts[0].style.fontStyle).toBe("italic");
    // Non-bot victim is normal.
    nowMs += 100;
    kf.add("ABC", "DEF", false);
    kf.render();
    // Second entry occupies row index 1.
    expect(scene.texts[1].style.fontStyle).toBe("normal");
  });

  it("expires entries past TTL", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add("ABC", "XYZ", false);
    nowMs += 6000; // > 5s TTL
    kf.render();
    expect(scene.texts[0].visible).toBe(false);
  });

  it("evicts oldest when over maxRows", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    for (let i = 0; i < 7; i++) {
      kf.add("KILR", `V${i}`, false);
      nowMs += 100;
    }
    kf.render();
    // Only last 5 should be visible; first 2 evicted.
    const visibleTexts = scene.texts.filter((t) => t.visible).map((t) => t.text);
    expect(visibleTexts.length).toBe(5);
    expect(visibleTexts[0]).toBe("KILR -> V2");
    expect(visibleTexts[4]).toBe("KILR -> V6");
  });

  it("fades alpha during last 1s", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add("ABC", "XYZ", false);
    nowMs += 4500; // 500ms left of TTL
    kf.render();
    expect(scene.texts[0].alpha).toBeGreaterThan(0.4);
    expect(scene.texts[0].alpha).toBeLessThan(0.6);
  });

  it("destroy() cleans up", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    const kf = new Killfeed(scene as any);
    kf.add("ABC", "XYZ", false);
    kf.destroy();
    expect(scene.scale.off).toHaveBeenCalled();
  });
});
