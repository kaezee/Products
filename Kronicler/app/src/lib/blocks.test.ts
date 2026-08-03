import { describe, it, expect } from "vitest";
import { toggleBlock, insertSceneBreak, splitAtEnter, enterEdit, activeFormats } from "./blocks";

describe("enterEdit — emphasis continues like a block", () => {
  it("splits a bold run in the middle, keeping both halves bold", () => {
    // "**bold text**", caret before "text" (offset 7)
    expect(enterEdit("**bold text**", 7, 7)).toEqual({ next: "**bold **\n**text**", caret: 12 });
  });

  it("splits an italic run in the middle, keeping both halves italic", () => {
    // "*hello world*", caret before "world" (offset 7)
    expect(enterEdit("*hello world*", 7, 7)).toEqual({ next: "*hello *\n*world*", caret: 10 });
  });

  it("ends the emphasis when Enter lands at the run's edge", () => {
    // "*word*", caret at the visual end (offset 5) — new line is plain
    expect(enterEdit("*word*", 5, 5)).toEqual({ next: "*word*\n", caret: 7 });
  });

  it("carries both the quote prefix and the reopened bold", () => {
    // "> **bold**", caret inside the bold (offset 6)
    expect(enterEdit("> **bold**", 6, 6)).toEqual({ next: "> **bo**\n> **ld**", caret: 13 });
  });

  it("plain text just gets a newline", () => {
    expect(enterEdit("hello", 5, 5)).toEqual({ next: "hello\n", caret: 6 });
  });
});

describe("splitAtEnter", () => {
  it("continues a bullet list on Enter", () => {
    // caret at end of "- one" (offset 5)
    expect(splitAtEnter("- one", 5)).toEqual({ next: "- one\n- ", caret: 8 });
  });

  it("steps the number up in an ordered list", () => {
    expect(splitAtEnter("1. first", 8)).toEqual({ next: "1. first\n2. ", caret: 12 });
  });

  it("continues a quote", () => {
    expect(splitAtEnter("> said", 6)).toEqual({ next: "> said\n> ", caret: 9 });
  });

  it("exits the list when the item is empty", () => {
    // "- one\n- " with caret at the end (offset 8) — Enter on the empty item
    expect(splitAtEnter("- one\n- ", 8)).toEqual({ next: "- one\n", caret: 6 });
  });

  it("drops a heading to plain body", () => {
    expect(splitAtEnter("# Title", 7)).toEqual({ next: "# Title\n", caret: 8 });
  });

  it("plain paragraph just gets a newline", () => {
    expect(splitAtEnter("hello", 5)).toEqual({ next: "hello\n", caret: 6 });
  });

  it("splits mid-line, carrying the list prefix to the remainder", () => {
    // "- one two", caret after "one" (offset 5)
    expect(splitAtEnter("- one two", 5)).toEqual({ next: "- one\n-  two", caret: 8 });
  });
});

describe("toggleBlock — single line", () => {
  it("adds a heading prefix to the caret's line", () => {
    const r = toggleBlock("hello world", 3, 3, "h");
    expect(r.next).toBe("# hello world");
  });
  it("removes it when it's already there (toggle off)", () => {
    const r = toggleBlock("# hello world", 4, 4, "h");
    expect(r.next).toBe("hello world");
  });
  it("replaces a different block prefix rather than stacking", () => {
    const r = toggleBlock("> a quote", 4, 4, "ul");
    expect(r.next).toBe("- a quote");
  });
  it("only touches the caret's line, not the whole document", () => {
    const text = "first para\nsecond para\nthird para";
    const r = toggleBlock(text, 14, 14, "h"); // caret in "second para"
    expect(r.next).toBe("first para\n# second para\nthird para");
  });
});

describe("toggleBlock — multi-line selection", () => {
  const list = "milk\neggs\nbread";
  it("bullets every selected line", () => {
    const r = toggleBlock(list, 0, list.length, "ul");
    expect(r.next).toBe("- milk\n- eggs\n- bread");
  });
  it("numbers every selected line, renumbering from 1", () => {
    const r = toggleBlock(list, 0, list.length, "ol");
    expect(r.next).toBe("1. milk\n2. eggs\n3. bread");
  });
  it("toggles off only when every line already has it", () => {
    const bulleted = "- milk\n- eggs\n- bread";
    expect(toggleBlock(bulleted, 0, bulleted.length, "ul").next).toBe("milk\neggs\nbread");
  });
  it("applies (not removes) when only some lines have it", () => {
    const mixed = "- milk\neggs";
    expect(toggleBlock(mixed, 0, mixed.length, "ul").next).toBe("- milk\n- eggs");
  });
  it("does not drag in the next line when the selection ends at a line start", () => {
    const text = "one\ntwo\nthree";
    const r = toggleBlock(text, 0, 4, "h"); // selects "one\n", ends at start of "two"
    expect(r.next).toBe("# one\ntwo\nthree");
  });
  it("leaves blank lines alone", () => {
    const text = "a\n\nb";
    expect(toggleBlock(text, 0, text.length, "ul").next).toBe("- a\n\n- b");
  });
});

describe("insertSceneBreak", () => {
  it("drops a break line after the caret's line", () => {
    const r = insertSceneBreak("end of scene", 5);
    expect(r.next).toBe("end of scene\n* * *\n");
    expect(r.start).toBe(r.next.length); // caret past the break
  });
});

describe("activeFormats", () => {
  it("reports bold when the caret sits inside a bold run", () => {
    const text = "a **bold** word";
    expect(activeFormats(text, 5, 5).bold).toBe(true);   // inside "bold"
    expect(activeFormats(text, 0, 0).bold).toBe(false);  // outside
  });
  it("reports italic inside an italic run", () => {
    const text = "a *slanted* word";
    expect(activeFormats(text, 4, 4).italic).toBe(true);
  });
  it("reports the block format of the caret's line", () => {
    expect(activeFormats("# Title", 3, 3).heading).toBe(true);
    expect(activeFormats("> quoted", 3, 3).quote).toBe(true);
    expect(activeFormats("- item", 3, 3).ul).toBe(true);
    expect(activeFormats("2. step", 3, 3).ol).toBe(true);
  });
  it("reports nothing on plain text", () => {
    expect(activeFormats("just words", 4, 4)).toMatchObject({ bold: false, italic: false, heading: false, quote: false, ul: false, ol: false });
  });
});
