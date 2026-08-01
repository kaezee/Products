import { useEffect, useMemo, useRef, useState } from "react";
import {
  getChapters, getEntities, createChapter, reorderChapters, updateChapterTitle, softDeleteChapter,
  getSegments, createSegment, updateSegment, softDeleteSegment, setChapterSegment,
  getSegmentKinds,
} from "../lib/api";
import type { Chapter, Entity, Segment, SegmentKind } from "../lib/types";
import { buildKindSwatches } from "../lib/segmentKinds";
import { BookCanvas } from "./BookCanvas";
import { ImportDocx } from "./ImportDocx";
import type { Nav, LeafCrumb } from "../App";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import { SkeletonRows } from "../components/Skeleton";

// Write (§3): a persistent structure tree on the left, the editor on the right.
// Clicking any tree node opens it in place — the writer never leaves the editor
// to switch chapters. Segments are containers (Book / Part…), chapters are the
// leaf prose nodes; hierarchy is by nesting only — drag a chapter under a
// segment to file it. The tree is the same segments the Timeline draws.
export function Manuscript({ worldId, focusChapterId, openImport, go, onLeaf }: { worldId: string; focusChapterId?: string; openImport?: boolean; go: (n: Nav) => void; onLeaf?: (l: LeafCrumb | null) => void }) {
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
  const [renameSegId, setRenameSegId] = useState<string | null>(null);
  const [segDraft, setSegDraft] = useState("");
  const [importing, setImporting] = useState(!!openImport);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  // Fullscreen writing — hides the Kronicler app shell but KEEPS the Write
  // workspace (tree + editor + panels), so navigation survives.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [focused]);
  useEffect(() => {
    if (!overflowOpen) return;
    const h = (e: MouseEvent) => { if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [overflowOpen]);

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
    try { await softDeleteChapter(c.id); setChapters((prev) => (prev ?? []).filter((x) => x.id !== c.id)); if (openId === c.id) setOpenId(null); }
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
  // on — dragging a chapter onto another both moves and files it.
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

  // Drop a dragged chapter onto a segment node → file it there (null = unfile).
  // Assignment is by nesting/drag only — no per-row dropdowns (§3).
  async function fileInto(segId: string | null) {
    if (dragIndex === null) return;
    const c = (chapters ?? [])[dragIndex];
    if (!c) { setDragIndex(null); setOverIndex(null); return; }
    const id = c.id;
    setChapters((prev) => (prev ?? []).map((x) => (x.id === id ? { ...x, segment_id: segId } : x)));
    setDragIndex(null); setOverIndex(null);
    try { await setChapterSegment(id, segId); await reload(); } catch (x) { setErr(String(x)); await reload(); }
  }

  // ── segments ──────────────────────────────────────────────────────────
  async function addSegment(parentId: string | null) {
    const siblings = segments.filter((s) => s.parent_id === parentId);
    const order = siblings.length ? Math.max(...siblings.map((s) => s.seg_order)) + 1 : 0;
    const kind = parentId ? "part" : "book";
    const name = parentId ? "New part" : "New book";
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
  const toggle = (id: string) => setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const gi = useMemo(() => new Map((chapters ?? []).map((c, i) => [c.id, i])), [chapters]);

  if (err) return <p className="err">{err}</p>;
  if (!chapters) return <SkeletonRows rows={6} />;

  const open = openId ? chapters.find((c) => c.id === openId) : null;

  const segIds = new Set(segments.map((s) => s.id));
  const chaptersOf = (segId: string) => chapters.filter((c) => c.segment_id === segId);
  const unfiled = chapters.filter((c) => !(c.segment_id && segIds.has(c.segment_id)));
  const roots = segments.filter((s) => !s.parent_id || !segIds.has(s.parent_id));
  const childrenOf = (id: string) => segments.filter((s) => s.parent_id === id);

  // The top-level book a chapter sits under (walk to the root segment); powers
  // the Book scope in the Write panels. Unfiled chapters share the "unfiled" book.
  const segById = new Map(segments.map((s) => [s.id, s]));
  const rootOf = (segId: string | null): string => {
    let id = segId && segIds.has(segId) ? segId : null;
    while (id) { const s = segById.get(id); if (!s || !s.parent_id || !segIds.has(s.parent_id)) break; id = s.parent_id; }
    return id ?? "unfiled";
  };
  const openRoot = open ? rootOf(open.segment_id) : null;
  const bookIds = new Set(open && openRoot ? chapters.filter((c) => rootOf(c.segment_id) === openRoot).map((c) => c.id) : []);

  // A chapter as a leaf node. Click opens it in place; drag to reorder (drop on
  // another chapter) or to file it (drop on a segment).
  const chNode = (c: Chapter, depth: number) => {
    const i = gi.get(c.id)!;
    return (
      <div className={"wt-ch" + (openId === c.id ? " on" : "")} key={c.id}
        draggable
        onClick={() => setOpenId(c.id)}
        onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
        onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); if (overIndex !== i) setOverIndex(i); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void drop(i); }}
        style={{ paddingLeft: 8 + depth * 14, boxShadow: overIndex === i && dragIndex !== null && dragIndex !== i ? "inset 0 2px 0 var(--bond)" : undefined, opacity: dragIndex === i ? 0.4 : undefined }}>
        <Icon name="grip" size={12} />
        {renameId === c.id ? (
          <input autoFocus value={renameDraft} className="wt-rename" onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRename(c.id); if (e.key === "Escape") setRenameId(null); }}
            onBlur={() => commitRename(c.id)} />
        ) : (
          <span className="wt-ch-title" onDoubleClick={(e) => { e.stopPropagation(); setRenameId(c.id); setRenameDraft(c.title); }}>{c.title}</span>
        )}
        {c.planned && <span className="wt-plan" title="Planned — not written yet">planned</span>}
        <span className="wt-act" title="Delete chapter" onClick={(e) => del(c, e)}><Icon name="close" size={12} /></span>
      </div>
    );
  };

  // A segment (container) node + its subtree. Drop a chapter on it to file it.
  const segNode = (s: Segment, depth: number) => {
    const color = `var(--k-entity-${swatchOf(s)})`;
    const isCol = collapsed.has(s.id);
    const chs = chaptersOf(s.id);
    const kids = childrenOf(s.id);
    const total = chs.length + kids.reduce((n, k) => n + chaptersOf(k.id).length, 0);
    return (
      <div key={s.id}>
        <div className="wt-seg" style={{ paddingLeft: 6 + depth * 14, borderLeft: `2px solid ${color}` }}
          onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
          onDrop={(e) => { if (dragIndex !== null) { e.preventDefault(); e.stopPropagation(); void fileInto(s.id); } }}>
          <span className="wt-chev" onClick={() => toggle(s.id)}><Icon name={isCol ? "chevron" : "chevron-down"} size={13} /></span>
          {renameSegId === s.id ? (
            <input autoFocus value={segDraft} className="wt-rename" onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSegDraft(e.target.value)}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") { if (e.key === "Enter") renameSegment(s, segDraft.trim() || s.name); setRenameSegId(null); } }}
              onBlur={() => { renameSegment(s, segDraft.trim() || s.name); setRenameSegId(null); }} />
          ) : (
            <span className="wt-seg-name" style={{ color }} onDoubleClick={() => { setRenameSegId(s.id); setSegDraft(s.name); }}>{s.name}</span>
          )}
          <span className="wt-seg-kind">{s.kind}</span>
          <span className="wt-seg-count">{total}</span>
          <span className="spacer" />
          <span className="wt-act" title="Add a sub-segment" onClick={() => addSegment(s.id)}><Icon name="plus" size={12} /></span>
          <span className="wt-act" title="Delete segment" onClick={() => removeSegment(s)}><Icon name="close" size={12} /></span>
        </div>
        {!isCol && (
          <>
            {chs.map((c) => chNode(c, depth + 1))}
            {kids.map((k) => segNode(k, depth + 1))}
            {chs.length === 0 && kids.length === 0 && <div className="wt-empty" style={{ paddingLeft: 24 + depth * 14 }}>Drag a chapter here</div>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={"fi write-shell" + (focused ? " focus" : "")}>
      <aside className="write-tree">
        <div className="write-tree-head">
          <h2 className="scope-title" style={{ fontSize: 18, margin: 0 }}>Write</h2>
        </div>
        <div className="write-tree-actions">
          <button onClick={() => { setAdding(true); setNewTitle(""); }}>+ Chapter</button>
          <button onClick={() => addSegment(null)} title="Add a top-level book / part">+ Book</button>
          {chapters.length === 0 ? (
            // Empty world: Import is the migrating writer's first action (§3.1).
            <button className="primary" onClick={() => setImporting(true)}
              title="Bring in a manuscript — upload a .docx or paste">Import</button>
          ) : (
            <div className="write-overflow" ref={overflowRef}>
              <button className="write-overflow-btn" title="More" aria-haspopup="menu" aria-expanded={overflowOpen}
                onClick={() => setOverflowOpen((v) => !v)}>···</button>
              {overflowOpen && (
                <div className="write-overflow-menu" role="menu">
                  <button role="menuitem" onClick={() => { setOverflowOpen(false); setImporting(true); }}>
                    <Icon name="arrow" size={13} /> Import a manuscript
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {adding && (
          <div className="write-add">
            <input autoFocus value={newTitle} placeholder="Chapter title"
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} />
            <button className="primary" onClick={create}>Add</button>
          </div>
        )}
        <div className="write-tree-body"
          onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
          onDrop={(e) => { if (dragIndex !== null) { e.preventDefault(); void fileInto(null); } }}>
          {chapters.length === 0 ? (
            <div className="wt-empty" style={{ padding: "18px 12px" }}>No chapters yet — “+ Chapter” to begin.</div>
          ) : (
            <>
              {roots.map((s) => segNode(s, 0))}
              {unfiled.length > 0 && (
                <div className="wt-unfiled">
                  {roots.length > 0 && <div className="wt-unfiled-lab">Unfiled</div>}
                  {unfiled.map((c) => chNode(c, 0))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <div className="write-main">
        {importing ? (
          <ImportDocx worldId={worldId} mode="chapters"
            startOrder={(chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1}
            existingTitles={entities.map((e) => e.title)}
            onClose={() => setImporting(false)} onDone={() => reload()} />
        ) : open ? (
          <BookCanvas key={worldId} worldId={worldId} chapters={chapters} openId={open.id}
            entities={entities} bookIds={bookIds} onOpenEntity={(id) => go({ scope: "library", entityId: id })}
            onNavigate={(id) => setOpenId(id)} onChapterMetaChanged={() => void reload()}
            focused={focused} onToggleFocus={() => setFocused((f) => !f)} />
        ) : (
          <div className="write-placeholder">
            <Icon name="feather" size={26} />
            <p>Pick a chapter from the tree to start writing — or add a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
