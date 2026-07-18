import type { StreamRow } from "./types";

// Directional relationships — with no schema change. Each participant can carry
// an optional per-side word in relationship_participants.role. A connection is
// "directional" when any participant has a role; symmetric connections leave
// both roles null and read from the relationship's type label, exactly as before.
//
//   mutual    : Sheila · Ainsley — "allied with"   (no roles; same both ways)
//   two-way   : Sheila = "wife", Ainsley = "husband"
//   one-way   : Yuna = "is a", Bunian = (no role)  → reverse isn't asserted

// Suggested inverse words so a writer rarely types the other side by hand.
// "" means one-way (a classification that shouldn't read backwards).
const INVERSE: Record<string, string> = {
  wife: "husband", husband: "wife", spouse: "spouse", partner: "partner",
  father: "child", mother: "child", parent: "child", dad: "child", mom: "child",
  son: "parent", daughter: "parent", child: "parent",
  brother: "sibling", sister: "sibling", sibling: "sibling",
  mentor: "student", teacher: "student", student: "mentor", master: "servant", servant: "master",
  "lives in": "home to", "home to": "lives in",
  rules: "ruled by", "ruled by": "rules", leads: "follows", follows: "leads",
  owns: "owned by", "owned by": "owns", creator: "creation", "created by": "creator",
  employs: "works for", "works for": "employs", serves: "served by", "served by": "serves",
  killed: "killed by", "killed by": "killed",
  // classifications — one-way by default (don't assert the reverse)
  "is a": "", "kind of": "", "type of": "", species: "", "a kind of": "",
};

// The suggested inverse for a forward word: a string (possibly "" for one-way),
// or null when we have no opinion (writer decides).
export function suggestInverse(forward: string): string | null {
  const key = forward.trim().toLowerCase();
  return key in INVERSE ? INVERSE[key] : null;
}

// Direction is a two-party concept; a group (3+ participants) always reads by
// its shared type label.
export function isDirectional(row: StreamRow): boolean {
  return row.participants.length === 2 && row.participants.some((p) => !!p.role);
}

export interface SideLabel { label: string; incoming: boolean }

// The word to show for a connection, read from `selfId`'s page.
// `incoming` = self is the object of a one-way relationship (read it passively).
export function sideLabel(row: StreamRow, selfId: string): SideLabel {
  if (!isDirectional(row)) return { label: row.type_label, incoming: false };
  const self = row.participants.find((p) => p.entity_id === selfId);
  if (self?.role) return { label: self.role, incoming: false };
  const other = row.participants.find((p) => p.entity_id !== selfId);
  return { label: other?.role || row.type_label, incoming: true };
}

// How the Stream should phrase a row's participants, direction-aware.
export interface StreamPhrase {
  subject?: string; verb?: string; object?: string; // one-way: "Yuna  is a  Bunian"
  names?: string; trailingVerb?: string;            // mutual / two-way
}
export function streamPhrase(row: StreamRow): StreamPhrase {
  const parts = row.participants;
  const roled = parts.filter((p) => !!p.role);
  // groups (3+) and role-less pairs read as names + shared verb
  if (parts.length !== 2 || roled.length === 0) {
    return { names: parts.map((p) => p.title).join(" · "), trailingVerb: row.type_label };
  }
  if (roled.length === 1) {
    const subj = roled[0];
    const obj = parts.find((p) => p.entity_id !== subj.entity_id);
    return { subject: subj.title, verb: subj.role ?? row.type_label, object: obj?.title };
  }
  // two-way: each side carries its own word
  return { names: parts.map((p) => `${p.title} — ${p.role}`).join(" · ") };
}
