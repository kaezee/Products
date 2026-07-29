import { useEffect, useMemo, useState } from "react";
import {
  getChapters, getEntities, createChapter, reorderChapters, updateChapterTitle, softDeleteChapter,
  getSegments, createSegment, updateSegment, softDeleteSegment, setChapterSegment, setChaptersSegment,
  getSegmentKinds, setChapterDate,
} from "../lib/api";
import type { Chapter, Entity, Segment, SegmentKind } from "../lib/types";
import { parseStoryTime } from "../lib/time";
import { buildKindSwatches } from "../lib/segmentKinds";
import { ChapterEditor } from "./ChapterEditor";
import { ImportDocx } from "./ImportDocx";
import type { Nav, LeafCrumb } from "../App";
import { Icon } from "../components/icons";
import { SwatchPicker } from "../components/SwatchPicker";
import { confirmDialog } from "../components/confirm";
import { SkeletonRows } from "../components/Skeleton";

// Segments are the one grouping shared with the Timeline — Series › Book ›
// Season › Volume, nested to any depth. Here each is a collapsible section so a
// long manuscript folds to its parts, and chapters can be filed into them.
export function Manuscript({ worldId, focusChapterId, go, onLeaf }: { worldId: string; focusChapterId?: string; go: (n: Nav) => void; onLeaf?: (l: LeafCrumb | null) => void }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [kinds, setKinds] = useState<SegmentKind[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [openId, setOpenId] = useState<string | null>(focusChapterId ?? null);
  const [err, setErr] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload() {
    try {
      const [c, e, s, k] = await Promise.all([
        getChapters(worldId), getEntities(worldId), getSegments(worldId), getSegmentKinds(worldId),
      ]);
      setChapters(c); setEntities(e);
      setSegments(s.sort((a, b) => a.seg_order - b.seg_order));
      setKinds(k);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  // Report the open chapter up to the breadcrumb (and clear it on unmount).
  useEffect(() => {
    const oc = openId && chapters ? chapters.find((c) => c.id === openId) : null;
    onLeaf?.(oc ? { label: `Ch. ${oc.manuscript_order} · ${oc.title}`, onClear: () => { setOpenId(null); void reload(); } } : null);
    // eslint-disable-next-line
  }, [openId, chapters]);
  useEffect(() => () => onLeaf?.(null), []); // eslint-disable-line

  const kindSwatch = useMemo(() => buildKindSwatches(kinds, segments.map((s) => s.kind)), [kinds, segments]);
  const swatchOf = (s: Segment) => s.color ?? kindSwatch.get(s.kind.toLowerCase()) ?? "slate";
  const kindNames = useMemo(() => {
    const names = [...new Set([...kinds.map((k) => k.name), ...segments.map((s) => s.kind)])];
    return names.sort();
  }, [kinds, segments]);

  async function create() {
    const title = newTitle.trim();
    if (!title) return;
    const order = (chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1;
    try {
      const c = await createChapter(worldId, title, order);
      setAdding(false); setNewTitle("");
      setChapters((prev) => [...(prev ?? []), c]);
      setOpenId(c.id);
    } catch (x) { setErr(String(x)); }
  }

  async function del(c: Chapter, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!(await confirmDialog({ title: "Delete chapter", message: `Delete chapter “${c.title}”? It's soft-deleted — recoverable from Settings → Trash.`, confirmLabel: "Delete", tone: "danger" }))) return;
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

  // Drop reorders the manuscript AND adopts the segment of the chapter it lands
  // on — dragging a chapter into a season both moves and files it.
  async function drop(target: number) {
    const list = chapters ?? [];
    if (dragIndex === null || dragIndex === target) { setDragIndex(null); setOverIndex(null); return; }
    const adopted = list[target]?.segment_id ?? null;
    const movedId = list[dragIndex].id;
    const next = [...list];
    const [moved] = next.splice(dragIndex, 1);
    moved.segment_id = adopted;
    next.splice(target, 0, moved);
    setChapters(next.map((c, i) => ({ ...c, manuscript_order: i + 1 })));
    setDragIndex(null); setOverIndex(null);
    try {
      await reorderChapters(next.map((c) => c.id));
      await setChapterSegment(movedId, adopted);
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

  // ── segments ──────────────────────────────────────────────────────────
  async function addSegment(parentId: string | null) {
    const siblings = segments.filter((s) => s.parent_id === parentId);
    const order = siblings.length ? Math.max(...siblings.map((s) => s.seg_order)) + 1 : 0;
    const kind = parentId ? "season" : "series";
    const name = parentId ? `New ${kind}` : `New series`;
    try {
      const s = await createSegment(worldId, { parent_id: parentId, kind, name, seg_order: order });
      setSegments((p) => [...p, s]);
      if (parentId) setCollapsed((c) => { const n = new Set(c); n.delete(parentId); return n; });
    } catch (x) { setErr(String(x)); }
  }
  async function renameSegment(s: Segment, name: string) {
    setSegments((prev) => prev.map((z) => z.id === s.id ? { ...z, name } : z));
    try { await updateSegment(s.id, { name }); } catch (x) { setErr(String(x)); }
  }
  async function setSegKind(s: Segment, kind: string) {
    setSegments((prev) => prev.map((z) => z.id === s.id ? { ...z, kind } : z));
    try { await updateSegment(s.id, { kind }); } catch (x) { setErr(String(x)); }
  }
  async function setSegColor(s: Segment, color: string | null) {
    setSegments((prev) => prev.map((z) => z.id === s.id ? { ...z, color } : z));
    try { await updateSegment(s.id, { color }); } catch (x) { setErr(String(x)); }
  }
  async function removeSegment(s: Segment) {
    const kids = segments.filter((z) => z.parent_id === s.id);
    const msg = kids.length
      ? `Delete “${s.name}” and un-nest its ${kids.length} sub-segment(s)? Chapters stay in the manuscript.`
      : `Delete “${s.name}”? Its chapters stay in the manuscript, just unfiled — nothing is lost.`;
    if (!(await confirmDialog({ title: "Delete segment", message: msg, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await softDeleteSegment(s.id);
      setSegments((p) => p.filter((z) => z.id !== s.id));
      await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function moveSelectedTo(segId: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setChapters((prev) => (prev ?? []).map((c) => selected.has(c.id) ? { ...c, segment_id: segId } : c));
    setSelected(new Set());
    try { await setChaptersSegment(ids, segId); } catch (x) { setErr(String(x)); await reload(); }
  }

  const toggle = (id: string) => setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSel = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const gi = useMemo(() => new Map((chapters ?? []).map((c, i) => [c.id, i])), [chapters]);

  if (err) return <p className="err">{err}</p>;
  if (!chapters) return <SkeletonRows rows={6} />;

  const open = openId ? chapters.find((c) => c.id === openId) : null;
  if (open) {
    return (
      <ChapterEditor
        worldId={worldId} chapter={open} entities={entities}
        onBack={() => { setOpenId(null); void reload(); }}
        onOpenEntity={(id) => go({ scope: "library", entityId: id })}
      />
    );
  }

  const segIds = new Set(segments.map((s) => s.id));
  const chaptersOf = (segId: string) => chapters.filter((c) => c.segment_id === segId);
  const unfiled = chapters.filter((c) => !(c.segment_id && segIds.has(c.segment_id)));
  const roots = segments.filter((s) => !s.parent_id || !segIds.has(s.parent_id));
  const childrenOf = (id: string) => segments.filter((s) => s.parent_id === id);

  // Depth-first flatten for the move picker (indented option labels).
  const flat: { s: Segment; depth: number }[] = [];
  const walk = (list: Segment[], depth: number) => {
    for (const s of list) { flat.push({ s, depth }); walk(childrenOf(s.id), depth + 1); }
  };
  walk(roots, 0);

  const chapterRow = (c: Chapter) => {
    const i = gi.get(c.id)!;
    const sel = selected.has(c.id);
    return (
      <div className="row click" key={c.id}
        onClick={() => setOpenId(c.id)}
        onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); if (overIndex !== i) setOverIndex(i); } }}
        onDrop={(e) => { e.preventDefault(); drop(i); }}
        style={{
          opacity: dragIndex === i ? 0.4 : 1,
          boxShadow: overIndex === i && dragIndex !== null && dragIndex !== i ? "inset 0 2px 0 var(--bond)" : undefined,
          background: sel ? "var(--bondBg)" : overIndex === i && dragIndex !== null && dragIndex !== i ? "var(--bondBg)" : undefined,
        }}>
        <input type="checkbox" checked={sel} title="Select to move into a segment"
          onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(c.id)}
          style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--bond)" }} />
        <span className="draghandle" draggable title="Drag to reorder — drop onto another segment to move it there"
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          style={{ cursor: "grab", color: "var(--faint)", padding: "0 4px 0 0", userSelect: "none", display: "inline-flex" }}><Icon name="grip" size={14} /></span>
        <span className="muted" style={{ width: 26, fontVariantNumeric: "tabular-nums" }}>{String(c.manuscript_order).padStart(2, "0")}</span>
        {renameId === c.id ? (
          <input autoFocus value={renameDraft} style={{ flex: 1, fontFamily: "var(--serif)", fontSize: 15, padding: "4px 8px" }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRename(c.id); if (e.key === "Escape") setRenameId(null); }}
            onBlur={() => commitRename(c.id)} />
        ) : (
          <span className="title-serif" style={{ flex: 1 }}>
            {c.title}
            {c.planned && <span className="chip" style={{ marginLeft: 8, fontSize: 10, padding: "2px 7px", borderColor: "var(--bondLine)", color: "var(--bond)" }} title="A planned beat — not written yet."><Icon name="edit" size={11} /> planned</span>}
          </span>
        )}
        <input key={"d" + c.id + (c.story_time_label ?? "") + (c.story_time_ref ?? "")}
          className="tl-pick" defaultValue={c.story_time_label ?? (c.story_time_ref != null ? String(c.story_time_ref) : "")}
          placeholder="in-world date" title="In-world date (e.g. 1150 AE) — sets this chapter's place on the timeline"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
          onBlur={(e) => setDate(c.id, e.target.value)}
          style={{ width: 82, fontSize: 11, color: "var(--sub)" }} />
        <span className="faint">{c.body.trim() ? `${c.body.trim().split(/\s+/).length} words` : "empty"}</span>
        <span className="rowact" title="Rename chapter"
          onClick={(e) => { e.stopPropagation(); setRenameId(c.id); setRenameDraft(c.title); }}
          style={{ cursor: "pointer", color: "var(--muted)", padding: "0 2px", display: "inline-flex" }}><Icon name="edit" size={13} /></span>
        <span className="rowact" title="Delete chapter" onClick={(e) => del(c, e)}
          style={{ cursor: "pointer", color: "var(--faint)", padding: "0 2px", display: "inline-flex" }}><Icon name="close" size={13} /></span>
      </div>
    );
  };

  // A segment and its subtree, rendered as nested collapsible groups.
  const renderSegment = (s: Segment, depth: number): React.ReactNode => {
    const sw = swatchOf(s);
    const color = `var(--k-entity-${sw})`;
    const tint = `var(--k-entity-${sw}-tint)`;
    const isCollapsed = collapsed.has(s.id);
    const chs = chaptersOf(s.id);
    const kids = childrenOf(s.id);
    const total = chs.length + kids.reduce((n, k) => n + chaptersOf(k.id).length, 0);
    return (
      <div key={s.id} style={{ marginLeft: depth * 16 }}>
        <div className="row" style={{ background: tint, borderBottom: `1px solid ${color}`, gap: 8, borderRadius: depth ? 8 : 0, marginTop: depth ? 6 : 0 }}>
          <span onClick={() => toggle(s.id)} style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name={isCollapsed ? "chevron" : "chevron-down"} size={15} /></span>
          <SwatchPicker value={sw} onPick={(c) => setSegColor(s, c)} title="Segment colour — pick or Auto" />
          <input value={s.name} onChange={(e) => renameSegment(s, e.target.value)}
            style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 600, color, border: "none", background: "transparent", padding: 0, minWidth: 80, width: 200 }} />
          <select value={s.kind} onChange={(e) => setSegKind(s, e.target.value)} title="Kind of segment"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, padding: "2px 6px", color, background: "transparent", border: `1px solid ${color}`, borderRadius: 6 }}>
            {kindNames.map((k) => <option key={k} value={k} style={{ color: "var(--ink)" }}>{k}</option>)}
          </select>
          <span className="faint" style={{ fontSize: 11.5 }}>{total} chapter{total === 1 ? "" : "s"}{isCollapsed && total ? " · collapsed" : ""}</span>
          <span className="spacer" />
          <span className="rowact" title="Add a sub-segment (e.g. a season inside this series)" onClick={() => addSegment(s.id)}
            style={{ cursor: "pointer", color, fontSize: 12, padding: "0 4px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}><Icon name="plus" size={12} /> sub</span>
          <span className="rowact" title="Delete segment" onClick={() => removeSegment(s)}
            style={{ cursor: "pointer", color: "var(--faint)", padding: "0 2px", display: "inline-flex" }}><Icon name="close" size={13} /></span>
        </div>
        {!isCollapsed && (
          <>
            {chs.length === 0 && kids.length === 0 && (
              <div className="row"><span className="muted" style={{ fontSize: 12.5 }}>Empty — tick chapters below and “Move to {s.name}”, or drag one here.</span></div>
            )}
            {chs.map(chapterRow)}
            {kids.map((k) => renderSegment(k, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const hasSegments = segments.length > 0;

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <h2 className="scope-title">Manuscript</h2>
        <span className="spacer" />
        <button onClick={() => addSegment(null)} title="Add a top-level grouping (series, book, season…)">+ Segment</button>
        <button onClick={() => setImporting(true)}>Import .docx</button>
        {!adding && <button onClick={() => { setAdding(true); setNewTitle(""); }}>+ New chapter</button>}
      </div>

      {importing && (
        <ImportDocx worldId={worldId} mode="chapters"
          startOrder={(chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1}
          onClose={() => setImporting(false)} onDone={() => reload()} />
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

      {/* multi-select move bar */}
      {selected.size > 0 && (
        <div className="card" style={{ marginBottom: 10, padding: "8px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 3, borderColor: "var(--bond)" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{selected.size} selected</span>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>Move to</span>
          <select className="sel" value="" onChange={(e) => { const v = e.target.value; if (v) moveSelectedTo(v === "__unfile__" ? null : v); }}
            style={{ fontSize: 12, maxWidth: 240 }}>
            <option value="" disabled>Choose a segment…</option>
            {flat.map(({ s, depth }) => <option key={s.id} value={s.id}>{`${"  ".repeat(depth)}${s.name} · ${s.kind}`}</option>)}
            <option value="__unfile__">— Unfiled —</option>
          </select>
          <button onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {chapters.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">No chapters yet. Create one to start drafting.</span></div></div>
      ) : !hasSegments ? (
        <>
          <div className="card">{chapters.map(chapterRow)}</div>
          <p className="muted" style={{ marginTop: 8 }}>Tip: hit “+ Segment” to group chapters into a series, book, or season — then tick chapters and move them in.</p>
        </>
      ) : (
        <>
          {roots.map((s) => (
            <div className="card" key={s.id} style={{ marginBottom: 10, overflow: "hidden" }}>{renderSegment(s, 0)}</div>
          ))}
          {unfiled.length > 0 && (
            <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
              <div className="row" style={{ background: "var(--inset)", gap: 8 }}>
                <span className="dot" style={{ background: "var(--faint)" }} />
                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Unfiled</span>
                <span className="faint" style={{ fontSize: 11.5 }}>{unfiled.length} chapter{unfiled.length === 1 ? "" : "s"} not in a segment yet</span>
              </div>
              {unfiled.map(chapterRow)}
            </div>
          )}
          {chapters.length > 1 && <p className="muted" style={{ marginTop: 8 }}>Tick chapters and use the bar to move them, or drag the grip handle to reorder / drop into a segment.</p>}
        </>
      )}
    </div>
  );
}
