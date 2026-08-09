import { describe, it, expect } from "vitest";
import { buildVaultFiles, type VaultInput } from "./exportVault";
import type { Entity, Chapter, Note, StreamRow } from "./types";

const ent = (id: string, type: string, title: string, aliases: string[] = [], body = ""): Entity =>
  ({ id, world_id: "w", type, title, aliases, body } as Entity);

const chap = (id: string, order: number, title: string, body: string): Chapter =>
  ({ id, world_id: "w", title, manuscript_order: order, body, planned: false } as Chapter);

const input = (): VaultInput => ({
  worldName: "The Sherlock Holmes Casebook",
  entities: [
    ent("e1", "Character", "Sherlock Holmes", ["Holmes"], "The world's only consulting detective."),
    ent("e2", "Place", "221B Baker Street", [], "A set of rooms on the first floor."),
  ],
  chapters: [chap("c1", 1, "Mr Sherlock Holmes", "Watson meets Sherlock Holmes at 221B Baker Street.")],
  stream: [{
    state_id: "s1", relationship_id: "r1", world_id: "w", type_id: "t1", type_label: "shares rooms with",
    valence: "allied", manuscript_order: 1,
    participants: [{ entity_id: "e1", title: "Sherlock Holmes", role: null }, { entity_id: "e2", title: "221B Baker Street", role: null }],
  } as unknown as StreamRow],
  notes: [{ id: "n1", world_id: "w", body: "Remember Holmes never says 'elementary'." } as Note],
  data: { format: "kronicler-world-backup", version: 1 },
});

describe("buildVaultFiles", () => {
  const files = buildVaultFiles(input());
  const root = "the-sherlock-holmes-casebook";

  it("lays out the vault as an Obsidian folder tree", () => {
    expect(files.has(`${root}/manuscript/01-mr-sherlock-holmes.md`)).toBe(true);
    expect(files.has(`${root}/world/characters/sherlock-holmes.md`)).toBe(true);
    expect(files.has(`${root}/world/places/221b-baker-street.md`)).toBe(true);
    expect(files.has(`${root}/notes/notes.md`)).toBe(true);
    expect(files.has(`${root}/README.md`)).toBe(true);
    expect(files.has(`${root}/data.json`)).toBe(true);
  });

  it("wiki-links mentions in chapter prose to canonical names", () => {
    const ch = files.get(`${root}/manuscript/01-mr-sherlock-holmes.md`)!;
    expect(ch).toContain("[[Sherlock Holmes]]");
    expect(ch).toContain("[[221B Baker Street]]");
    expect(ch).toContain("word_count: 8");
  });

  it("entity file carries type + aliases (canonical first) and cross-links", () => {
    const e = files.get(`${root}/world/characters/sherlock-holmes.md`)!;
    expect(e).toContain("type: \"Character\"");
    expect(e).toContain("aliases: [\"Sherlock Holmes\", \"Holmes\"]"); // canonical leads so [[Sherlock Holmes]] resolves
    expect(e).toContain("# Sherlock Holmes");
    expect(e).toContain("## Appears in");
    expect(e).toContain("- [[01-mr-sherlock-holmes]]");
    expect(e).toContain("## Recorded moments");
    expect(e).toContain("shares rooms with [[221B Baker Street]]");
  });

  it("wiki-links notes too", () => {
    expect(files.get(`${root}/notes/notes.md`)!).toContain("[[Sherlock Holmes|Holmes]]");
  });
});
