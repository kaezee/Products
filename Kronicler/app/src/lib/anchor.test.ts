import { describe, it, expect } from "vitest";
import { makeAnchor, resolveAnchor } from "./anchor";

// Anchoring is the layer that decides whether a moment/comment survives an edit,
// so it gets close tests — especially the "prose shifted above it" repair.

const body = "Holmes met Watson at Baker Street. Later, Holmes met Moriarty at the falls.";

describe("makeAnchor", () => {
  it("captures the quote and ~30 chars of context", () => {
    const start = body.indexOf("Baker Street");
    const a = makeAnchor(body, start, start + "Baker Street".length);
    expect(a.quote).toBe("Baker Street");
    expect(a.prefix.endsWith("met Watson at ")).toBe(true);
    expect(a.suffix.startsWith(".")).toBe(true);
  });
});

describe("resolveAnchor", () => {
  it("fast-paths when the offsets still hold the quote", () => {
    const s = body.indexOf("Watson");
    const a = makeAnchor(body, s, s + 6);
    const r = resolveAnchor(body, a);
    expect(r).toEqual({ start: s, end: s + 6, status: "ok", repaired: false });
  });

  it("repairs offsets when prose is inserted above the anchor", () => {
    const s = body.indexOf("Baker Street");
    const a = makeAnchor(body, s, s + "Baker Street".length);
    const edited = "A new opening paragraph was added.\n\n" + body;
    const r = resolveAnchor(edited, a);
    expect(r.status).toBe("ok");
    expect(r.repaired).toBe(true);
    expect(edited.slice(r.start, r.end)).toBe("Baker Street");
  });

  it("uses prefix/suffix to pick the right one when the quote repeats", () => {
    // "Holmes met" appears twice; anchor the SECOND (…met Moriarty)
    const s2 = body.indexOf("Holmes met", body.indexOf("Holmes met") + 1);
    const a = makeAnchor(body, s2, s2 + "Holmes met".length);
    // prepend text so stored offsets no longer line up → force the search path
    const edited = "xxxxx " + body;
    const r = resolveAnchor(edited, a);
    expect(r.status).toBe("ok");
    expect(edited.slice(r.end, r.end + 9)).toBe(" Moriarty");
  });

  it("marks stale when the quote is gone entirely", () => {
    const s = body.indexOf("Baker Street");
    const a = makeAnchor(body, s, s + "Baker Street".length);
    const r = resolveAnchor("A completely rewritten chapter with none of it.", a);
    expect(r.status).toBe("stale");
  });
});
