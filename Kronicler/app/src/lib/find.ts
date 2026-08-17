// Plain-text search for the in-chapter find (⌘F). Pure and offset-based so the
// editor can map each hit to a live DOM range and re-paint after every
// re-decoration without re-scanning the DOM. Non-overlapping, left-to-right.
export interface FindMatch { start: number; end: number; }

// Case-insensitive by default. Both haystack and needle get the same transform
// so their offsets stay aligned; the returned offsets index the ORIGINAL text
// (safe for a manuscript — the rare length-changing lowercase, e.g. "İ", is the
// only edge where an offset could drift, and it can't corrupt anything, only
// mis-highlight).
export function findMatches(text: string, query: string, caseSensitive = false): FindMatch[] {
  if (!query) return [];
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: FindMatch[] = [];
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push({ start: i, end: i + needle.length });
    i = hay.indexOf(needle, i + needle.length);   // non-overlapping
  }
  return out;
}
