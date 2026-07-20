// In-world dates. A writer types a free-text label ("1150 AE", "Third Age 3019",
// "Spring, Year 2", "500 BCE"); we pull a sortable number out of it so the
// chronological axis orders itself. The label is what's shown; the number only
// ever sorts. If we can't read a number, the ref stays null and the chapter
// sorts to the end until the writer sets it (by drag, later, or a clearer date).

export function parseStoryTime(label: string): number | null {
  const s = label.trim();
  if (!s) return null;
  const m = s.match(/-?\d+/);
  if (!m) return null;
  let n = parseInt(m[0], 10);
  if (Number.isNaN(n)) return null;
  // "before" epochs count backwards: "500 BC" / "500 BCE" / "500 before" → -500.
  // (Guard against matching the trailing E in "AE"/"CE" — require a word.)
  if (n > 0 && /\b(bce|bc|before)\b/i.test(s)) n = -n;
  return n;
}
