import type { Entity } from "./types";

// Titles/particles that shouldn't act as name-part matches on their own.
const STOPWORDS = new Set([
  "the", "of", "a", "an", "and", "de", "la", "le", "von", "van", "der", "di",
  "mr", "mrs", "ms", "dr", "sir", "lady", "lord",
]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const properForm = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

// Whole full names + aliases (matched case-insensitively — a full name is
// distinctive enough that case doesn't matter).
function fullNames(e: Entity): string[] {
  return [e.title, ...e.aliases].map((s) => s.trim()).filter(Boolean);
}

// Distinctive single-word parts of a name, in proper-noun form. These are
// matched CASE-SENSITIVELY so a creature named "…Gentle giants" catches
// "the Gentle giants" but not the ordinary word "gentle" in prose. This is the
// whole reason a multi-word name doesn't fire on its common words.
function properParts(e: Entity): string[] {
  const out = new Set<string>();
  for (const phrase of fullNames(e)) {
    for (const raw of phrase.split(/\s+/)) {
      const p = raw.replace(/[^\p{L}\p{N}'-]/gu, "");
      if (p.length >= 3 && !STOPWORDS.has(p.toLowerCase())) out.add(properForm(p));
    }
  }
  return [...out];
}

function occurs(hay: string, needle: string, caseInsensitive: boolean): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(needle)}([^\\p{L}\\p{N}]|$)`, caseInsensitive ? "iu" : "u");
  return re.test(hay);
}

// Live mention scan (§7.4): which entities does this prose mention? Full names
// and aliases match case-insensitively as whole words; distinctive name-parts
// match only when capitalized, keeping common words out.
export function detectMentions(body: string, entities: Entity[]): Entity[] {
  if (!body.trim()) return [];
  return entities.filter(
    (e) =>
      fullNames(e).some((n) => occurs(body, n, true)) ||
      properParts(e).some((p) => occurs(body, p, false)),
  );
}
