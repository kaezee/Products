import { useRef, useState } from "react";
import { createChapter, createEntity } from "../lib/api";
import { parseDocxHtml, suggestEntityStrategy, textToHtml, type ParsedItem } from "../lib/docimport";
import { detectEntities } from "../lib/entityDetect";
import { CANONICAL_ENTITY_TYPES } from "../lib/entityTypes";
import { Icon } from "../components/icons";

interface CastPick { name: string; count: number; type: string; keep: boolean }

// Bulk-import a manuscript (→ chapters) or a lore doc (→ entities), from a .docx
// file or pasted text — Google Docs and Word both export/copy cleanly. A preview
// + per-item selection step comes before anything is written, so a bad parse
// never touches the DB. After a manuscript import we read the prose back and
// offer the recurring names it found as one-click cast, so coming over from Docs
// half-builds the world instead of dropping the writer into empty rooms.
export function ImportDocx({ worldId, mode, startOrder, existingTitles, onClose, onDone }: {
  worldId: string;
  mode: "chapters" | "entities";
  startOrder: number;
  existingTitles?: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "preview" | "importing" | "cast" | "done">("pick");
  const [source, setSource] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [rawHtml, setRawHtml] = useState("");
  const [strategy, setStrategy] = useState<string>(mode === "chapters" ? "smart" : "headings");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [types, setTypes] = useState<string[]>([]); // parallel to items (entities)
  const [keep, setKeep] = useState<boolean[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [cast, setCast] = useState<CastPick[]>([]);
  const [castBusy, setCastBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyParse(html: string, name: string, strat: string) {
    const parsed = parseDocxHtml(html, mode, {
      fileTitle: name.replace(/\.docx$/i, ""),
      defaultType: "Character",
      canonicalTypes: [...CANONICAL_ENTITY_TYPES],
      chapterStrategy: mode === "chapters" ? (strat as "smart" | "headings") : undefined,
      entityStrategy: mode === "entities" ? (strat as "list" | "headings") : undefined,
    });
    setItems(parsed);
    setTypes(parsed.map((p) => p.type ?? "Character"));
    setKeep(parsed.map(() => true));
    return parsed.length;
  }

  async function onFile(file: File) {
    setErr(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Lazy-load mammoth so its ~700KB only downloads when someone imports.
      const mammoth = (await import("mammoth/mammoth.browser")).default;
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      // Entities: auto-pick list vs headings from the doc's shape.
      const strat = mode === "entities" ? suggestEntityStrategy(html) : strategy;
      setStrategy(strat);
      if (applyParse(html, file.name, strat) === 0) { setErr("Couldn't find any content in that file."); return; }
      setRawHtml(html);
      setFileName(file.name);
      setStage("preview");
    } catch (x) { setErr("Couldn't read that file — is it a .docx? (" + String(x) + ")"); }
  }

  function onPaste() {
    setErr(null);
    const text = pasteText.trim();
    if (!text) { setErr("Paste some text first, or choose a file."); return; }
    const html = textToHtml(text);
    const strat = mode === "entities" ? suggestEntityStrategy(html) : strategy;
    setStrategy(strat);
    if (applyParse(html, "Pasted text", strat) === 0) { setErr("Couldn't find any content in that text."); return; }
    setRawHtml(html);
    setFileName("Pasted text");
    setStage("preview");
  }

  function switchStrategy(strat: string) {
    setStrategy(strat);
    applyParse(rawHtml, fileName, strat);
  }

  const chosen = items.map((_, i) => keep[i]).filter(Boolean).length;

  // After chapters land, read the prose back and offer recurring names as cast.
  // Names already in the Collection are dropped so we never suggest a duplicate.
  function buildCast(bodies: string[]) {
    const have = new Set((existingTitles ?? []).map((t) => t.trim().toLowerCase()));
    const found = detectEntities(bodies.join("\n\n")).filter((d) => !have.has(d.name.toLowerCase()));
    if (found.length === 0) { setStage("done"); return; }
    setCast(found.map((d) => ({ name: d.name, count: d.count, type: "Character", keep: true })));
    setStage("cast");
  }

  async function runImport() {
    setStage("importing");
    const picked = items.map((it, i) => ({ it, type: types[i] })).filter((_, i) => keep[i]);
    setProgress({ done: 0, total: picked.length });
    try {
      let order = startOrder;
      const bodies: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const { it, type } = picked[i];
        if (mode === "chapters") { await createChapter(worldId, it.title || "Untitled", order++, it.body); bodies.push(it.body); }
        else await createEntity(worldId, type || "Character", it.title, it.body);
        setProgress({ done: i + 1, total: picked.length });
      }
      onDone();
      if (mode === "chapters") buildCast(bodies);
      else setStage("done");
    } catch (x) { setErr(String(x)); setStage("preview"); }
  }

  const castChosen = cast.filter((c) => c.keep).length;

  async function addCast() {
    setCastBusy(true); setErr(null);
    try {
      for (const c of cast) {
        if (!c.keep) continue;
        await createEntity(worldId, c.type || "Character", c.name, "");
      }
      onDone();
      setStage("done");
    } catch (x) { setErr(String(x)); setCastBusy(false); }
  }

  return (
    <div className="overlay" onClick={stage === "importing" ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>
            Import {mode === "chapters" ? "manuscript" : "lore"}
          </h3>
          <span className="spacer" />
          {stage !== "importing" && <span onClick={onClose} style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name="close" size={16} /></span>}
        </div>

        {err && <p className="err">{err}</p>}

        {stage === "pick" && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              {mode === "chapters"
                ? "Bring your manuscript from Google Docs or Word. A “Chapter 1” / “Prologue” line starts a new chapter; the text beneath becomes the body. No such lines → one chapter."
                : "Each heading becomes an entity; text under it becomes its description. A heading named for a type (Characters, Places…) sets the type for the entries beneath it."}
            </p>
            <div className="seg" style={{ marginBottom: 12 }}>
              <span className={source === "file" ? "on" : ""} onClick={() => { setSource("file"); setErr(null); }}>Upload a file</span>
              <span className={source === "paste" ? "on" : ""} onClick={() => { setSource("paste"); setErr(null); }}>Paste text</span>
            </div>
            {source === "file" ? (
              <div>
                <button className="primary" onClick={() => fileRef.current?.click()}>Choose a .docx file</button>
                <input ref={fileRef} type="file" accept=".docx" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>In Google Docs: File → Download → Microsoft Word (.docx).</p>
              </div>
            ) : (
              <div>
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                  placeholder={mode === "chapters"
                    ? "Paste your manuscript here — select all in Docs or Word (⌘A / Ctrl-A) and paste.\n\nStart a chapter with a line like “Chapter 1” or “Prologue”."
                    : "Paste your notes here — one entity per line or per heading."}
                  style={{ width: "100%", minHeight: 200, resize: "vertical", fontFamily: "var(--serif)", fontSize: 14, lineHeight: 1.5, padding: 10 }} />
                <div className="row" style={{ borderBottom: "none", padding: 0, marginTop: 8, gap: 10 }}>
                  <button className="primary" disabled={!pasteText.trim()} onClick={onPaste}>Preview {mode === "chapters" ? "chapters" : "entities"}</button>
                  <span className="faint" style={{ fontSize: 12 }}>Nothing is saved until you confirm on the next step.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {stage === "preview" && (
          <div>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 6, gap: 10 }}>
              <span className="muted">{fileName} — found <b>{items.length}</b> {mode === "chapters" ? "chapters" : "entities"}, importing <b>{chosen}</b></span>
              <span className="spacer" />
              <span className="tab" onClick={() => setKeep(items.map(() => true))}>all</span>
              <span className="tab" onClick={() => setKeep(items.map(() => false))}>none</span>
            </div>
            {mode === "chapters" ? (
              <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 6 }}>
                <span className="faint" style={{ fontSize: 11 }}>Split by</span>
                <div className="seg" style={{ fontSize: 11 }}>
                  <span className={strategy === "smart" ? "on" : ""} onClick={() => switchStrategy("smart")}>Chapter titles</span>
                  <span className={strategy === "headings" ? "on" : ""} onClick={() => switchStrategy("headings")}>Every heading</span>
                </div>
                <span className="faint" style={{ fontSize: 11 }}>
                  {strategy === "smart" ? "cuts at “Chapter N”/“Prologue” — best when headings are used loosely" : "cuts at every Word heading — best for cleanly styled docs"}
                </span>
              </div>
            ) : (
              <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 6 }}>
                <span className="faint" style={{ fontSize: 11 }}>Entities from</span>
                <div className="seg" style={{ fontSize: 11 }}>
                  <span className={strategy === "list" ? "on" : ""} onClick={() => switchStrategy("list")}>List items</span>
                  <span className={strategy === "headings" ? "on" : ""} onClick={() => switchStrategy("headings")}>Headings</span>
                </div>
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 11 }}>set all to</span>
                <select className="sel" style={{ padding: "3px 8px", fontSize: 12 }} defaultValue=""
                  onChange={(e) => { if (e.target.value) setTypes(items.map(() => e.target.value)); }}>
                  <option value="">type…</option>
                  {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            <div className="card" style={{ maxHeight: "48vh", overflowY: "auto" }}>
              {items.map((it, i) => (
                <div className="row" key={i} style={{ alignItems: "flex-start", gap: 10 }}>
                  <input type="checkbox" checked={keep[i]} style={{ marginTop: 4, width: "auto" }}
                    onChange={(e) => setKeep((k) => k.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="title-serif">{it.title || <span className="muted">Untitled</span>}</div>
                    {it.body && <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.body.slice(0, 140)}</div>}
                  </div>
                  {mode === "entities" && (
                    <select className="sel" value={types[i]} style={{ padding: "3px 8px", fontSize: 12 }}
                      onChange={(e) => setTypes((t) => t.map((v, j) => (j === i ? e.target.value : v)))}>
                      {[...new Set([...CANONICAL_ENTITY_TYPES, types[i]])].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginTop: 12, gap: 10 }}>
              <button className="primary" disabled={chosen === 0} onClick={runImport}>Import {chosen} {mode === "chapters" ? "chapters" : "entities"}</button>
              <button onClick={() => setStage("pick")}>Choose another file</button>
            </div>
          </div>
        )}

        {stage === "importing" && (
          <div>
            <p className="muted">Importing {progress.done} / {progress.total}…</p>
            <div style={{ height: 8, background: "var(--inset)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "var(--bond)", transition: "width .2s" }} />
            </div>
          </div>
        )}

        {stage === "cast" && (
          <div>
            <p style={{ marginTop: 0 }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 16 }}>Your {progress.total} chapter{progress.total === 1 ? "" : "s"} are in.</span>{" "}
              <span className="muted">We noticed these recurring names in the prose — tick the ones that are real characters or places and we’ll add them to your world. Skip anything that isn’t.</span>
            </p>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 6, gap: 10 }}>
              <span className="muted">adding <b>{castChosen}</b> of {cast.length}</span>
              <span className="spacer" />
              <span className="tab" onClick={() => setCast((cs) => cs.map((c) => ({ ...c, keep: true })))}>all</span>
              <span className="tab" onClick={() => setCast((cs) => cs.map((c) => ({ ...c, keep: false })))}>none</span>
            </div>
            <div className="card" style={{ maxHeight: "44vh", overflowY: "auto" }}>
              {cast.map((c, i) => (
                <div className="row" key={c.name} style={{ alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={c.keep} style={{ width: "auto" }}
                    onChange={(e) => setCast((cs) => cs.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="title-serif">{c.name}</span>
                    <span className="faint" style={{ fontSize: 11, marginLeft: 8 }}>{c.count}×</span>
                  </div>
                  <select className="sel" value={c.type} style={{ padding: "3px 8px", fontSize: 12 }}
                    onChange={(e) => setCast((cs) => cs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                    {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginTop: 12, gap: 10 }}>
              <button className="primary" disabled={castChosen === 0 || castBusy} onClick={addCast}>{castBusy ? "Adding…" : `Add ${castChosen} to your world`}</button>
              <button disabled={castBusy} onClick={() => setStage("done")}>Skip — just the chapters</button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div>
            <p style={{ fontFamily: "var(--serif)", fontSize: 16, display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="done" size={16} style={{ color: "var(--bond)" }} /> Imported <b>{progress.total}</b> {mode === "chapters" ? "chapters" : "entities"}.</p>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
