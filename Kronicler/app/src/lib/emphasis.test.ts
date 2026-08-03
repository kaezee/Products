import { describe, it, expect } from "vitest";
import { scanEmphasis, toggleMarker, caretOutsideEmphasis } from "./emphasis";

// The emphasis layer is the piece most likely to silently corrupt prose (a
// stray offset shifts every mention after it), so it gets the closest tests.

describe("scanEmphasis", () => {
  it("finds a bold run with the right marker offsets", () => {
    const [t] = scanEmphasis("**bold**");
    expect(t).toMatchObject({ start: 0, end: 8, innerStart: 2, innerEnd: 6, tag: "strong" });
  });

  it("finds an italic run", () => {
    const [t] = scanEmphasis("*it*");
    expect(t).toMatchObject({ start: 0, end: 4, innerStart: 1, innerEnd: 3, tag: "em" });
  });

  it("finds a bold-italic run", () => {
    const [t] = scanEmphasis("***both***");
    expect(t).toMatchObject({ start: 0, end: 10, innerStart: 3, innerEnd: 7, tag: "both" });
  });

  it("finds multiple runs in order", () => {
    const marks = scanEmphasis("a **b** c *d*");
    expect(marks.map((m) => m.tag)).toEqual(["strong", "em"]);
    expect(marks[0].start).toBe(2);
    expect(marks[1].start).toBe(10);
  });

  it("does not let an inner italic overlap the bold that contains it", () => {
    const marks = scanEmphasis("**a *b* c**");
    expect(marks).toHaveLength(1);
    expect(marks[0].tag).toBe("strong");
    expect(marks[0].end).toBe(11);
  });

  it("requires the marker to hug non-space (no `** bold**`)", () => {
    expect(scanEmphasis("** bold**")).toHaveLength(0);
  });

  it("does not span a newline", () => {
    expect(scanEmphasis("**one\ntwo**")).toHaveLength(0);
  });

  it("returns nothing for plain text", () => {
    expect(scanEmphasis("just words, no stars")).toEqual([]);
  });

  it("tolerates a trailing space inside the markers (typed at a word's edge)", () => {
    // "*Test *" must still read as italic, not fall back to literal asterisks
    const [t] = scanEmphasis("*Test *");
    expect(t).toMatchObject({ start: 0, end: 7, tag: "em" });
    const [b] = scanEmphasis("**test **");
    expect(b).toMatchObject({ start: 0, end: 9, tag: "strong" });
  });

  it("still refuses a leading space (no `* text*`)", () => {
    expect(scanEmphasis("* text*")).toHaveLength(0);
  });

  it("does not treat a lone `a * b` as emphasis", () => {
    expect(scanEmphasis("a * b")).toHaveLength(0);
  });
});

describe("toggleMarker", () => {
  it("wraps a bare selection", () => {
    expect(toggleMarker("hello", 0, 5, "**")).toEqual({ next: "**hello**", start: 2, end: 7 });
  });

  it("wraps a selection in the middle of a line, shifting only the selection", () => {
    // "the cat sat" — select "cat" [4,7)
    expect(toggleMarker("the cat sat", 4, 7, "*")).toEqual({ next: "the *cat* sat", start: 5, end: 8 });
  });

  it("unwraps when the markers sit just OUTSIDE the selection", () => {
    // "**hello**", inner selection [2,7)
    expect(toggleMarker("**hello**", 2, 7, "**")).toEqual({ next: "hello", start: 0, end: 5 });
  });

  it("unwraps when the markers sit just INSIDE the selection", () => {
    // whole "**hello**" selected [0,9)
    expect(toggleMarker("**hello**", 0, 9, "**")).toEqual({ next: "hello", start: 0, end: 5 });
  });

  it("wrap then unwrap round-trips back to the original text", () => {
    const original = "round trip";
    const wrapped = toggleMarker(original, 0, original.length, "**");
    const back = toggleMarker(wrapped.next, wrapped.start, wrapped.end, "**");
    expect(back.next).toBe(original);
  });

  it("italic and bold markers don't collide (different lengths)", () => {
    // wrapping already-bold text in italic nests rather than unwrapping
    const r = toggleMarker("**hi**", 0, 6, "*");
    expect(r.next).not.toBe("hi"); // it did NOT treat the ** as its own italic pair
  });
});

describe("caretOutsideEmphasis", () => {
  // "*word*": caret at the visual end (offset 5, before the hidden closing *)
  // must snap past it to 6 so Enter breaks after the whole token, not inside it.
  it("snaps the end-of-word caret past the closing marker", () => {
    expect(caretOutsideEmphasis("*word*", 5)).toBe(6);
  });

  it("snaps the start-of-word caret before the opening marker", () => {
    // offset 1 sits just inside the opening * — pull back to 0
    expect(caretOutsideEmphasis("*word*", 1)).toBe(0);
  });

  it("leaves a caret already outside the token untouched", () => {
    expect(caretOutsideEmphasis("*word*", 0)).toBe(0);
    expect(caretOutsideEmphasis("*word*", 6)).toBe(6);
    expect(caretOutsideEmphasis("a *word* b", 9)).toBe(9);
  });

  it("leaves plain text untouched", () => {
    expect(caretOutsideEmphasis("no stars here", 5)).toBe(5);
  });

  it("snaps a mid-word caret to the nearer edge so the token stays intact", () => {
    // "**bold**": offset 3 (just after first inner char) is nearer the start
    expect(caretOutsideEmphasis("**bold**", 3)).toBe(0);
    // offset 5 is nearer the end
    expect(caretOutsideEmphasis("**bold**", 5)).toBe(8);
  });
});
