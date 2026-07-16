import type { Entity } from "./types";

// Common short words that shouldn't act as name-part matches on their own —
// avoids "The Warden" lighting up on every "the", or an entity named "A ..."
// matching everywhere. Titles/particles, not proper-noun parts.
const STOPWORDS = new Set([
  "the", "of", "a", "an", "and", "de", "la", "le", "von", "van", "der", "di",
  "mr", "mrs", "ms", "dr", "sir", "lady", "lord",
]);

// The recognizable "handles" for an entity: its full title, each alias, and the
// distinctive word-parts of its title. So "Maren Vael" is recognized when the
// prose says just "Maren" or just "Vael", without the writer having to add
// every short form as an alias by hand. Multi-word aliases likewise contribute
// their parts (e.g. "The Reedwife" also matches "Reedwife").
function handles(e: Entity): string[] {
  const out = new Set<string>();
  const phrases = [e.title, ...e.aliases].map((s) => s.trim()).filter(Boolean);
  for (const phrase of phrases) {
    out.add(phrase.toLowerCase());
    for (const part of phrase.split(/\s+/)) {
      const p = part.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, "");
      if (p.length >= 3 && !STOPWORDS.has(p)) out.add(p);
    }
  }
  return [...out];
}

// Does `hay` mention `needle` as a whole word? Word-boundary match so "Ana"
// doesn't fire inside "Banana" and "Vael" doesn't fire inside "travel".
function mentions(hay: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu").test(hay);
}

// Live mention scan (§7.4): which entities does this prose mention, by title,
// alias, or a distinctive part of either? Word-boundary matched, case-
// insensitive. Powers the live cast panel in the chapter editor.
export function detectMentions(body: string, entities: Entity[]): Entity[] {
  if (!body.trim()) return [];
  return entities.filter((e) => handles(e).some((h) => mentions(body, h)));
}
