// Turn the HTML mammoth extracts from a .docx into a flat list of importable
// items — chapters (title + body) or entities (title + body + type). Pure and
// DOM-free (regex over mammoth's HTML) so it runs in the browser and in a plain
// Node test.
//
// Real manuscripts are messy: authors apply "Heading 1" to ordinary paragraphs,
// so "every heading = a chapter" massively over-splits. The default chapter
// strategy therefore cuts on a *title pattern* ("Chapter 12", "Prologue"), not
// on the HTML tag — noise headings fold back into their chapter's prose.

export interface ParsedItem {
  title: string;
  body: string;
  type?: string; // entities only
}

export type ChapterStrategy = "smart" | "headings";

const ENTS: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&apos;": "'",
  "&quot;": '"', "&ldquo;": '"', "&rdquo;": '"', "&mdash;": "—", "&ndash;": "–", "&hellip;": "…",
};

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTS[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .trim();
}

// A block begins a real chapter if it opens with a chapter/section marker.
// "chapter" must be followed by a number or roman numeral, so prose like
// "Chapter of his life" doesn't trigger; standalone "Part 2" does not (it's
// usually inside a chapter title that already starts with "Chapter").
const CHAPTER_MARK = /^\s*(?:chapter\s+[0-9ivxlcdm]+\b|prologue\b|epilogue\b|interlude\b)/i;

const singular = (s: string) => s.replace(/ies$/i, "y").replace(/s$/i, "");

interface Block { kind: "h" | "p"; raw: string; text: string }

function tokenize(html: string): Block[] {
  const out: Block[] = [];
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) out.push({ kind: "h", raw: m[2], text: stripTags(m[2]) });
    else out.push({ kind: "p", raw: m[3] ?? "", text: stripTags(m[3] ?? "") });
  }
  return out;
}

// A chapter heading and its first paragraph are sometimes fused in one element,
// separated by <br>s — and Word often emits a leading "<a></a><br>" before the
// title. Split on <br>, drop empty segments, take the first real line as the
// title and the rest as body.
function splitTitleBody(raw: string): { title: string; body: string } {
  const parts = raw.split(/<br\s*\/?>/i).map(stripTags).filter((p) => p.length > 0);
  return { title: parts[0] ?? "", body: parts.slice(1).join(" ").trim() };
}

export function parseDocxHtml(
  html: string,
  mode: "chapters" | "entities",
  opts?: { fileTitle?: string; defaultType?: string; canonicalTypes?: string[]; chapterStrategy?: ChapterStrategy },
): ParsedItem[] {
  const blocks = tokenize(html);
  const items: ParsedItem[] = [];

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

  // entities: each heading = an entity; a heading named for a type
  // ("Characters", "Places") is a section divider that sets the type beneath it.
  const canon = opts?.canonicalTypes ?? [];
  let curType = opts?.defaultType ?? "Character";
  let cur: ParsedItem | null = null;
  const flush = () => { if (cur && (cur.title || cur.body)) items.push(cur); cur = null; };
  for (const b of blocks) {
    if (b.kind === "h" && b.text) {
      const asType = canon.find(
        (c) => c.toLowerCase() === b.text.toLowerCase() || c.toLowerCase() === singular(b.text).toLowerCase(),
      );
      if (asType) { flush(); curType = asType; continue; }
      flush();
      cur = { title: b.text, body: "", type: curType };
    } else if (b.kind === "p" && b.text) {
      if (!cur) continue; // ignore lore prose before the first heading
      cur.body = cur.body ? cur.body + "\n\n" + b.text : b.text;
    }
  }
  flush();
  return items;
}
