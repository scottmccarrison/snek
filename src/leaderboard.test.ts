// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPersonalBests,
  getStoredName,
  isNewPersonalBest,
  recordPersonalBest,
  setStoredName,
} from "./leaderboard";

describe("leaderboard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("getStoredName returns empty string when nothing saved", () => {
    expect(getStoredName()).toBe("");
  });

  it("setStoredName persists and getStoredName reads it back", () => {
    setStoredName("ABC");
    expect(getStoredName()).toBe("ABC");
  });

  it("getPersonalBests returns empty array when none recorded", () => {
    expect(getPersonalBests()).toEqual([]);
  });

  it("recordPersonalBest stores and sorts desc", () => {
    recordPersonalBest(50);
    recordPersonalBest(100);
    recordPersonalBest(25);
    const list = getPersonalBests();
    expect(list.map((e) => e.score)).toEqual([100, 50, 25]);
  });

  it("recordPersonalBest trims to PERSONAL_BESTS_MAX=10", () => {
    for (let i = 1; i <= 15; i++) recordPersonalBest(i * 10);
    const list = getPersonalBests();
    expect(list).toHaveLength(10);
    expect(list[0].score).toBe(150);
    expect(list[9].score).toBe(60);
  });

  it("recordPersonalBest ignores zero and negative scores", () => {
    recordPersonalBest(0);
    recordPersonalBest(-5);
    expect(getPersonalBests()).toEqual([]);
  });

  it("isNewPersonalBest is true when list has fewer than topN entries", () => {
    recordPersonalBest(50);
    expect(isNewPersonalBest(1, 5)).toBe(true);
  });

  it("isNewPersonalBest is true when score beats the topN cutoff", () => {
    for (let i = 1; i <= 5; i++) recordPersonalBest(i * 10);
    expect(isNewPersonalBest(15, 5)).toBe(true);
  });

  it("isNewPersonalBest is false when score does not beat the topN cutoff", () => {
    for (let i = 1; i <= 5; i++) recordPersonalBest(i * 100);
    expect(isNewPersonalBest(50, 5)).toBe(false);
  });

  it("getPersonalBests is resilient to corrupted localStorage data", () => {
    localStorage.setItem("snek.personalBests", "not-json");
    expect(getPersonalBests()).toEqual([]);

    localStorage.setItem("snek.personalBests", JSON.stringify({ not: "array" }));
    expect(getPersonalBests()).toEqual([]);

    localStorage.setItem("snek.personalBests", JSON.stringify([{ score: "not-a-number", at: 1 }]));
    expect(getPersonalBests()).toEqual([]);
  });
});
