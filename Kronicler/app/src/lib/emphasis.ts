// Lightweight markdown emphasis over the plain-text prose value: **bold**,
// *italic*, and ***both***. The markers stay in the stored text (dimmed on
// screen) so the body remains plain, portable, and byte-for-byte identical to
// what the caret logic counts — emphasis is decoration only, exactly like a
// mention. Pure string logic, no DOM: this is the piece RichProse leans on for
// both rendering (scanEmphasis) and the ⌘B/⌘I toggle (toggleMarker), and the
// piece most worth pinning down with tests.

export type Emph = {
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
  tag: "strong" | "em" | "both";
};

// Non-overlapping emphasis tokens in `text`, left to right. One line at a time
// (no newline inside a token), bold-italic matched before bold before italic,
// and later tokens that overlap an earlier one are dropped.
export function scanEmphasis(text: string): Emph[] {
  const marks: Emph[] = [];
  let m: RegExpExecArray | null;
  const both = /\*\*\*(?=\S)([^\n]+?)(?<=\S)\*\*\*/g; // bold + italic
  while ((m = both.exec(text))) {
    marks.push({ start: m.index, end: m.index + m[0].length, innerStart: m.index + 3, innerEnd: m.index + m[0].length - 3, tag: "both" });
  }
  const bold = /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/g;
  while ((m = bold.exec(text))) {
    const s = m.index, e = s + m[0].length;
    if (marks.some((b) => s < b.end && e > b.start)) continue;
    marks.push({ start: s, end: e, innerStart: s + 2, innerEnd: e - 2, tag: "strong" });
  }
  const italic = /(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g;
  while ((m = italic.exec(text))) {
    const s = m.index, e = s + m[0].length;
    if (marks.some((b) => s < b.end && e > b.start)) continue; // inside a bold / bold-italic run
    marks.push({ start: s, end: e, innerStart: s + 1, innerEnd: e - 1, tag: "em" });
  }
  marks.sort((a, b) => a.start - b.start);
  const res: Emph[] = [];
  let last = -1;
  for (const k of marks) if (k.start >= last) { res.push(k); last = k.end; }
  return res;
}

export interface WrapResult { next: string; start: number; end: number }

// Toggle a markdown marker around the selection [a,b) in `text`. Purely a
// plain-text edit: wrap if bare, unwrap if the markers already hug the selection
// (either just outside it, or just inside). Returns the new text and where the
// selection lands so the caller can restore it.
export function toggleMarker(text: string, a: number, b: number, marker: string): WrapResult {
  const inner = text.slice(a, b);
  const M = marker.length;
  const outside = text.slice(a - M, a) === marker && text.slice(b, b + M) === marker;
  const insideWrapped = inner.length > 2 * M && inner.startsWith(marker) && inner.endsWith(marker);
  if (outside) {
    return { next: text.slice(0, a - M) + inner + text.slice(b + M), start: a - M, end: b - M };
  }
  if (insideWrapped) {
    const st = inner.slice(M, inner.length - M);
    return { next: text.slice(0, a) + st + text.slice(b), start: a, end: b - 2 * M };
  }
  return { next: text.slice(0, a) + marker + inner + marker + text.slice(b), start: a + M, end: b + M };
}
