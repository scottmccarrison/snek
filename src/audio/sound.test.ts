import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoundManager } from "./sound";

// AudioContext is not available in the node test environment, so we stub it
// via globalThis (which is how the SoundManager looks it up).
// Each test gets a fresh stub.

function makeAudioContextStub() {
  let oscCallCount = 0;
  const oscStub = {
    type: "sine" as OscillatorType,
    frequency: { value: 0 },
    connect: () => oscStub,
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gainStub = {
    gain: {
      value: 0.1,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    connect: () => gainStub,
  };
  const ctxInstance = {
    state: "running" as AudioContextState,
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: () => {
      oscCallCount++;
      return oscStub;
    },
    createGain: () => gainStub,
    get oscCallCount() {
      return oscCallCount;
    },
  };

  // Must be constructable via `new FakeAudioContext()`.
  function FakeAudioContext(this: unknown) {
    return ctxInstance;
  }

  return { FakeAudioContext, ctxInstance };
}

function makeLocalStorageStub() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    store,
  };
}

describe("SoundManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("eat sound is rate-limited: second call within 80ms is suppressed", () => {
    const ls = makeLocalStorageStub();
    vi.stubGlobal("localStorage", ls);

    let nowMs = 0;
    vi.stubGlobal("performance", { now: () => nowMs });

    const { FakeAudioContext, ctxInstance } = makeAudioContextStub();
    // Stub on globalThis so SoundManager.ensureCtx() finds it.
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const sound = new SoundManager();
    sound.unlock();

    // First call at t=0: should play.
    nowMs = 0;
    sound.playEat();
    const afterFirst = ctxInstance.oscCallCount;
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    // Second call at t=50ms (within 80ms rate-limit window): suppressed.
    nowMs = 50;
    sound.playEat();
    expect(ctxInstance.oscCallCount).toBe(afterFirst);

    // Third call at t=100ms (past 80ms): should play again.
    nowMs = 100;
    sound.playEat();
    expect(ctxInstance.oscCallCount).toBe(afterFirst + 1);
  });

  it("mute persists to localStorage on toggle", () => {
    const ls = makeLocalStorageStub();
    vi.stubGlobal("localStorage", ls);
    const { FakeAudioContext } = makeAudioContextStub();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const sound = new SoundManager();
    expect(sound.isMuted()).toBe(false);

    sound.toggleMute();
    expect(ls.store["snek.mute"]).toBe("1");

    sound.toggleMute();
    expect(ls.store["snek.mute"]).toBe("0");
  });

  it("toggleMute returns the new muted state", () => {
    const ls = makeLocalStorageStub();
    vi.stubGlobal("localStorage", ls);
    const { FakeAudioContext } = makeAudioContextStub();
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const sound = new SoundManager();
    const afterFirst = sound.toggleMute();
    expect(afterFirst).toBe(true);
    const afterSecond = sound.toggleMute();
    expect(afterSecond).toBe(false);
  });
});
