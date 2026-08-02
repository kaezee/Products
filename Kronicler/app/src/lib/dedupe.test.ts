import { describe, it, expect } from "vitest";
import { findDuplicates } from "./dedupe";
import type { Entity } from "./types";

const ent = (id: string, title: string, aliases: string[] = []): Entity => ({
  id, world_id: "w", type: "Character", title, aliases, body: "", tags: [],
});

describe("findDuplicates", () => {
  it("groups entities with the same normalized title", () => {
    const groups = findDuplicates([ent("1", "Odran"), ent("2", "Odran "), ent("3", "Mira")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("same-name");
    expect(groups[0].entities.map((e) => e.id).sort()).toEqual(["1", "2"]);
  });

  it("flags a title that is another entity's alias", () => {
    const groups = findDuplicates([ent("1", "Jack", ["Jackie"]), ent("2", "Jackie")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("name-is-alias");
  });

  it("does NOT collide near-miss sibling names (no fuzzy matching)", () => {
    expect(findDuplicates([ent("1", "Odran"), ent("2", "Odric")])).toEqual([]);
    expect(findDuplicates([ent("1", "Mira"), ent("2", "Mara")])).toEqual([]);
  });

  it("returns nothing for a clean cast", () => {
    expect(findDuplicates([ent("1", "Anna"), ent("2", "Ben")])).toEqual([]);
  });
});
