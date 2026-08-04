import { describe, it, expect } from "vitest";
import { firstCoOccurrence } from "./offers";
import type { Entity } from "./types";

const ent = (id: string, title: string): Entity =>
  ({ id, world_id: "w", type: "Character", title, aliases: [], body: "", tags: [] } as unknown as Entity);

const cast = [ent("h", "Holmes"), ent("w", "Watson"), ent("m", "Moriarty")];

describe("firstCoOccurrence", () => {
  it("offers the first sentence where two known names co-occur", () => {
    const body = "It was cold. Holmes greeted Watson warmly at the door.";
    const o = firstCoOccurrence(body, cast, []);
    expect(o).not.toBeNull();
    expect([o!.aTitle, o!.bTitle].sort()).toEqual(["Holmes", "Watson"]);
    expect(o!.quote).toContain("Holmes greeted Watson");
  });

  it("returns null when no sentence has two names", () => {
    expect(firstCoOccurrence("Holmes was alone. Watson was elsewhere.", cast, [])).toBeNull();
  });

  it("skips a sentence that already carries a moment", () => {
    const body = "Holmes met Watson here. Later Holmes faced Moriarty.";
    const firstEnd = body.indexOf(".") + 1;
    // anchor covers the first sentence → the offer should be the second
    const o = firstCoOccurrence(body, cast, [{ start: 0, end: firstEnd }]);
    expect(o).not.toBeNull();
    expect([o!.aTitle, o!.bTitle].sort()).toEqual(["Holmes", "Moriarty"]);
  });

  it("returns the FIRST co-occurring sentence, never a later one (one per chapter)", () => {
    const body = "Nothing happened. Holmes and Watson dined together. Holmes and Moriarty duelled.";
    const o = firstCoOccurrence(body, cast, []);
    expect(o!.quote).toContain("Holmes and Watson");
  });
});
