// The curated entity types (Library sections). A real list — not free text —
// so a misspelling can't spawn a phantom section. Custom types are still
// allowed, but only through a deliberate "＋ Custom type…" choice, never by a
// typo. Order here is the order sections are offered in.
export const CANONICAL_ENTITY_TYPES = [
  "Character",
  "Place",
  "Faction",
  "Item",
  "Event",
  "Creature",
] as const;

// Sentinel used in the type <select> to reveal the free-text custom field.
export const CUSTOM_TYPE = "__custom__";

// A node's SHAPE on the relationship graph groups entity types by what the thing
// fundamentally IS — so a person, a place and a faction read as different kinds
// at a glance, before colour or label. Five shapes is the honest ceiling; a
// sixth is indistinguishable at node size. Character and Creature share a shape
// (both are living beings — colour still tells them apart). The word "family" is
// deliberately internal: in a writer's world "family" is a *relationship* (kin),
// so it must never surface as a node grouping in the UI. Legends say the labels
// below, never "family".
export type NodeFamily = "being" | "place" | "group" | "object" | "moment";

const TYPE_FAMILY: Record<string, NodeFamily> = {
  character: "being", creature: "being",
  place: "place",
  faction: "group",
  item: "object",
  event: "moment",
};

// Custom, writer-minted types have no known family, so they default to "object"
// (the neutral diamond) rather than masquerading as people or places.
export function familyOf(typeName: string): NodeFamily {
  return TYPE_FAMILY[typeName.trim().toLowerCase()] ?? "object";
}

// The user-facing name for each shape — what the legend prints. Never "family".
export const FAMILY_LABEL: Record<NodeFamily, string> = {
  being: "living beings",
  place: "places",
  group: "groups",
  object: "objects",
  moment: "moments",
};

// The 12 curated entity swatches — the exact enum the DB constrains to. This is
// the writer's whole colour vocabulary for types; no raw hex ever escapes it.
export const ENTITY_SWATCHES = [
  "azure", "teal", "green", "moss", "amber", "ochre",
  "rust", "crimson", "magenta", "violet", "plum", "slate",
] as const;
export type EntitySwatch = typeof ENTITY_SWATCHES[number];

export const LINE_STYLES = ["solid", "dotted", "dashed"] as const;

// Default swatch per built-in type (design doc 1 §3.6). Writer may override via
// the registry once type-editing lands.
export const BUILTIN_SWATCH: Record<string, string> = {
  character: "azure", place: "green", faction: "amber", item: "slate", event: "rust", creature: "plum",
};
// The six swatches free for writer-minted types, then the rest as overflow.
const FREE_POOL = ["teal", "moss", "ochre", "crimson", "magenta", "violet", "azure", "green", "amber", "slate", "rust", "plum"];

// Map every type NAME (lowercased) → its swatch. Registry rows win; built-ins
// fall back to their default; any remaining custom type gets a free swatch by
// sorted order, so no type is ever colourless (fixes the invisible-type bug).
export function buildTypeSwatches(
  registry: { name: string; swatch: string }[],
  allTypeNames: string[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of registry) m.set(r.name.toLowerCase(), r.swatch);
  for (const [n, s] of Object.entries(BUILTIN_SWATCH)) if (!m.has(n)) m.set(n, s);
  const custom = [...new Set(allTypeNames.map((n) => n.toLowerCase()))].filter((n) => !m.has(n)).sort();
  custom.forEach((n, i) => m.set(n, FREE_POOL[i % FREE_POOL.length]));
  return m;
}

// Plural section label for a type ("Place" → "Places", "Creature" → "Creatures").
export function plural(type: string): string {
  if (/[^aeiou]y$/i.test(type)) return type.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(type)) return type + "es";
  return type + "s";
}
