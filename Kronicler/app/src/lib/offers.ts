import { detectMentions } from "./mentions";
import type { Entity } from "./types";

// Engine offer (§4.2): the first sentence where two known entities co-occur and
// no moment is anchored yet. It names a LOCATION, never a meaning — "these two are
// here together", never "this looks like an alliance". Sentence boundaries come
// from Intl.Segmenter, not a regex on periods, so dialogue, ellipses and
// abbreviations don't produce nonsense offers. At most one per chapter (the first).

export interface Offer { aTitle: string; bTitle: string; start: number; end: number; quote: string }

export function firstCoOccurrence(
  body: string,
  entities: Entity[],
  anchored: { start: number; end: number }[],
): Offer | null {
  if (!body || entities.length < 2) return null;
  const seg = new Intl.Segmenter(undefined, { granularity: "sentence" });
  for (const part of seg.segment(body)) {
    const start = part.index;
    const end = start + part.segment.length;
    // Skip a sentence that already carries a moment.
    if (anchored.some((a) => a.start < end && a.end > start)) continue;
    const uniq: Entity[] = [];
    for (const e of detectMentions(part.segment, entities)) {
      if (!uniq.some((u) => u.id === e.id)) uniq.push(e);
      if (uniq.length >= 2) break;
    }
    if (uniq.length >= 2) {
      return { aTitle: uniq[0].title, bTitle: uniq[1].title, start, end, quote: part.segment.trim() };
    }
  }
  return null;
}
