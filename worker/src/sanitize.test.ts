// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isValidAngle,
  isValidBoolean,
  isValidColorIdx,
  isValidNickname,
  normalizeNickname,
} from "./sanitize";

describe("sanitize", () => {
  it("normalizeNickname strips control chars and trims whitespace", () => {
    // C0 control char (null byte) stripped, surrounding spaces trimmed
    expect(normalizeNickname("  hello\x00world  ")).toBe("helloworld");
    // zero-width space (​) stripped
    expect(normalizeNickname("hi​there")).toBe("hithere");
    // RTL override (‮) stripped
    expect(normalizeNickname("‮Reversed")).toBe("Reversed");
    // non-string returns empty
    expect(normalizeNickname(42)).toBe("");
    expect(normalizeNickname(null)).toBe("");
  });
  it("normalizeNickname clips to nicknameMaxLen", () => {
    // nicknameMaxLen is 16 per tuning.net
    const out = normalizeNickname("abcdefghijklmnopqrstuvwxyz");
    expect(out.length).toBeLessThanOrEqual(16);
  });
  it("isValidAngle rejects NaN, Infinity, non-numbers", () => {
    expect(isValidAngle(0)).toBe(true);
    expect(isValidAngle(Math.PI)).toBe(true);
    expect(isValidAngle(-Math.PI)).toBe(true);
    expect(isValidAngle(Number.NaN)).toBe(false);
    expect(isValidAngle(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidAngle(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isValidAngle("0")).toBe(false);
    expect(isValidAngle(null)).toBe(false);
    expect(isValidAngle(undefined)).toBe(false);
  });
  it("isValidBoolean accepts only true/false", () => {
    expect(isValidBoolean(true)).toBe(true);
    expect(isValidBoolean(false)).toBe(true);
    expect(isValidBoolean(1)).toBe(false);
    expect(isValidBoolean(0)).toBe(false);
    expect(isValidBoolean("true")).toBe(false);
    expect(isValidBoolean(null)).toBe(false);
  });
  it("isValidColorIdx accepts valid palette indices only", () => {
    expect(isValidColorIdx(0, 8)).toBe(true);
    expect(isValidColorIdx(7, 8)).toBe(true);
    expect(isValidColorIdx(8, 8)).toBe(false);
    expect(isValidColorIdx(-1, 8)).toBe(false);
    expect(isValidColorIdx(1.5, 8)).toBe(false);
    expect(isValidColorIdx("0", 8)).toBe(false);
  });
  it("isValidNickname accepts 1-16 char strings", () => {
    expect(isValidNickname("a")).toBe(true);
    expect(isValidNickname("abcdefghijklmnop")).toBe(true); // 16 chars
    expect(isValidNickname("")).toBe(false);
    expect(isValidNickname("abcdefghijklmnopq")).toBe(false); // 17 chars
  });
});
