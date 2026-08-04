import { describe, it, expect } from "vitest";
import { isBelief, believersOf, concealedFrom, visibleUnderLens, latestTruthByRel } from "./knowledge";
import type { StreamRow, Valence } from "./types";

let seq = 0;
const row = (p: Partial<StreamRow> & { relationship_id: string }): StreamRow => ({
  state_id: "s" + seq++,
  world_id: "w",
  type_id: "t",
  type_label: "friend",
  valence: "bond" as Valence,
  is_ambient: false,
  story_time_ref: null,
  manuscript_ref: null,
  chapter_title: null,
  manuscript_order: 1,
  is_correction: false,
  known_by: null,
  note: null,
  created_at: "2020-01-01",
  participants: [{ entity_id: "a", title: "A", role: null }, { entity_id: "b", title: "B", role: null }],
  anchor_quote: null, anchor_prefix: null, anchor_suffix: null, anchor_start: null, anchor_end: null, anchor_status: null,
  ...p,
});

describe("knowledge predicates", () => {
  it("classifies beliefs by known_by.believed_by", () => {
    expect(isBelief(row({ relationship_id: "r", known_by: { believed_by: ["X"] } }))).toBe(true);
    expect(isBelief(row({ relationship_id: "r", known_by: { concealed_from: ["X"] } }))).toBe(false);
    expect(isBelief(row({ relationship_id: "r", known_by: null }))).toBe(false);
    expect(believersOf(row({ relationship_id: "r", known_by: { believed_by: ["X", "Y"] } }))).toEqual(["X", "Y"]);
    expect(concealedFrom(row({ relationship_id: "r", known_by: { concealed_from: ["Z"] } }))).toEqual(["Z"]);
  });
});

describe("visibleUnderLens", () => {
  it("returns everything for the 'all' writer lens", () => {
    const rows = [row({ relationship_id: "r1" }), row({ relationship_id: "r2", known_by: { believed_by: ["X"] } })];
    expect(visibleUnderLens(rows, "all")).toHaveLength(2);
  });

  it("hides truths concealed from the viewer", () => {
    const rows = [
      row({ relationship_id: "r1" }),
      row({ relationship_id: "r2", known_by: { concealed_from: ["X"] } }),
    ];
    const seen = visibleUnderLens(rows, "X");
    expect(seen.map((r) => r.relationship_id)).toEqual(["r1"]);
  });

  it("substitutes the viewer's own belief for the truth on that relationship", () => {
    const truth = row({ relationship_id: "r1", type_label: "enemy" });
    const belief = row({ relationship_id: "r1", type_label: "friend", known_by: { believed_by: ["X"] } });
    const other = row({ relationship_id: "r2", type_label: "ally" });
    const seen = visibleUnderLens([truth, belief, other], "X");
    // X sees their belief (friend) on r1, the truth (enemy) is overridden, and r2 truth stands
    const r1 = seen.filter((r) => r.relationship_id === "r1");
    expect(r1).toHaveLength(1);
    expect(r1[0].type_label).toBe("friend");
    expect(seen.some((r) => r.relationship_id === "r2")).toBe(true);
  });

  it("never shows another character's private belief", () => {
    const belief = row({ relationship_id: "r1", known_by: { believed_by: ["Y"] } });
    expect(visibleUnderLens([belief], "X")).toEqual([]);
  });
});

describe("latestTruthByRel", () => {
  it("keeps the highest manuscript_order truth per relationship, ignoring beliefs", () => {
    const rows = [
      row({ relationship_id: "r1", manuscript_order: 1, type_label: "early" }),
      row({ relationship_id: "r1", manuscript_order: 5, type_label: "late" }),
      row({ relationship_id: "r1", manuscript_order: 9, type_label: "belief", known_by: { believed_by: ["X"] } }),
    ];
    const m = latestTruthByRel(rows);
    expect(m.get("r1")?.type_label).toBe("late");
  });
});
