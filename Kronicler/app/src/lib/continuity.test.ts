import { describe, it, expect } from "vitest";
import { findIssues } from "./continuity";
import type { StreamRow, RelationshipType, Valence } from "./types";

let seq = 0;
const row = (p: Partial<StreamRow> & { relationship_id: string }): StreamRow => ({
  state_id: "s" + seq++,
  world_id: "w",
  type_id: "friend",
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
  participants: [{ entity_id: "a", title: "Anna", role: null }, { entity_id: "b", title: "Ben", role: null }],
  anchor_quote: null, anchor_prefix: null, anchor_suffix: null, anchor_start: null, anchor_end: null, anchor_status: null,
  ...p,
});

const relType = (id: string, extra: Partial<RelationshipType> = {}): RelationshipType => ({
  id, world_id: "w", label: id, valence: "bond", color: null, is_ambient: false, is_terminal: false, directed: false, converse: null, is_inner: false, ...extra,
});

const types = [relType("friend"), relType("dead", { is_terminal: true })];
const nameOf = (id: string) => (id === "a" ? "Anna" : "Ben");

describe("findIssues — reopened thread", () => {
  it("flags a terminal state that gets a later non-terminal one", () => {
    const stream = [
      row({ relationship_id: "r1", type_id: "dead", type_label: "died", manuscript_order: 3 }),
      row({ relationship_id: "r1", type_id: "friend", type_label: "friends", manuscript_order: 7 }),
    ];
    const issues = findIssues(stream, types, nameOf);
    const reopened = issues.filter((i) => i.kind === "reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).toMatchObject({ kind: "reopened", termCh: 3, laterCh: 7 });
  });

  it("does NOT flag a terminal state that is the last word", () => {
    const stream = [
      row({ relationship_id: "r1", type_id: "friend", manuscript_order: 3 }),
      row({ relationship_id: "r1", type_id: "dead", manuscript_order: 7 }),
    ];
    expect(findIssues(stream, types, nameOf).some((i) => i.kind === "reopened")).toBe(false);
  });
});

describe("findIssues — orphaned anchor", () => {
  it("flags a state anchored to a since-deleted chapter (ref set, order null)", () => {
    const stream = [row({ relationship_id: "r1", manuscript_ref: "gone", manuscript_order: null })];
    const issues = findIssues(stream, types, nameOf);
    expect(issues.filter((i) => i.kind === "orphaned-anchor")).toHaveLength(1);
  });

  it("does not flag a normally-anchored state", () => {
    const stream = [row({ relationship_id: "r1", manuscript_ref: "ch1", manuscript_order: 2 })];
    expect(findIssues(stream, types, nameOf).some((i) => i.kind === "orphaned-anchor")).toBe(false);
  });
});

describe("findIssues — belief clash (dramatic irony)", () => {
  it("flags a belief whose type differs from the current truth", () => {
    const stream = [
      row({ relationship_id: "r1", type_id: "friend", type_label: "friends", manuscript_order: 2 }),
      row({ relationship_id: "r1", type_id: "dead", type_label: "betrayed", manuscript_order: 4, known_by: { believed_by: ["a"] } }),
    ];
    const issues = findIssues(stream, types, nameOf);
    const clash = issues.filter((i) => i.kind === "belief-clash");
    expect(clash).toHaveLength(1);
    expect(clash[0]).toMatchObject({ belief: "betrayed", truth: "friends" });
  });

  it("does not flag a belief that matches the truth", () => {
    const stream = [
      row({ relationship_id: "r1", type_id: "friend", manuscript_order: 2 }),
      row({ relationship_id: "r1", type_id: "friend", manuscript_order: 4, known_by: { believed_by: ["a"] } }),
    ];
    expect(findIssues(stream, types, nameOf).some((i) => i.kind === "belief-clash")).toBe(false);
  });

  it("links the irony to the believer, not the relationship's participant", () => {
    // Watson believes a thing about the Moriarty–Holmes relationship. The row
    // names Watson, so clicking it must go to Watson — not participants[0]
    // (Moriarty), which was the mislead in the audit.
    const parts = [{ entity_id: "moriarty", title: "Moriarty", role: null }, { entity_id: "holmes", title: "Holmes", role: null }];
    const stream = [
      row({ relationship_id: "r1", type_id: "friend", type_label: "friends", manuscript_order: 2, participants: parts }),
      row({ relationship_id: "r1", type_id: "dead", type_label: "betrayed", manuscript_order: 4, known_by: { believed_by: ["watson"] }, participants: parts }),
    ];
    const clash = findIssues(stream, types, nameOf).filter((i) => i.kind === "belief-clash");
    expect(clash).toHaveLength(1);
    expect(clash[0].entityId).toBe("watson");
    if (clash[0].kind === "belief-clash") expect(clash[0].believerRefs[0].id).toBe("watson");
  });
});
