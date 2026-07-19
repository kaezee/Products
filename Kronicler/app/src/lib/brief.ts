import type { StreamRow, RelationshipType } from "./types";
import { isBelief, believersOf } from "./knowledge";

// The chapter Brief (PRD §7.5): everything true as a chapter opens, computed
// from relationship_states — never authored. Warnings appear where they prevent
// the error (at the draft), not in a report read later.

const DORMANT_GAP = 5; // chapters of silence before a thread reads as dormant

export interface Brief {
  entering: StreamRow[]; // current states among the cast present
  arcByRel: Map<string, StreamRow[]>; // full history per entering relationship
  secrets: StreamRow[];  // concealments a present character must not reference
  dormant: StreamRow[];  // quiet threads you could touch in this scene
  beliefs: { row: StreamRow; truth: StreamRow | null }[]; // present characters who believe (maybe wrongly)
}

export function computeBrief(
  allRows: StreamRow[],
  castIds: string[],
  chapter: { manuscript_order: number; story_time_ref: number | null },
  typesById: Map<string, RelationshipType>,
): Brief {
  const cast = new Set(castIds);

  // The truth of the scene comes from non-belief states; beliefs are handled
  // separately (below) so we can show who's mistaken in the room.
  const rows = allRows.filter((r) => !isBelief(r));

  // "Before this chapter opens" follows the chapter's IN-WORLD time when it has
  // one — so a flashback's Brief reflects the world as it stood at that moment,
  // not the reader's narrative position. Falls back to manuscript order (the
  // linear default) when no in-world time is set. (Dormancy stays narrative —
  // it's about chapters of silence, not in-world years.)
  const useStory = chapter.story_time_ref != null;
  const posOf = (r: StreamRow) => (useStory ? r.story_time_ref : r.manuscript_order);
  const here = useStory ? chapter.story_time_ref! : chapter.manuscript_order;

  const latestByRel = new Map<string, StreamRow>();
  for (const r of rows) {
    const p = posOf(r);
    if (p == null || p >= here) continue;
    const cur = latestByRel.get(r.relationship_id);
    if (!cur || p > (posOf(cur) ?? -Infinity)) latestByRel.set(r.relationship_id, r);
  }
  const latest = [...latestByRel.values()];

  const allPresent = (r: StreamRow) =>
    r.participants.length > 0 && r.participants.every((p) => cast.has(p.entity_id));
  const anyPresent = (r: StreamRow) => r.participants.some((p) => cast.has(p.entity_id));

  const entering = latest.filter(allPresent);

  const secrets = latest.filter((r) => {
    const concealed = r.known_by?.concealed_from ?? [];
    if (concealed.length === 0) return false;
    return anyPresent(r) || concealed.some((id) => cast.has(id));
  });

  // Dormant = narrative silence, always by manuscript order (its own latest map).
  const mLatest = new Map<string, StreamRow>();
  for (const r of rows) {
    if (r.manuscript_order == null || r.manuscript_order >= chapter.manuscript_order) continue;
    const cur = mLatest.get(r.relationship_id);
    if (!cur || r.manuscript_order > (cur.manuscript_order ?? -Infinity)) mLatest.set(r.relationship_id, r);
  }
  const dormant = [...mLatest.values()].filter((r) => {
    if (!anyPresent(r)) return false;
    const t = typesById.get(r.type_id);
    if (t?.is_ambient || t?.is_terminal) return false;
    return r.manuscript_order != null && chapter.manuscript_order - r.manuscript_order >= DORMANT_GAP;
  });

  // Arc: the full history (before this chapter, same axis) of each entering rel.
  const arcByRel = new Map<string, StreamRow[]>();
  for (const r of entering) {
    const hist = rows
      .filter((x) => { const p = posOf(x); return x.relationship_id === r.relationship_id && p != null && p < here && !x.is_correction; })
      .sort((a, b) => (posOf(a) ?? 0) - (posOf(b) ?? 0));
    arcByRel.set(r.relationship_id, hist);
  }

  // Beliefs held by someone present, current as this chapter opens — each paired
  // with the truth so the panel can show where they're mistaken (dramatic irony
  // live in the scene).
  const beliefByRel = new Map<string, StreamRow>();
  for (const r of allRows) {
    if (!isBelief(r)) continue;
    const p = posOf(r);
    if (p != null && p >= here) continue;
    if (!believersOf(r).some((id) => cast.has(id))) continue;
    const cur = beliefByRel.get(r.relationship_id);
    if (!cur || (p ?? -Infinity) > (posOf(cur) ?? -Infinity)) beliefByRel.set(r.relationship_id, r);
  }
  const beliefs = [...beliefByRel.values()].map((row) => ({ row, truth: latestByRel.get(row.relationship_id) ?? null }));

  return { entering, arcByRel, secrets, dormant, beliefs };
}
