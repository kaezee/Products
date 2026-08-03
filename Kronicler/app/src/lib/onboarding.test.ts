import { describe, it, expect } from "vitest";
import { FORM_STRUCTURES, GENRE_TYPES, structureFor } from "./onboarding";

// These tables ARE the spec (Onboarding handoff §2.3 / §2.4). Pin them so a
// well-meaning edit can't silently change what a new project seeds.

describe("form → structure (§2.3)", () => {
  it("matches the ratified level tables", () => {
    expect(FORM_STRUCTURES.novel.levels).toEqual(["Chapter"]);
    expect(FORM_STRUCTURES.series.levels).toEqual(["Book", "Chapter"]);
    expect(FORM_STRUCTURES.screenplay.levels).toEqual(["Season", "Episode", "Scene"]);
    expect(FORM_STRUCTURES.comic.levels).toEqual(["Volume", "Issue"]);
    expect(FORM_STRUCTURES.other.levels).toEqual([]);
  });

  it("splits containers from the leaf label", () => {
    expect(structureFor("novel")).toEqual({ containers: [], leaf: "Chapter" });
    expect(structureFor("series")).toEqual({ containers: ["Book"], leaf: "Chapter" });
    expect(structureFor("screenplay")).toEqual({ containers: ["Season", "Episode"], leaf: "Scene" });
    expect(structureFor("other")).toEqual({ containers: [], leaf: "" });
  });
});

describe("genre → seeded types (§2.4)", () => {
  it("matches the ratified type tables", () => {
    expect(GENRE_TYPES.fantasy.types).toEqual(["Character", "Place", "Faction", "Creature"]);
    expect(GENRE_TYPES.crime.types).toEqual(["Character", "Place", "Case", "Suspect"]);
    expect(GENRE_TYPES.scifi.types).toEqual(["Character", "Place", "Ship", "Faction"]);
    expect(GENRE_TYPES.romance.types).toEqual(["Character", "Place"]);
    expect(GENRE_TYPES.historical.types).toEqual(["Character", "Place", "Faction", "Event"]);
    expect(GENRE_TYPES.nonfiction.types).toEqual(["Person", "Place", "Source", "Event"]);
    expect(GENRE_TYPES.other.types).toEqual(["Character", "Place"]);
  });

  it("every genre includes Character/Person and Place as the spine", () => {
    for (const g of Object.values(GENRE_TYPES)) {
      expect(g.types.some((t) => t === "Character" || t === "Person")).toBe(true);
      expect(g.types).toContain("Place");
    }
  });
});
