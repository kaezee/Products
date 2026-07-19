import type { Entity } from "./types";

// Likely-duplicate entities — the kind of mess a bulk import leaves ("Odran" and
// "Odran ", the same place typed twice, or a name that's already someone's
// alias). High precision on purpose: exact normalized matches only, NO fuzzy
// distance (siblings like "Odran"/"Odric" or "Mira"/"Mara" must never collide).

export interface DupGroup { key: string; entities: Entity[]; reason: "same-name" | "name-is-alias" }

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function findDuplicates(entities: Entity[]): DupGroup[] {
  const groups: DupGroup[] = [];
  const claimed = new Set<string>();

  // 1) two+ entities with the same normalized title
  const byName = new Map<string, Entity[]>();
  for (const e of entities) {
    const k = norm(e.title);
    if (!k) continue;
    const arr = byName.get(k) ?? []; arr.push(e); byName.set(k, arr);
  }
  for (const [k, list] of byName) {
    if (list.length > 1) { groups.push({ key: k, entities: list, reason: "same-name" }); claimed.add(k); }
  }

  // 2) one entity's title is another entity's alias (same thing entered twice)
  const aliasOwner = new Map<string, Entity>();
  for (const e of entities) for (const a of e.aliases) { const k = norm(a); if (k) aliasOwner.set(k, e); }
  for (const e of entities) {
    const k = norm(e.title);
    if (!k || claimed.has(k)) continue;
    const owner = aliasOwner.get(k);
    if (owner && owner.id !== e.id) { groups.push({ key: k, entities: [e, owner], reason: "name-is-alias" }); claimed.add(k); }
  }

  return groups;
}
