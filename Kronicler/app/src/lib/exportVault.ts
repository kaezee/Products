import JSZip from "jszip";
import type { Entity, Chapter, Note, StreamRow } from "./types";
import { scanMentions } from "./mentions";

// Markdown-vault export (Foundations-before-auth handoff §1). Produces a folder
// of markdown files with YAML front-matter that opens directly in Obsidian as a
// vault — chapters and entities cross-linked with [[wiki links]]. Portability is
// the point: a human (or Obsidian) can read the whole world without Kronicler.
//
// buildVaultFiles is a pure path→content map so it can be unit-tested; the zip
// wrapper only adds JSZip on top.

const slug = (s: string): string =>
  (s || "").toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";

const wordCount = (body: string): number =>
  (body || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;

// A YAML flow-list with each item safely quoted.
const yamlList = (items: string[]): string => `[${items.map((s) => JSON.stringify(s)).join(", ")}]`;

// Plural, lowercase type folder: "Character" → "characters", "Place" → "places".
const typeFolder = (t: string): string => { const s = slug(t || "misc"); return s.endsWith("s") ? s : s + "s"; };

// Replace every mentioned name in the prose with an Obsidian [[wiki link]] to the
// entity's canonical name. Walk spans right-to-left so earlier indices stay valid.
function wikilink(body: string, entities: Entity[], nameById: Map<string, string>): string {
  const spans = scanMentions(body, entities);
  let out = body;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    const canonical = nameById.get(s.entityId);
    if (!canonical) continue;
    const shown = body.slice(s.start, s.end);
    const link = shown === canonical ? `[[${canonical}]]` : `[[${canonical}|${shown}]]`;
    out = out.slice(0, s.start) + link + out.slice(s.end);
  }
  return out;
}

export interface VaultInput {
  worldName: string;
  entities: Entity[];
  chapters: Chapter[];
  stream: StreamRow[];
  notes: Note[];
  data: object; // exportWorld() output, dropped in verbatim as data.json
}

export function buildVaultFiles(input: VaultInput): Map<string, string> {
  const { worldName, entities, chapters, stream, notes, data } = input;
  const files = new Map<string, string>();
  const root = slug(worldName) || "kronicler-project";
  const nameById = new Map(entities.map((e) => [e.id, e.title]));

  // Chapters in manuscript order → NN-slug filenames (planned/unwritten skipped).
  const sortedCh = [...chapters].filter((c) => !c.planned).sort((a, b) => a.manuscript_order - b.manuscript_order);
  const chFile = new Map<string, string>();
  sortedCh.forEach((c) => chFile.set(c.id, `${String(c.manuscript_order).padStart(2, "0")}-${slug(c.title)}`));

  const appearsIn = new Map<string, string[]>();
  sortedCh.forEach((c) => {
    const body = c.body || "";
    new Set(scanMentions(body, entities).map((s) => s.entityId)).forEach((eid) => {
      const arr = appearsIn.get(eid) ?? []; arr.push(chFile.get(c.id)!); appearsIn.set(eid, arr);
    });
    const fm = [`title: ${JSON.stringify(c.title)}`, `chapter: ${c.manuscript_order}`, `word_count: ${wordCount(body)}`];
    if (c.story_time_label) fm.push(`in_world_date: ${JSON.stringify(c.story_time_label)}`);
    const md = `---\n${fm.join("\n")}\n---\n\n${wikilink(body, entities, nameById).trim() || "_(empty)_"}\n`;
    files.set(`${root}/manuscript/${chFile.get(c.id)}.md`, md);
  });

  // Moments per entity, as prose lines (not JSON) under each entity (§1.5 rule 3).
  const momentsByEntity = new Map<string, string[]>();
  [...stream]
    .sort((a, b) => (a.manuscript_order ?? 1e9) - (b.manuscript_order ?? 1e9))
    .forEach((s) => {
      s.participants.forEach((p) => {
        const others = s.participants.filter((o) => o.entity_id !== p.entity_id)
          .map((o) => `[[${nameById.get(o.entity_id) ?? o.title}]]`);
        const ch = s.manuscript_order != null ? `ch. ${s.manuscript_order} — ` : "";
        const line = `- ${ch}${s.type_label}${others.length ? " " + others.join(", ") : ""}`;
        const arr = momentsByEntity.get(p.entity_id) ?? []; arr.push(line); momentsByEntity.set(p.entity_id, arr);
      });
    });

  // Entities → world/<type>/<slug>.md. The canonical name leads the aliases list
  // so a [[Canonical Name]] link from prose resolves to the slug-named file, and
  // real aliases resolve too (§1.5 rules 1–2).
  entities.forEach((e) => {
    const aliasList = [e.title, ...(e.aliases ?? []).filter(Boolean)];
    const fm = [`type: ${JSON.stringify(e.type)}`, `aliases: ${yamlList(aliasList)}`];
    let md = `---\n${fm.join("\n")}\n---\n\n# ${e.title}\n\n${(e.body || "").trim()}\n`;
    const appears = (appearsIn.get(e.id) ?? []).map((f) => `- [[${f}]]`);
    if (appears.length) md += `\n## Appears in\n\n${appears.join("\n")}\n`;
    const moments = momentsByEntity.get(e.id) ?? [];
    if (moments.length) md += `\n## Recorded moments\n\n${moments.join("\n")}\n`;
    files.set(`${root}/world/${typeFolder(e.type)}/${slug(e.title)}.md`, md);
  });

  // Project notes → notes/notes.md, wiki-linked like the prose.
  if (notes.length) {
    const blocks = notes.map((n) => wikilink(n.body || "", entities, nameById).trim() || "_(empty note)_");
    files.set(`${root}/notes/notes.md`, `# Notes\n\n${blocks.join("\n\n---\n\n")}\n`);
  }

  files.set(`${root}/README.md`,
    `# ${worldName}\n\nExported from Kronicler on ${new Date().toISOString().slice(0, 10)}. ` +
    `This folder is an Obsidian vault — open it in Obsidian and the [[links]] between ` +
    `chapters and characters resolve.\n\n` +
    `- \`manuscript/\` — your chapters, in order.\n` +
    `- \`world/\` — characters, places and other entities, grouped by type.\n` +
    `- \`notes/\` — your project notes.\n` +
    `- \`data.json\` — the same world as raw structured data.\n`);

  files.set(`${root}/data.json`, JSON.stringify(data, null, 2));
  return files;
}

// Zip the vault into a Blob, entirely in the browser (no server round-trip).
export async function exportVaultZip(input: VaultInput): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of buildVaultFiles(input)) zip.file(path, content);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
