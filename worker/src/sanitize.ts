import { tuning } from "../../src/tuning";

// Nicknames are 3-letter initials (A-Z only, uppercased, length 1..3).
// Strips everything that is not a letter, uppercases, trims to the cap.
// This collapses the attack surface from "arbitrary string" to "letters
// only" - no control chars, bidi overrides, zero-width, or whitespace
// possible regardless of input.
export function normalizeNickname(input: unknown): string {
  if (typeof input !== "string") return "";
  const s = input.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length > tuning.net.nicknameMaxLen) return s.slice(0, tuning.net.nicknameMaxLen);
  return s;
}

export function isValidNickname(nick: string): boolean {
  if (nick.length < 1 || nick.length > tuning.net.nicknameMaxLen) return false;
  for (let i = 0; i < nick.length; i++) {
    const c = nick.charCodeAt(i);
    if (c < 65 || c > 90) return false; // not A-Z
  }
  return true;
}

export function isValidAngle(angle: unknown): angle is number {
  return typeof angle === "number" && Number.isFinite(angle);
}

export function isValidBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export function isValidColorIdx(idx: unknown, paletteLen: number): idx is number {
  return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 && idx < paletteLen;
}
