import { describe, it, expect } from "vitest";
import { scanEmphasis, toggleMarker } from "./emphasis";

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
