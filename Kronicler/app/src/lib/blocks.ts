import { scanEmphasis, caretOutsideEmphasis } from "./emphasis";

// Block-level line formats for the editor. Pure text transforms (no DOM) so the
// tricky part — which lines a selection touches, toggling on/off, renumbering —
// is unit-tested, and the editor just feeds it plain-text offsets. Mirrors how
// toggleMarker handles inline bold/italic.

export type BlockKind = "h" | "quote" | "ul" | "ol";

const PREFIX: Record<BlockKind, string> = { h: "# ", quote: "> ", ul: "- ", ol: "1. " };
const ANY_PREFIX = /^(#{1,3} |> |- |\d+\. )/;

function hasKind(line: string, kind: BlockKind): boolean {
  if (kind === "ol") return /^\d+\. /.test(line);
  if (kind === "h") return /^#{1,3} /.test(line);
  return line.startsWith(PREFIX[kind]);
}

// The [start,end) of every line the selection touches (a bare caret = its line).
function touchedLines(text: string, selStart: number, selEnd: number): { ls: number; le: number } {
  const ls = text.lastIndexOf("\n", selStart - 1) + 1;
  // if the selection ends exactly at a line start, don't drag in the next line
  const probe = selEnd > selStart ? selEnd - 1 : selEnd;
  let le = text.indexOf("\n", probe);
  if (le < 0) le = text.length;
  return { ls, le };
}

export interface BlockResult { next: string; start: number; end: number }

// Toggle a block format across every line the selection covers. If they all
// already have it, strip it; otherwise apply it (replacing any other block
// prefix). Blank lines are left alone. Numbered lists renumber from 1.
export function toggleBlock(text: string, selStart: number, selEnd: number, kind: BlockKind): BlockResult {
  const { ls, le } = touchedLines(text, selStart, selEnd);
  const region = text.slice(ls, le);
  const lines = region.split("\n");
  const content = lines.filter((l) => l.trim() !== "");
  const allHave = content.length > 0 && content.every((l) => hasKind(l, kind));
  let n = 1;
  const out = lines.map((l) => {
    if (l.trim() === "") return l;
    const bare = l.replace(ANY_PREFIX, "");
    if (allHave) return bare;
    return (kind === "ol" ? `${n++}. ` : PREFIX[kind]) + bare;
  });
  const region2 = out.join("\n");
  const next = text.slice(0, ls) + region2 + text.slice(le);
  return { next, start: ls, end: ls + region2.length };
}

// Insert a scene break (its own line) after the line the caret sits on.
export function insertSceneBreak(text: string, caret: number): BlockResult {
  let le = text.indexOf("\n", caret);
  if (le < 0) le = text.length;
  const lead = le > 0 && text[le - 1] !== "\n" ? "\n" : "";
  const ins = lead + "* * *\n";
  const next = text.slice(0, le) + ins + text.slice(le);
  const caretTo = le + ins.length;
  return { next, start: caretTo, end: caretTo };
}

// The prefix a *continued* line inherits (numbered lists step up; a heading keeps
// its level), plus the line bounds, its kind, and whether the item is empty — the
// signal that Enter should exit the block.
function lineInfo(text: string, pos: number) {
  const ls = text.lastIndexOf("\n", pos - 1) + 1;
  let le = text.indexOf("\n", pos);
  if (le < 0) le = text.length;
  const line = text.slice(ls, le);
  const hm = line.match(/^(#{1,3}) /);
  const olm = line.match(/^(\d+)\. /);
  const ul = line.startsWith("- ");
  const quote = line.startsWith("> ");
  const heading = !!hm;
  const contentStart = ul || quote ? ls + 2 : hm ? ls + hm[0].length : olm ? ls + olm[0].length : ls;
  const prefix = ul ? "- " : quote ? "> " : hm ? hm[0] : olm ? `${parseInt(olm[1], 10) + 1}. ` : "";
  const continuable = ul || quote || heading || !!olm;
  const empty = continuable && text.slice(contentStart, le).trim() === "";
  return { ls, le, prefix, heading, empty };
}

// Enter, the way Docs/Word handle it: inside a list or quote, the new line
// continues the block (numbered lists step up). A heading keeps its style when
// split in the middle but drops to plain body when you press Enter at its end.
// Enter on an *empty* block item exits it instead of nesting a blank one.
export function splitAtEnter(text: string, caret: number): { next: string; caret: number } {
  const { ls, le, prefix, heading, empty } = lineInfo(text, caret);
  if (empty) return { next: text.slice(0, ls) + text.slice(le), caret: ls };
  // A heading shouldn't spawn another heading below itself — only preserve it
  // when there's text being pushed onto the new line (a real split).
  const carry = heading && caret >= le ? "" : prefix;
  const next = text.slice(0, caret) + "\n" + carry + text.slice(caret);
  return { next, caret: caret + 1 + carry.length };
}

const MARKER = { em: "*", strong: "**", both: "***" } as const;

// The full Enter behavior for the editor, as one tested transform. Splitting in
// the *middle* of a bold/italic run closes it on the current line and reopens it
// on the next — so the formatting continues, exactly like a quote's prefix does.
// At a run's edge (or in plain text) it falls back to a clean block-aware split,
// never leaving an orphaned marker.
export function enterEdit(text: string, a: number, b: number): { next: string; caret: number } {
  if (a !== b) {
    const a2 = caretOutsideEmphasis(text, a);
    const base = text.slice(0, a2) + text.slice(caretOutsideEmphasis(text, b));
    return splitAtEnter(base, a2);
  }
  const tok = scanEmphasis(text).find((t) => a > t.innerStart && a < t.innerEnd);
  if (tok) {
    const m = MARKER[tok.tag];
    const { prefix } = lineInfo(text, a);
    const next = text.slice(0, a) + m + "\n" + prefix + m + text.slice(a);
    return { next, caret: a + m.length + 1 + prefix.length + m.length };
  }
  return splitAtEnter(text, caretOutsideEmphasis(text, a));
}

export interface ActiveFormats { bold: boolean; italic: boolean; heading: boolean; quote: boolean; ul: boolean; ol: boolean }

// Which formats are "on" at the current selection — drives the toolbar's active
// state. Inline (bold/italic) is on when the caret sits inside an emphasis run;
// block is on when the caret's line carries that prefix.
export function activeFormats(text: string, selStart: number, selEnd: number): ActiveFormats {
  const ls = text.lastIndexOf("\n", selStart - 1) + 1;
  let le = text.indexOf("\n", selStart);
  if (le < 0) le = text.length;
  const line = text.slice(ls, le);
  let bold = false, italic = false;
  for (const t of scanEmphasis(text)) {
    if (selStart >= t.innerStart && selEnd <= t.innerEnd) {
      if (t.tag === "strong" || t.tag === "both") bold = true;
      if (t.tag === "em" || t.tag === "both") italic = true;
    }
  }
  return {
    bold, italic,
    heading: /^#{1,3} /.test(line),
    quote: /^> /.test(line),
    ul: /^- /.test(line),
    ol: /^\d+\. /.test(line),
  };
}
