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

// Plural section label for a type ("Place" → "Places", "Creature" → "Creatures").
export function plural(type: string): string {
  if (/[^aeiou]y$/i.test(type)) return type.slice(0, -1) + "ies";
  if (/(s|sh|ch|x|z)$/i.test(type)) return type + "es";
  return type + "s";
}
