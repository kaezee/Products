import type { StreamRow, StreamParticipant, Valence } from "./types";
import { visibleUnderLens, isBelief } from "./knowledge";

// A relationship's whole life, folded from its append-only states into ONE arc —
// so the List shows a relationship once (with its history) instead of a row per
// state. A "change" is a transition to a different type, never a re-statement of
// the same one: two states of the same kind is zero changes; ally→allied is one.

export interface ArcState {
  stateId: string;
  typeId: string;
  typeLabel: string;
  valence: Valence;
  order: number | null;   // manuscript_order — null = a standing fact (no chapter)
  note: string | null;
  concealedN: number;     // how many characters this state is hidden from
  future: boolean;        // sits after the current chapter position
}

export interface RelArc {
  relationshipId: string;
  participants: StreamParticipant[];
  states: ArcState[];             // chronological
  changes: number;                // type transitions across the whole arc
  current: ArcState | null;       // the standing state at the chapter position
  lastChangeOrder: number;        // chapter the current standing began (for ordering)
}

// Build one arc per relationship from the raw stream, under a point of view.
// `asOf` marks the reading position; states beyond it are kept but flagged future.
export function buildArcs(rows: StreamRow[], viewer: string, asOf: number, kinds: Set<string>): RelArc[] {
  let vis = kinds.size ? rows.filter((r) => kinds.has(r.type_id)) : rows;
  // writer view = truth only (beliefs would double the arc); a character's view
  // already substitutes their beliefs and drops what they can't see.
  vis = viewer === "all" ? vis.filter((r) => !isBelief(r)) : visibleUnderLens(vis, viewer);

  const byRel = new Map<string, StreamRow[]>();
  for (const r of vis) (byRel.get(r.relationship_id) ?? byRel.set(r.relationship_id, []).get(r.relationship_id)!).push(r);

  const arcs: RelArc[] = [];
  for (const [rid, list] of byRel) {
    list.sort((a, b) => (a.manuscript_order ?? -1) - (b.manuscript_order ?? -1));
    const states: ArcState[] = list.map((r) => ({
      stateId: r.state_id, typeId: r.type_id, typeLabel: r.type_label, valence: r.valence,
      order: r.manuscript_order, note: r.note, concealedN: r.known_by?.concealed_from?.length ?? 0,
      future: (r.manuscript_order ?? -1) > asOf,
    }));

    let changes = 0;
    for (let i = 1; i < states.length; i++) if (states[i].typeId !== states[i - 1].typeId) changes++;

    // current standing = the last state at or before the reading position
    let curIdx = -1;
    for (let i = 0; i < states.length; i++) if (states[i].order == null || states[i].order! <= asOf) curIdx = i;
    const current = curIdx >= 0 ? states[curIdx] : null;

    // when did the current standing begin? the order of the latest state ≤ asOf
    // whose type differs from its predecessor (or the first state's order).
    let lastChangeOrder = current?.order ?? 0;
    for (let i = curIdx; i > 0; i--) {
      if (states[i].typeId !== states[i - 1].typeId) { lastChangeOrder = states[i].order ?? 0; break; }
      if (i === 1) lastChangeOrder = states[0].order ?? 0;
    }

    arcs.push({ relationshipId: rid, participants: list[list.length - 1].participants, states, changes, current, lastChangeOrder });
  }
  return arcs;
}
