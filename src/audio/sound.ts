/**
 * SoundManager - Web Audio API synth tones for snek.
 *
 * No external audio files needed - all sounds are generated via the
 * Web Audio API oscillator graph. Benefits: no preload step, no asset
 * pipeline, no licensing, tiny bundle footprint.
 *
 * Mute state persists to localStorage under the key "snek.mute".
 * AudioContext is lazy-initialized on first unlock() call to satisfy
 * iOS Safari's "user gesture required before audio" policy.
 */

export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  // Initialize far in the past so the very first playEat() always fires.
  private lastEatMs = Number.NEGATIVE_INFINITY;
  private boostOsc: OscillatorNode | null = null;
  private boostGain: GainNode | null = null;

  constructor() {
    this.muted = localStorage.getItem("snek.mute") === "1";
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      // Guard against node/SSR environments where window is undefined.
      const g =
        typeof globalThis !== "undefined"
          ? globalThis
          : typeof window !== "undefined"
            ? window
            : null;
      if (!g) return null;
      const Ctx =
        (g as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (g as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Call once on the first user gesture (pointerdown) to resume the
   * AudioContext. Required on iOS Safari where audio starts suspended.
   */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  /** Play a short high-pitched eat blip. Rate-limited to avoid spam. */
  playEat(): void {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastEatMs < 80) return;
    this.lastEatMs = now;
    this.beep(880, 0.06, 0.15);
  }

  /** Play a descending sawtooth buzz on death. */
  playDie(): void {
    if (this.muted) return;
    this.beep(220, 0.4, 0.25, "sawtooth");
  }

  /**
   * Start or stop the continuous boost loop tone.
   * Quick gain fade-out on stop to avoid audio pops.
   */
  setBoosting(active: boolean): void {
    const shouldBoost = this.muted ? false : active;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (shouldBoost && !this.boostOsc) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      this.boostOsc = osc;
      this.boostGain = gain;
    } else if (!shouldBoost && this.boostOsc) {
      // Quick 50ms fade-out to avoid a pop on stop.
      const t = ctx.currentTime;
      this.boostGain?.gain.cancelScheduledValues(t);
      this.boostGain?.gain.setValueAtTime(this.boostGain.gain.value, t);
      this.boostGain?.gain.linearRampToValueAtTime(0, t + 0.05);
      this.boostOsc.stop(t + 0.06);
      this.boostOsc = null;
      this.boostGain = null;
    }
  }

  private beep(
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /**
   * Toggle mute state. Returns the new muted value.
   * Persists to localStorage. Stops the boost loop if muting.
   */
  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("snek.mute", this.muted ? "1" : "0");
    if (this.muted) this.setBoosting(false);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
