import type { StreamRow, RelationshipType } from "./types";

// The chapter Brief (PRD §7.5): everything true as a chapter opens, computed
// from relationship_states — never authored. Warnings appear where they prevent
// the error (at the draft), not in a report read later.

const DORMANT_GAP = 5; // chapters of silence before a thread reads as dormant

export interface Brief {
  entering: StreamRow[]; // current states among the cast present
  secrets: StreamRow[];  // concealments a present character must not reference
  dormant: StreamRow[];  // quiet threads you could touch in this scene
}

export function computeBrief(
  rows: StreamRow[],
  castIds: string[],
  chapterOrder: number,
  typesById: Map<string, RelationshipType>,
): Brief {
  const cast = new Set(castIds);

  // latest state per relationship strictly BEFORE this chapter opens
  const latestByRel = new Map<string, StreamRow>();
  for (const r of rows) {
    if (r.manuscript_order == null || r.manuscript_order >= chapterOrder) continue;
    const cur = latestByRel.get(r.relationship_id);
    if (!cur || r.manuscript_order > (cur.manuscript_order ?? -Infinity)) {
      latestByRel.set(r.relationship_id, r);
    }
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

  const dormant = latest.filter((r) => {
    if (!anyPresent(r)) return false;
    const t = typesById.get(r.type_id);
    if (t?.is_ambient || t?.is_terminal) return false;
    return r.manuscript_order != null && chapterOrder - r.manuscript_order >= DORMANT_GAP;
  });

  return { entering, secrets, dormant };
}
