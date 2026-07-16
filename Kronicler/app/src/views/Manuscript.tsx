import { useEffect, useState } from "react";
import { getChapters, getEntities, createChapter, reorderChapters } from "../lib/api";
import type { Chapter, Entity } from "../lib/types";
import { ChapterEditor } from "./ChapterEditor";

export function Manuscript({ worldId, focusChapterId }: { worldId: string; focusChapterId?: string }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [openId, setOpenId] = useState<string | null>(focusChapterId ?? null);
  const [err, setErr] = useState<string | null>(null);

  // add + drag state
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  async function reload() {
    try {
      const [c, e] = await Promise.all([getChapters(worldId), getEntities(worldId)]);
      setChapters(c);
      setEntities(e);
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

  async function drop(target: number) {
    const list = chapters ?? [];
    if (dragIndex === null || dragIndex === target) { setDragIndex(null); setOverIndex(null); return; }
    const next = [...list];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    // optimistic: renumber and paint immediately, then persist
    setChapters(next.map((c, i) => ({ ...c, manuscript_order: i + 1 })));
    setDragIndex(null);
    setOverIndex(null);
    try { await reorderChapters(next.map((c) => c.id)); await reload(); }
    catch (x) { setErr(String(x)); await reload(); }
  }

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
      />
    );
  }

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <h2 className="scope-title">Manuscript</h2>
        <span className="spacer" />
        {!adding && <button onClick={() => { setAdding(true); setNewTitle(""); }}>+ New chapter</button>}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 12, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newTitle} placeholder="Chapter title" style={{ width: 280 }}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} />
          <button className="primary" onClick={create}>Add</button>
          <button onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      <div className="card">
        {chapters.length === 0 && (
          <div className="row"><span className="muted">No chapters yet. Create one to start drafting.</span></div>
        )}
        {chapters.map((c, i) => (
          <div className="row click" key={c.id}
            onClick={() => setOpenId(c.id)}
            onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); if (overIndex !== i) setOverIndex(i); } }}
            onDrop={(e) => { e.preventDefault(); drop(i); }}
            style={{
              opacity: dragIndex === i ? 0.4 : 1,
              boxShadow: overIndex === i && dragIndex !== null && dragIndex !== i ? "inset 0 2px 0 var(--bond)" : undefined,
              background: overIndex === i && dragIndex !== null && dragIndex !== i ? "var(--bondBg)" : undefined,
            }}>
            <span className="draghandle" draggable title="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
              style={{ cursor: "grab", color: "var(--faint)", padding: "0 6px 0 0", fontSize: 15, userSelect: "none" }}>⠿</span>
            <span className="muted" style={{ width: 44 }}>ch. {c.manuscript_order}</span>
            <span className="title-serif" style={{ flex: 1 }}>{c.title}</span>
            <span className="faint">{c.body.trim() ? `${c.body.trim().split(/\s+/).length} words` : "empty"}</span>
          </div>
        ))}
      </div>
      {chapters.length > 1 && <p className="muted" style={{ marginTop: 8 }}>Drag the ⠿ handle to reorder chapters.</p>}
    </div>
  );
}
