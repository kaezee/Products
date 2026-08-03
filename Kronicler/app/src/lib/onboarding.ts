// Onboarding creation-screen data (Onboarding handoff §2.3 / §2.4). Kept as one
// pure table so the seeded structure and types can't drift from the ratified spec
// — the UI reads these, and onboarding.test.ts pins them to the doc. All seeded
// names are ordinary writer-owned values afterwards: renameable, deletable.

// §2.3 Form → structure. `levels` runs top→leaf: the last entry is the chapter-
// level (leaf) label, the earlier ones are container levels. "Something else"
// presets nothing — the writer fills the fields. Level 1 is optional; a container
// is only ever *offered*, never pre-created (§2.3).
export const FORM_STRUCTURES = {
  novel: { label: "Novel", levels: ["Chapter"] },
  series: { label: "Series", levels: ["Book", "Chapter"] },
  screenplay: { label: "Screenplay", levels: ["Season", "Episode", "Scene"] },
  comic: { label: "Comic", levels: ["Volume", "Issue"] },
  other: { label: "Something else", levels: [] },
} as const satisfies Record<string, { label: string; levels: readonly string[] }>;

export type FormKey = keyof typeof FORM_STRUCTURES;

// Split a form's levels into container kinds (segment_kinds to seed) and the leaf
// label (the chapter-level name). "Something else" yields nothing to preset.
export function structureFor(form: FormKey): { containers: string[]; leaf: string } {
  const levels = FORM_STRUCTURES[form].levels;
  if (levels.length === 0) return { containers: [], leaf: "" };
  return { containers: levels.slice(0, -1), leaf: levels[levels.length - 1] };
}

// §2.4 Genre → seeded entity types. Ordinary types, no special schema status.
export const GENRE_TYPES = {
  fantasy: { label: "Fantasy", types: ["Character", "Place", "Faction", "Creature"] },
  crime: { label: "Crime / mystery", types: ["Character", "Place", "Case", "Suspect"] },
  scifi: { label: "Sci-fi", types: ["Character", "Place", "Ship", "Faction"] },
  romance: { label: "Romance", types: ["Character", "Place"] },
  historical: { label: "Historical", types: ["Character", "Place", "Faction", "Event"] },
  nonfiction: { label: "Non-fiction", types: ["Person", "Place", "Source", "Event"] },
  other: { label: "Something else", types: ["Character", "Place"] },
} as const satisfies Record<string, { label: string; types: readonly string[] }>;

export type GenreKey = keyof typeof GENRE_TYPES;

// Ordered keys for rendering the two pickers (object order is the offer order).
export const FORM_KEYS = Object.keys(FORM_STRUCTURES) as FormKey[];
export const GENRE_KEYS = Object.keys(GENRE_TYPES) as GenreKey[];
