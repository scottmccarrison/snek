/**
 * 4-letter room code generator. Alphabet excludes I and O to avoid squat-
 * like patterns and visual ambiguity. Adapted from worms/worker/src/codegen.ts.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 4;

export function generateCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LEN) return false;
  for (let i = 0; i < CODE_LEN; i++) {
    if (!ALPHABET.includes(code[i])) return false;
  }
  return true;
}
