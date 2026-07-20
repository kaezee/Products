import { useEffect, useMemo, useState } from "react";
import {
  getChapters, getEntities, createChapter, reorderChapters, updateChapterTitle, softDeleteChapter,
  getBands, createBand, updateBand, softDeleteBand, setChapterBand, setChapterDate,
} from "../lib/api";
import type { Chapter, Entity, Band } from "../lib/types";
import { parseStoryTime } from "../lib/time";
import { ChapterEditor } from "./ChapterEditor";
import { ImportDocx } from "./ImportDocx";
import type { Nav } from "../App";

// Arcs (a.k.a. season / book / volume) are one grouping shared with the Timeline.
// Here they're collapsible sections so a long manuscript folds down to its parts.
const ARC_TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];

export function Manuscript({ worldId, focusChapterId, go }: { worldId: string; focusChapterId?: string; go: (n: Nav) => void }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [openId, setOpenId] = useState<string | null>(focusChapterId ?? null);
  const [err, setErr] = useState<string | null>(null);

  // add + drag state
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  async function reload() {
    try {
      const [c, e, b] = await Promise.all([getChapters(worldId), getEntities(worldId), getBands(worldId)]);
      setChapters(c);
      setEntities(e);
      setBands(b.sort((x, y) => x.band_order - y.band_order));
    } catch (x) {
      setErr(String(x));
    }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  async function create() {
    const title = newTitle.trim();
    if (!title) return;
    const order = (chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1;
    try {
      const c = await createChapter(worldId, title, order);
      setAdding(false);
      setNewTitle("");
      setChapters((prev) => [...(prev ?? []), c]);
      setOpenId(c.id);
    } catch (x) {
      setErr(String(x));
    }
  }

  async function del(c: Chapter, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirm(`Delete chapter “${c.title}”? It's soft-deleted — recoverable from Settings → Trash.`)) return;
    try { await softDeleteChapter(c.id); setChapters((prev) => (prev ?? []).filter((x) => x.id !== c.id)); }
    catch (x) { setErr(String(x)); }
  }

  async function commitRename(id: string) {
    const title = renameDraft.trim();
    setRenameId(null);
    const cur = (chapters ?? []).find((c) => c.id === id);
    if (!title || title === cur?.title) return;
    setChapters((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, title } : c)));
    try { await updateChapterTitle(id, title); } catch (x) { setErr(String(x)); await reload(); }
  }

  // Drop reorders the manuscript AND adopts the arc of the chapter it lands on —
  // so dragging ch. 12 up into "Season 1" both moves it and files it there.
  async function drop(target: number) {
    const list = chapters ?? [];
    if (dragIndex === null || dragIndex === target) { setDragIndex(null); setOverIndex(null); return; }
    const adoptedBand = list[target]?.band_id ?? null;
    const movedId = list[dragIndex].id;
    const next = [...list];
    const [moved] = next.splice(dragIndex, 1);
    moved.band_id = adoptedBand;
    next.splice(target, 0, moved);
    // optimistic: renumber, adopt arc, paint immediately, then persist
    setChapters(next.map((c, i) => ({ ...c, manuscript_order: i + 1 })));
    setDragIndex(null);
    setOverIndex(null);
    try {
      await reorderChapters(next.map((c) => c.id));
      await setChapterBand(movedId, adoptedBand);
      await reload();
    } catch (x) { setErr(String(x)); await reload(); }
  }

  async function setDate(chapterId: string, raw: string) {
    const label = raw.trim() || null;
    const ref = label ? parseStoryTime(label) : null;
    const cur = (chapters ?? []).find((c) => c.id === chapterId);
    if (label === (cur?.story_time_label ?? null) && ref === (cur?.story_time_ref ?? null)) return;
    setChapters((prev) => (prev ?? []).map((c) => c.id === chapterId ? { ...c, story_time_label: label, story_time_ref: ref } : c));
    try { await setChapterDate(chapterId, ref, label); } catch (x) { setErr(String(x)); await reload(); }
  }
  async function assignArc(chapterId: string, bandId: string | null) {
    setChapters((prev) => (prev ?? []).map((c) => c.id === chapterId ? { ...c, band_id: bandId } : c));
    try { await setChapterBand(chapterId, bandId); } catch (x) { setErr(String(x)); await reload(); }
  }
  async function addArc() {
    const order = bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0;
    try { const b = await createBand(worldId, `Arc ${bands.length + 1}`, order); setBands((p) => [...p, b]); }
    catch (x) { setErr(String(x)); }
  }
  async function renameArc(b: Band, name: string) {
    setBands((prev) => prev.map((z) => z.id === b.id ? { ...z, name } : z));
    try { await updateBand(b.id, { name }); } catch (x) { setErr(String(x)); }
  }
  async function removeArc(b: Band) {
    if (!confirm(`Delete arc "${b.name}"? Its chapters stay in the manuscript, just no arc — nothing is lost.`)) return;
    try { await softDeleteBand(b.id); setBands((p) => p.filter((z) => z.id !== b.id)); } catch (x) { setErr(String(x)); }
  }
  const toggle = (id: string) => setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const gi = useMemo(() => new Map((chapters ?? []).map((c, i) => [c.id, i])), [chapters]);
  const tintOf = (b: Band) => b.color || ARC_TINTS[bands.indexOf(b) % ARC_TINTS.length];

  if (err) return <p className="err">{err}</p>;
  if (!chapters) return <p className="muted">Loading manuscript…</p>;

  const open = openId ? chapters.find((c) => c.id === openId) : null;
  if (open) {
    return (
      <ChapterEditor
        worldId={worldId}
        chapter={open}
        entities={entities}
        onBack={() => { setOpenId(null); void reload(); }}
        onOpenEntity={(id) => go({ scope: "library", entityId: id })}
      />
    );
  }

  const bandIds = new Set(bands.map((b) => b.id));
  const unsorted = chapters.filter((c) => !(c.band_id && bandIds.has(c.band_id)));

  // One chapter row (rendered inside a flat list or an arc section).
  const chapterRow = (c: Chapter) => {
    const i = gi.get(c.id)!;
    return (
      <div className="row click" key={c.id}
        onClick={() => setOpenId(c.id)}
        onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); if (overIndex !== i) setOverIndex(i); } }}
        onDrop={(e) => { e.preventDefault(); drop(i); }}
        style={{
          opacity: dragIndex === i ? 0.4 : 1,
          boxShadow: overIndex === i && dragIndex !== null && dragIndex !== i ? "inset 0 2px 0 var(--bond)" : undefined,
          background: overIndex === i && dragIndex !== null && dragIndex !== i ? "var(--bondBg)" : undefined,
        }}>
        <span className="draghandle" draggable title="Drag to reorder — drop onto another arc to move it there"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          style={{ cursor: "grab", color: "var(--faint)", padding: "0 6px 0 0", fontSize: 15, userSelect: "none" }}>⠿</span>
        <span className="muted" style={{ width: 30, fontVariantNumeric: "tabular-nums" }}>{String(c.manuscript_order).padStart(2, "0")}</span>
        {renameId === c.id ? (
          <input autoFocus value={renameDraft} style={{ flex: 1, fontFamily: "var(--serif)", fontSize: 15, padding: "4px 8px" }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRename(c.id); if (e.key === "Escape") setRenameId(null); }}
            onBlur={() => commitRename(c.id)} />
        ) : (
          <span className="title-serif" style={{ flex: 1 }}>{c.title}</span>
        )}
        <input key={"d" + c.id + (c.story_time_label ?? "") + (c.story_time_ref ?? "")}
          className="tl-pick" defaultValue={c.story_time_label ?? (c.story_time_ref != null ? String(c.story_time_ref) : "")}
          placeholder="🕐 date" title="In-world date (e.g. 1150 AE) — sets this chapter's place in chronological order"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => setDate(c.id, e.target.value)}
          style={{ width: 82, fontSize: 11, color: "var(--sub)" }} />
        {bands.length > 0 && (
          <select className="tl-pick" value={c.band_id && bandIds.has(c.band_id) ? c.band_id : ""}
            title="Which arc this chapter belongs to"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => assignArc(c.id, e.target.value || null)}
            style={{ fontSize: 11, maxWidth: 120 }}>
            <option value="">no arc</option>
            {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <span className="faint">{c.body.trim() ? `${c.body.trim().split(/\s+/).length} words` : "empty"}</span>
        <span className="rowact" title="Rename chapter"
          onClick={(e) => { e.stopPropagation(); setRenameId(c.id); setRenameDraft(c.title); }}
          style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: "0 2px" }}>✎</span>
        <span className="rowact" title="Delete chapter"
          onClick={(e) => del(c, e)}
          style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13, padding: "0 2px" }}>✕</span>
      </div>
    );
  };

  // An arc's collapsible header: chevron, tinted name (editable), chapter count.
  const arcHeader = (b: Band, count: number) => {
    const tint = tintOf(b);
    const isCollapsed = collapsed.has(b.id);
    return (
      <div className="row" style={{ background: tint + "14", borderBottom: `1px solid ${tint}33`, gap: 8 }}>
        <span onClick={() => toggle(b.id)} style={{ cursor: "pointer", color: tint, width: 12, fontSize: 12 }}>{isCollapsed ? "▸" : "▾"}</span>
        <span className="dot" style={{ background: tint }} />
        <input value={b.name} onChange={(e) => renameArc(b, e.target.value)}
          style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 600, color: tint, border: "none", background: "transparent", padding: 0, width: 220 }} />
        <span className="faint" style={{ fontSize: 11.5 }}>{count} chapter{count === 1 ? "" : "s"}{isCollapsed ? " · click ▸ to open" : ""}</span>
        <span className="spacer" />
        <span className="rowact" title="Delete arc" onClick={() => removeArc(b)}
          style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13, padding: "0 2px" }}>✕</span>
      </div>
    );
  };

  const hasArcs = bands.length > 0;

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <h2 className="scope-title">Manuscript</h2>
        <span className="spacer" />
        <button onClick={addArc}>+ Arc</button>
        <button onClick={() => setImporting(true)}>Import .docx</button>
        {!adding && <button onClick={() => { setAdding(true); setNewTitle(""); }}>+ New chapter</button>}
      </div>

      {importing && (
        <ImportDocx
          worldId={worldId}
          mode="chapters"
          startOrder={(chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1}
          onClose={() => setImporting(false)}
          onDone={() => reload()}
        />
      )}

      {adding && (
        <div className="card" style={{ marginBottom: 12, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newTitle} placeholder="Chapter title" style={{ width: 280 }}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} />
          <button className="primary" onClick={create}>Add</button>
          <button onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {chapters.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">No chapters yet. Create one to start drafting.</span></div></div>
      ) : !hasArcs ? (
        // no arcs yet — the original flat list
        <div className="card">{chapters.map(chapterRow)}</div>
      ) : (
        <>
          {bands.map((b) => {
            const chs = chapters.filter((c) => c.band_id === b.id);
            return (
              <div className="card" key={b.id} style={{ marginBottom: 10, overflow: "hidden" }}>
                {arcHeader(b, chs.length)}
                {!collapsed.has(b.id) && (
                  chs.length === 0
                    ? <div className="row"><span className="muted" style={{ fontSize: 12.5 }}>No chapters in this arc yet — set a chapter's arc on the right, or drag one here.</span></div>
                    : chs.map(chapterRow)
                )}
              </div>
            );
          })}
          {unsorted.length > 0 && (
            <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
              <div className="row" style={{ background: "var(--inset)", gap: 8 }}>
                <span className="dot" style={{ background: "var(--faint)" }} />
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>No arc</span>
                <span className="faint" style={{ fontSize: 11.5 }}>{unsorted.length} chapter{unsorted.length === 1 ? "" : "s"} not filed into an arc yet</span>
              </div>
              {unsorted.map(chapterRow)}
            </div>
          )}
        </>
      )}
      {chapters.length > 1 && <p className="muted" style={{ marginTop: 8 }}>Drag the ⠿ handle to reorder — drop a chapter onto another arc's section to move it there.</p>}
    </div>
  );
}
