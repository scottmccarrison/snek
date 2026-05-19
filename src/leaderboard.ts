/**
 * Personal-best leaderboard backed by localStorage. Adapted from
 * skifree-web's js/leaderboard.js (MIT). Server-backed daily / all-time
 * boards are deferred to the multiplayer phase; this is local-only.
 */

const NAME_KEY = "snek.playerName";
const PERSONAL_BESTS_KEY = "snek.personalBests";
const PERSONAL_BESTS_MAX = 10;

export interface PersonalBest {
  score: number;
  at: number;
}

export function getStoredName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // localStorage can throw in private-browsing mode; silently ignore.
  }
}

export function getPersonalBests(): PersonalBest[] {
  try {
    const raw = localStorage.getItem(PERSONAL_BESTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is PersonalBest =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as PersonalBest).score === "number" &&
        typeof (e as PersonalBest).at === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Records a score if positive. Returns the updated, trimmed list.
 * Sorted by score desc; tied scores keep the older entry first.
 */
export function recordPersonalBest(score: number): PersonalBest[] {
  const s = Math.floor(score);
  if (s <= 0) return getPersonalBests();
  const list = getPersonalBests();
  list.push({ score: s, at: Date.now() });
  list.sort((a, b) => b.score - a.score || a.at - b.at);
  const trimmed = list.slice(0, PERSONAL_BESTS_MAX);
  try {
    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
  return trimmed;
}

/**
 * Returns true if the score would crack the top N (default 5) of personal
 * bests if recorded. Used to show a 'NEW BEST!' banner on the death screen.
 * Note: call BEFORE recordPersonalBest so the comparison is against the
 * pre-insertion list.
 */
export function isNewPersonalBest(score: number, topN = 5): boolean {
  if (score <= 0) return false;
  const list = getPersonalBests();
  if (list.length < topN) return true;
  return score > (list[topN - 1]?.score ?? 0);
}
