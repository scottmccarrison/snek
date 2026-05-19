import { tuning } from "../../src/tuning";

// Strip C0/C1 control chars, zero-width chars, bidi overrides, and ZWNBSP.
// Without this a client could send RTL-override characters to spoof display
// order, or newlines to break the room-view layout.
// Then trim leading/trailing whitespace.
export function normalizeNickname(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional; stripping control chars from user input
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .trim();
  if (s.length > tuning.net.nicknameMaxLen) s = s.slice(0, tuning.net.nicknameMaxLen);
  return s;
}

export function isValidNickname(nick: string): boolean {
  return nick.length >= 1 && nick.length <= tuning.net.nicknameMaxLen;
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
