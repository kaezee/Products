import type { StreamRow, RelationshipType } from "./types";
import { isBelief, believersOf } from "./knowledge";

// Continuity checks over the relationship stream — the "catch my mistakes" layer.
// Pure/derived; node-tested. Two are genuine slips (a reopened terminal thread,
// a beat whose chapter was deleted); the third surfaces intentional dramatic
// irony so the writer can see it. (Note: a state concealed from one of its OWN
// participants is NOT an error — that's a secret betrayal the victim doesn't
// know about, a core use of the lens.)

export type Issue =
  | { kind: "reopened"; relId: string; entityId?: string; who: string; termCh: number; termLabel: string; laterCh: number; laterLabel: string }
  | { kind: "orphaned-anchor"; relId: string; entityId?: string; who: string; label: string; note: string | null }
  | { kind: "belief-clash"; relId: string; entityId?: string; believers: string; belief: string; truth: string };

// latest TRUTH state per relationship (beliefs + corrections ignored)
function latestTruth(stream: StreamRow[]): Map<string, StreamRow> {
  const m = new Map<string, StreamRow>();
  for (const s of stream) {
    if (isBelief(s) || s.is_correction) continue;
    const cur = m.get(s.relationship_id);
    if (!cur || (s.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) m.set(s.relationship_id, s);
  }
  return m;
}

export function findIssues(stream: StreamRow[], types: RelationshipType[], nameOf: (id: string) => string): Issue[] {
  const out: Issue[] = [];
  const terminalTypes = new Set(types.filter((t) => t.is_terminal).map((t) => t.id));

  // 1) reopened — a thread marked terminal (ended) then given a later non-terminal state
  if (terminalTypes.size) {
    const byRel = new Map<string, StreamRow[]>();
    for (const s of stream) {
      if (s.is_correction || isBelief(s) || s.manuscript_order == null) continue;
      const a = byRel.get(s.relationship_id) ?? []; a.push(s); byRel.set(s.relationship_id, a);
    }
    for (const [relId, states] of byRel) {
      const sorted = [...states].sort((a, b) => (a.manuscript_order! - b.manuscript_order!));
      const ti = sorted.findIndex((s) => terminalTypes.has(s.type_id));
      if (ti === -1) continue;
      const term = sorted[ti];
      const later = sorted.slice(ti + 1).find((s) => !terminalTypes.has(s.type_id));
      if (later) out.push({
        kind: "reopened", relId, entityId: term.participants[0]?.entity_id,
        who: term.participants.map((p) => p.title).join(" · "),
        termCh: term.manuscript_order!, termLabel: term.type_label,
        laterCh: later.manuscript_order!, laterLabel: later.type_label,
      });
    }
  }

  // 2) orphaned anchor — a beat marked in a chapter that's since been deleted
  // (manuscript_ref set, but the chapter no longer resolves, so it reads as
  // "standing" instead of "ch. N"). Re-mark it in the surviving chapter.
  const seenOrphan = new Set<string>();
  for (const s of stream) {
    if (isBelief(s)) continue;
    if (s.manuscript_ref != null && s.manuscript_order == null) {
      if (seenOrphan.has(s.state_id)) continue; seenOrphan.add(s.state_id);
      out.push({
        kind: "orphaned-anchor", relId: s.relationship_id, entityId: s.participants[0]?.entity_id,
        who: s.participants.map((p) => p.title).join(" · "), label: s.type_label, note: s.note,
      });
    }
  }

  // 3) belief clash — a belief whose nature differs from the current truth (irony)
  const truth = latestTruth(stream);
  const seenBelief = new Set<string>();
  for (const s of stream) {
    if (!isBelief(s)) continue;
    const t = truth.get(s.relationship_id);
    if (!t || t.type_id === s.type_id) continue;
    const key = s.relationship_id + ":" + believersOf(s).sort().join(",");
    if (seenBelief.has(key)) continue; seenBelief.add(key);
    out.push({
      kind: "belief-clash", relId: s.relationship_id, entityId: s.participants[0]?.entity_id,
      believers: believersOf(s).map(nameOf).join(", "), belief: s.type_label, truth: t.type_label,
    });
  }

  return out;
}
