import { describe, it, expect } from "vitest";
import { scanMentions, detectMentions } from "./mentions";
import type { Entity } from "./types";

const ent = (id: string, title: string, aliases: string[] = []): Entity => ({
  id, world_id: "w", type: "Character", title, aliases, body: "", tags: [],
});

describe("scanMentions", () => {
  it("matches a full name and its alias, longest-match-wins at a position", () => {
    const holmes = ent("h", "Sherlock Holmes", ["Holmes"]);
    const spans = scanMentions("Holmes arrived. Sherlock Holmes smiled.", [holmes]);
    // "Holmes" once, then the full "Sherlock Holmes" as one span (not "Holmes" inside it)
    expect(spans).toHaveLength(2);
    expect(spans.every((s) => s.entityId === "h")).toBe(true);
    expect(spans[1].end - spans[1].start).toBe("Sherlock Holmes".length);
  });

  it("matches distinctive name parts case-sensitively (proper nouns only)", () => {
    const giants = ent("g", "Gentle Giants");
    // lowercase "gentle" / singular "giant" must NOT match — precision matters
    expect(detectMentions("the giant was gentle", [giants])).toEqual([]);
    // but the proper-noun part does
    expect(detectMentions("the Giants marched", [giants])).toEqual([giants]);
  });

  it("does not match across word boundaries", () => {
    const al = ent("a", "Al");
    // "Al" is < 3 chars so it isn't a proper-part; only the exact full name matches
    expect(scanMentions("Alice and Albert", [al])).toEqual([]);
  });

  it("returns nothing for empty prose", () => {
    expect(scanMentions("", [ent("x", "Anyone")])).toEqual([]);
  });

  it("dedupes overlapping matches from multiple entities", () => {
    const a = ent("a", "Red Keep");
    const b = ent("b", "Keep");
    const spans = scanMentions("The Red Keep stood.", [a, b]);
    // the longer "Red Keep" wins; "Keep" inside it is not double-counted
    expect(spans).toHaveLength(1);
    expect(spans[0].entityId).toBe("a");
  });
});
