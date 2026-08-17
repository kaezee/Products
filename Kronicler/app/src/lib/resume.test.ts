import { describe, it, expect, beforeEach } from "vitest";
import { markResume, resumeChapterId } from "./resume";

const ch = (id: string, order: number, extra: Partial<{ planned: boolean; body: string }> = {}) =>
  ({ id, manuscript_order: order, planned: extra.planned ?? false, body: extra.body ?? "some prose" }) as never;

// Minimal localStorage for the node test env (no jsdom) — same stub the
// captureQueue test uses.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

describe("resumeChapterId", () => {

  it("prefers the last-opened chapter over the furthest-along one", () => {
    const chapters = [ch("a", 1), ch("b", 2), ch("c", 3)];
    markResume("w", "a");
    expect(resumeChapterId(chapters, "w")).toBe("a"); // not "c" (highest order)
  });

  it("ignores a stored id that no longer exists", () => {
    const chapters = [ch("a", 1), ch("b", 2)];
    markResume("w", "gone");
    expect(resumeChapterId(chapters, "w")).toBe("b"); // falls back to furthest written
  });

  it("falls back to the furthest-along WRITTEN chapter when nothing is stored", () => {
    const chapters = [ch("a", 1), ch("b", 2, { body: "" }), ch("c", 3, { body: "" })];
    expect(resumeChapterId(chapters, "w")).toBe("a"); // b, c are empty
  });

  it("keeps world scoping — a mark in one world doesn't leak to another", () => {
    const chapters = [ch("a", 1), ch("b", 2)];
    markResume("w1", "a");
    expect(resumeChapterId(chapters, "w2")).toBe("b"); // w2 has no mark → fallback
  });

  it("returns null for an empty manuscript", () => {
    expect(resumeChapterId([], "w")).toBeNull();
  });
});
