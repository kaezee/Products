// Turn the HTML mammoth extracts from a .docx into a flat list of importable
// items — chapters (title + body) or entities (title + body + type). Pure and
// DOM-free (regex over mammoth's HTML) so it runs in the browser and in a plain
// Node test.
//
// Real documents are messy and vary wildly in structure, so each mode has a
// couple of strategies with a smart default:
//   chapters — "smart" cuts on a title pattern (Chapter N / Prologue), because
//     authors apply heading styles to ordinary paragraphs; "headings" cuts on
//     every Word heading.
//   entities — "list" makes each bullet an entity (taxonomy/glossary docs);
//     "headings" makes each heading an entity (character-sheet docs).

export interface ParsedItem {
  title: string;
  body: string;
  type?: string; // entities only
}

export type ChapterStrategy = "smart" | "headings";
export type EntityStrategy = "list" | "headings";

const ENTS: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&apos;": "'",
  "&quot;": '"', "&ldquo;": '"', "&rdquo;": '"', "&mdash;": "—", "&ndash;": "–", "&hellip;": "…",
};

// Strip tags to text, but turn <br> into a newline first so lines that Word
// fused (e.g. "Beauty<br>Location…") don't glue together.
function toText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTS[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

const CHAPTER_MARK = /^\s*(?:chapter\s+[0-9ivxlcdm]+\b|prologue\b|epilogue\b|interlude\b)/i;
const singular = (s: string) => s.replace(/ies$/i, "y").replace(/s$/i, "");

interface Block { kind: "h" | "p" | "li"; raw: string; text: string }

function tokenize(html: string): Block[] {
  const out: Block[] = [];
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<(p|li)\b[^>]*>([\s\S]*?)<\/\3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ kind: "h", raw: m[2], text: toText(m[2]) });
    else out.push({ kind: m[3].toLowerCase() as "p" | "li", raw: m[4] ?? "", text: toText(m[4] ?? "") });
  }
  return out;
}

// A chapter heading is sometimes fused with its first paragraph and preceded by
// an empty "<a></a><br>". Split on <br>, drop empty parts, first real line wins.
function splitTitleBody(raw: string): { title: string; body: string } {
  const parts = raw.split(/<br\s*\/?>/i).map(toText).filter((p) => p.length > 0);
  return { title: parts[0] ?? "", body: parts.slice(1).join("\n").trim() };
}

// Split a glossary line ("Bunians (Rodents) - Beauty…") into name + description
// at the first real delimiter. Slashes are left alone (names like "Aveons/Brrds").
function splitName(text: string): { name: string; body: string } {
  const first = text.indexOf("\n") >= 0 ? text.slice(0, text.indexOf("\n")) : text;
  const m = first.match(/\s?[–—-]\s|\s\(|:\s|;\s/);
  if (m && m.index !== undefined && m.index > 0 && m.index <= 60) {
    const name = first.slice(0, m.index).trim();
    // Keep a "(" in the body (it's useful context); drop dash/colon delimiters.
    const restStart = m[0].includes("(") ? m.index + m[0].length - 1 : m.index + m[0].length;
    const rest = (first.slice(restStart) + text.slice(first.length)).trim();
    return { name, body: rest };
  }
  if (first.length <= 80) return { name: first.trim(), body: text.slice(first.length).trim() };
  return { name: first.slice(0, 60).trim() + "…", body: text };
}

// Guess the better entity strategy: bullet-heavy docs are taxonomies (list),
// heading-heavy docs are character sheets (headings).
export function suggestEntityStrategy(html: string): EntityStrategy {
  const li = (html.match(/<li\b/gi) ?? []).length;
  const h = (html.match(/<h[1-6]\b/gi) ?? []).length;
  return li >= 3 && li > h ? "list" : "headings";
}

export function parseDocxHtml(
  html: string,
  mode: "chapters" | "entities",
  opts?: {
    fileTitle?: string; defaultType?: string; canonicalTypes?: string[];
    chapterStrategy?: ChapterStrategy; entityStrategy?: EntityStrategy;
  },
): ParsedItem[] {
  const blocks = tokenize(html);
  const items: ParsedItem[] = [];
  const canon = opts?.canonicalTypes ?? [];
  const asTypeOf = (t: string) =>
    canon.find((c) => c.toLowerCase() === t.toLowerCase() || c.toLowerCase() === singular(t).toLowerCase());

  if (mode === "chapters") {
    const strategy = opts?.chapterStrategy ?? "smart";
    let cur: ParsedItem | null = null;
    const flush = () => { if (cur && (cur.title || cur.body)) items.push(cur); cur = null; };
    for (const b of blocks) {
      if (!b.text) continue;
      const isBreak = strategy === "smart" ? CHAPTER_MARK.test(b.text) : b.kind === "h";
      if (isBreak) {
        flush();
        const { title, body } = splitTitleBody(b.raw);
        cur = { title: title || opts?.fileTitle || "Untitled", body };
      } else {
        if (!cur) cur = { title: opts?.fileTitle || "Untitled", body: "" };
        cur.body = cur.body ? cur.body + "\n\n" + b.text : b.text;
      }
    }
    flush();
    if (items.length === 0) {
      const all = blocks.filter((b) => b.text).map((b) => b.text).join("\n\n");
      if (all) items.push({ title: opts?.fileTitle || "Chapter 1", body: all });
    }
    return items;
  }

  // entities
  const strategy = opts?.entityStrategy ?? "headings";
  let curType = opts?.defaultType ?? "Character";

  if (strategy === "list") {
    // Each bullet is an entity; headings/paragraphs are section context (a
    // heading named for a type still switches the type beneath it).
    for (const b of blocks) {
      if (b.kind === "h" && b.text) { const at = asTypeOf(b.text); if (at) curType = at; continue; }
      if (b.kind === "li" && b.text) {
        const { name, body } = splitName(b.text);
        if (name) items.push({ title: name, body, type: curType });
      }
    }
    return items;
  }

  // headings strategy: each heading = an entity; paragraphs and bullets = body.
  let cur: ParsedItem | null = null;
  const flush = () => { if (cur && (cur.title || cur.body)) items.push(cur); cur = null; };
  for (const b of blocks) {
    if (b.kind === "h" && b.text) {
      const at = asTypeOf(b.text);
      if (at) { flush(); curType = at; continue; }
      flush();
      cur = { title: b.text, body: "", type: curType };
    } else if (b.text) {
      if (!cur) continue;
      cur.body = cur.body ? cur.body + "\n" + b.text : b.text;
    }
  }
  flush();
  return items;
}
