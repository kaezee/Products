import type { StreamRow } from "./types";

// The knowledge model has two layers, both carried in relationship_states.known_by
// (no schema change):
//
//   TRUTH   — objective states. `concealed_from: [ids]` hides a true state from
//             characters who don't know it (they lack the knowledge).
//   BELIEF  — `believed_by: [ids]` marks a state as what those characters THINK
//             is true. A belief can contradict the truth (dramatic irony).
//
// "As X believes" then shows X's world: X's own beliefs replace the truth about
// those relationships; truths concealed from X vanish; other people's private
// beliefs are never in X's view.

export const believersOf = (r: StreamRow): string[] => r.known_by?.believed_by ?? [];
export const isBelief = (r: StreamRow): boolean => believersOf(r).length > 0;
export const concealedFrom = (r: StreamRow): string[] => r.known_by?.concealed_from ?? [];

// Rows visible under a lens. `rows` should already be scoped by as-of + type.
// viewer = "all" (the writer — sees truth plus every belief, tagged) or an id.
export function visibleUnderLens(rows: StreamRow[], viewer: string): StreamRow[] {
  if (viewer === "all") return rows;
  // relationships X holds a belief about — X's belief overrides the truth for these
  const overridden = new Set(
    rows.filter((r) => isBelief(r) && believersOf(r).includes(viewer)).map((r) => r.relationship_id),
  );
  return rows.filter((r) => {
    if (isBelief(r)) return believersOf(r).includes(viewer); // only X's own beliefs
    if (concealedFrom(r).includes(viewer)) return false;     // X doesn't know this truth
    if (overridden.has(r.relationship_id)) return false;     // X's belief stands in for it
    return true;
  });
}

// Latest TRUTH state per relationship (beliefs ignored) — the writer's canonical
// world, and the baseline a belief is compared against for irony.
export function latestTruthByRel(rows: StreamRow[]): Map<string, StreamRow> {
  const m = new Map<string, StreamRow>();
  for (const r of rows) {
    if (isBelief(r)) continue;
    const cur = m.get(r.relationship_id);
    if (!cur || (r.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) m.set(r.relationship_id, r);
  }
  return m;
}

// The one current state per relationship under a lens (for the graph).
export function latestByRel(rows: StreamRow[]): StreamRow[] {
  const m = new Map<string, StreamRow>();
  for (const r of rows) {
    const cur = m.get(r.relationship_id);
    if (!cur || (r.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) m.set(r.relationship_id, r);
  }
  return [...m.values()];
}

// Does this belief contradict the concurrent truth? Returns the truth's label to
// show the irony ("believes allied — actually hostile"), or null if it matches
// or there's no known truth to compare.
export function ironyLabel(belief: StreamRow, truthByRel: Map<string, StreamRow>): string | null {
  const truth = truthByRel.get(belief.relationship_id);
  if (!truth) return null;
  return truth.type_id === belief.type_id ? null : truth.type_label;
}
