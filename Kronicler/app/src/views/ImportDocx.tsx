import { useRef, useState } from "react";
import { createChapter, createEntity } from "../lib/api";
import { parseDocxHtml, suggestEntityStrategy, type ParsedItem } from "../lib/docimport";
import { CANONICAL_ENTITY_TYPES } from "../lib/entityTypes";

// Bulk-import a .docx: a manuscript into chapters, or a lore doc into entities.
// Split by Word heading styles (Heading 1/2/3). A preview + per-item selection
// step comes before anything is written, so a bad parse never touches the DB.
export function ImportDocx({ worldId, mode, startOrder, onClose, onDone }: {
  worldId: string;
  mode: "chapters" | "entities";
  startOrder: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"pick" | "preview" | "importing" | "done">("pick");
  const [fileName, setFileName] = useState("");
  const [rawHtml, setRawHtml] = useState("");
  const [strategy, setStrategy] = useState<string>(mode === "chapters" ? "smart" : "headings");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [types, setTypes] = useState<string[]>([]); // parallel to items (entities)
  const [keep, setKeep] = useState<boolean[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
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

  function switchStrategy(strat: string) {
    setStrategy(strat);
    applyParse(rawHtml, fileName, strat);
  }

  const chosen = items.map((_, i) => keep[i]).filter(Boolean).length;

  async function runImport() {
    setStage("importing");
    const picked = items.map((it, i) => ({ it, type: types[i] })).filter((_, i) => keep[i]);
    setProgress({ done: 0, total: picked.length });
    try {
      let order = startOrder;
      for (let i = 0; i < picked.length; i++) {
        const { it, type } = picked[i];
        if (mode === "chapters") await createChapter(worldId, it.title || "Untitled", order++, it.body);
        else await createEntity(worldId, type || "Character", it.title, it.body);
        setProgress({ done: i + 1, total: picked.length });
      }
      setStage("done");
      onDone();
    } catch (x) { setErr(String(x)); setStage("preview"); }
  }

  return (
    <div className="overlay" onClick={stage === "importing" ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>
            Import {mode === "chapters" ? "manuscript" : "lore"} · .docx
          </h3>
          <span className="spacer" />
          {stage !== "importing" && <span onClick={onClose} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>✕</span>}
        </div>

        {err && <p className="err">{err}</p>}

        {stage === "pick" && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              {mode === "chapters"
                ? "Each Word heading (Heading 1/2/3) becomes a chapter; the text under it becomes the body. No headings → one chapter."
                : "Each heading becomes an entity; text under it becomes its description. A heading named for a type (Characters, Places…) sets the type for the entries beneath it."}
            </p>
            <button className="primary" onClick={() => fileRef.current?.click()}>Choose a .docx file</button>
            <input ref={fileRef} type="file" accept=".docx" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
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

        {stage === "done" && (
          <div>
            <p style={{ fontFamily: "var(--serif)", fontSize: 16 }}>Imported <b>{progress.total}</b> {mode === "chapters" ? "chapters" : "entities"}. 🎉</p>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
