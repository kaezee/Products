// Turn the HTML mammoth extracts from a .docx into a flat list of importable
// items — chapters (title + body) or entities (title + body + type). Pure and
// DOM-free (regex over mammoth's clean HTML) so it runs in the browser and in a
// plain Node test.

export interface ParsedItem {
  title: string;
  body: string;
  type?: string; // entities only
}

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

const singular = (s: string) => s.replace(/ies$/i, "y").replace(/s$/i, "");

// Parse mammoth HTML into items. For entities, a heading whose text matches a
// canonical type (e.g. "Characters") is treated as a section divider that sets
// the type for the entries beneath it, not as an entity itself.
export function parseDocxHtml(
  html: string,
  mode: "chapters" | "entities",
  opts?: { fileTitle?: string; defaultType?: string; canonicalTypes?: string[] },
): ParsedItem[] {
  const blocks: { kind: "h" | "p"; text: string }[] = [];
  const re = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) blocks.push({ kind: "h", text: stripTags(m[2]) });
    else blocks.push({ kind: "p", text: stripTags(m[3] ?? "") });
  }

  const canon = opts?.canonicalTypes ?? [];
  const items: ParsedItem[] = [];
  let curType = opts?.defaultType ?? "Character";
  let cur: ParsedItem | null = null;
  const flush = () => { if (cur && (cur.title || cur.body)) items.push(cur); cur = null; };

  for (const b of blocks) {
    if (b.kind === "h" && b.text) {
      if (mode === "entities") {
        const asType = canon.find(
          (c) => c.toLowerCase() === b.text.toLowerCase() || c.toLowerCase() === singular(b.text).toLowerCase(),
        );
        if (asType) { flush(); curType = asType; continue; } // section divider
      }
      flush();
      cur = mode === "entities" ? { title: b.text, body: "", type: curType } : { title: b.text, body: "" };
    } else if (b.kind === "p" && b.text) {
      if (!cur) {
        if (mode === "chapters") cur = { title: opts?.fileTitle || "Untitled", body: "" };
        else continue; // ignore lore prose before the first heading
      }
      cur.body = cur.body ? cur.body + "\n\n" + b.text : b.text;
    }
  }
  flush();

  // A manuscript with no headings at all → one chapter of the whole text.
  if (mode === "chapters" && items.length === 0) {
    const all = blocks.filter((b) => b.text).map((b) => b.text).join("\n\n");
    if (all) items.push({ title: opts?.fileTitle || "Chapter 1", body: all });
  }
  return items;
}
