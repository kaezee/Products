import { describe, it, expect } from "vitest";
import { findMatches } from "./find";

describe("findMatches", () => {
  it("returns nothing for an empty query", () => {
    expect(findMatches("hello world", "")).toEqual([]);
  });

  it("finds every non-overlapping occurrence, left to right", () => {
    expect(findMatches("aXaXa", "aX")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it("does not overlap matches", () => {
    // "aa" in "aaa" is one match at 0, not two (0 and 1)
    expect(findMatches("aaa", "aa")).toEqual([{ start: 0, end: 2 }]);
  });

  it("is case-insensitive by default, offsets index the original text", () => {
    expect(findMatches("The Rain in Spain", "in")).toEqual([
      { start: 6, end: 8 },   // Ra[in]
      { start: 9, end: 11 },  // [in] (word)
      { start: 15, end: 17 }, // Spa[in]
    ]);
  });

  it("respects caseSensitive when asked", () => {
    expect(findMatches("Anna and anna", "anna", true)).toEqual([{ start: 9, end: 13 }]);
  });

  it("matches across spaces and punctuation as literal text", () => {
    expect(findMatches("he said, 'run.'", "'run.'")).toEqual([{ start: 9, end: 15 }]);
  });
});
