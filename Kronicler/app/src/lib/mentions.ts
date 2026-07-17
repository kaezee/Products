import type { Entity } from "./types";

// Titles/particles that shouldn't act as name-part matches on their own.
const STOPWORDS = new Set([
  "the", "of", "a", "an", "and", "de", "la", "le", "von", "van", "der", "di",
  "mr", "mrs", "ms", "dr", "sir", "lady", "lord",
]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const properForm = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

function fullNames(e: Entity): string[] {
  return [e.title, ...e.aliases].map((s) => s.trim()).filter(Boolean);
}

// Distinctive single-word parts of a name, in proper-noun form. Matched
// case-sensitively so "…Gentle giants" catches "the Gentle giants" but not the
// ordinary word "gentle".
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

export interface MentionSpan { start: number; end: number; entityId: string; len: number }

function pushAll(spans: MentionSpan[], hay: string, needle: string, ci: boolean, entityId: string) {
  // Whole-word via lookarounds so match.index is the needle itself.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, ci ? "giu" : "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(hay)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, entityId, len: m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
}

// Every place an entity is named in the prose, as non-overlapping character
// spans (longest match wins at any position). The single source of truth for
// both the highlight layer and the cast panel.
export function scanMentions(body: string, entities: Entity[]): MentionSpan[] {
  if (!body) return [];
  const raw: MentionSpan[] = [];
  for (const e of entities) {
    for (const n of fullNames(e)) pushAll(raw, body, n, true, e.id);
    for (const p of properParts(e)) pushAll(raw, body, p, false, e.id);
  }
  raw.sort((a, b) => a.start - b.start || b.len - a.len);
  const out: MentionSpan[] = [];
  let end = -1;
  for (const s of raw) {
    if (s.start >= end) { out.push(s); end = s.end; }
  }
  return out;
}

// Which entities does this prose mention (deduped) — for the cast panel.
export function detectMentions(body: string, entities: Entity[]): Entity[] {
  if (!body.trim()) return [];
  const ids = new Set(scanMentions(body, entities).map((s) => s.entityId));
  return entities.filter((e) => ids.has(e.id));
}
