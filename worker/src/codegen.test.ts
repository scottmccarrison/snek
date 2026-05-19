// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateCode, isValidCode } from "./codegen";

describe("codegen", () => {
  it("generates 4-letter codes from the restricted alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code.length).toBe(4);
      expect(isValidCode(code)).toBe(true);
    }
  });
  it("isValidCode rejects I, O, lowercase, wrong length, special chars", () => {
    expect(isValidCode("ABCI")).toBe(false);
    expect(isValidCode("AOBC")).toBe(false);
    expect(isValidCode("abcd")).toBe(false);
    expect(isValidCode("ABC")).toBe(false);
    expect(isValidCode("ABCDE")).toBe(false);
    expect(isValidCode("AB-D")).toBe(false);
  });
});
