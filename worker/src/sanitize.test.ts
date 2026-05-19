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
  it("normalizeNickname keeps only A-Z and uppercases", () => {
    // Lowercase -> uppercase
    expect(normalizeNickname("abc")).toBe("ABC");
    // Non-letter chars stripped (digits, whitespace, punctuation, controls)
    expect(normalizeNickname("a1b 2c\x00!")).toBe("ABC");
    // zero-width space and bidi controls stripped because they aren't A-Z
    expect(normalizeNickname("a​b‮c")).toBe("ABC");
    // non-string returns empty
    expect(normalizeNickname(42)).toBe("");
    expect(normalizeNickname(null)).toBe("");
  });
  it("normalizeNickname clips to nicknameMaxLen (3)", () => {
    expect(normalizeNickname("abcdefghij")).toBe("ABC");
    expect(normalizeNickname("a")).toBe("A");
    expect(normalizeNickname("")).toBe("");
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
  it("isValidNickname accepts 1-3 uppercase A-Z strings only", () => {
    expect(isValidNickname("A")).toBe(true);
    expect(isValidNickname("AB")).toBe(true);
    expect(isValidNickname("ABC")).toBe(true);
    expect(isValidNickname("")).toBe(false);
    expect(isValidNickname("ABCD")).toBe(false); // too long
    expect(isValidNickname("abc")).toBe(false); // lowercase
    expect(isValidNickname("A1C")).toBe(false); // digit
    expect(isValidNickname("A C")).toBe(false); // space
  });
});
