import type { StreamRow, Valence } from "./types";

// One relationship line for the hover card: what this entity IS to someone,
// as the story stands at a given chapter.
export interface MentionState {
  label: string;       // the relationship type ("mother", "ally", "sworn enemy")
  other: string;       // the other party (or parties), display-ready
  valence: Valence;
  concealed: boolean;  // the current state is hidden from someone
  isCorrection: boolean;
}

// The entity's standing "as of here": for each relationship it's part of, the
// LATEST state at or before `order` (manuscript position). Undated states —
// chapterless connections — always count as known. One line per relationship.
export function statesAsOf(stream: StreamRow[], entityId: string, order: number | null): MentionState[] {
  const cutoff = order ?? Number.POSITIVE_INFINITY;
  const latest = new Map<string, StreamRow>();
  for (const r of stream) {
    if (!r.participants.some((p) => p.entity_id === entityId)) continue;
    // Undated (chapterless) states are "always true"; dated ones only if reached.
    const ord = r.manuscript_order ?? Number.NEGATIVE_INFINITY;
    if (ord > cutoff) continue;
    const prev = latest.get(r.relationship_id);
    if (!prev) { latest.set(r.relationship_id, r); continue; }
    const pOrd = prev.manuscript_order ?? Number.NEGATIVE_INFINITY;
    if (ord > pOrd || (ord === pOrd && r.created_at > prev.created_at)) latest.set(r.relationship_id, r);
  }
  const out: MentionState[] = [];
  for (const r of latest.values()) {
    if (r.is_ambient) continue; // ambient traits aren't a "to someone" line
    const others = r.participants.filter((p) => p.entity_id !== entityId).map((p) => p.title);
    out.push({
      label: r.type_label,
      other: others.join(" & ") || "—",
      valence: r.valence,
      concealed: !!r.known_by?.concealed_from?.length,
      isCorrection: r.is_correction,
    });
  }
  // Corrections and concealed states are the juiciest — surface them first.
  return out.sort((a, b) => Number(b.isCorrection) - Number(a.isCorrection) || Number(b.concealed) - Number(a.concealed));
}
