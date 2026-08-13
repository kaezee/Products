import { useCallback, useEffect, useMemo, useState } from "react";
import { getNotes, createNote, updateNote, softDeleteNote } from "../lib/api";
import type { Note } from "../lib/types";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import { toast } from "../components/toast";

type Scope = "chapter" | "book" | "world";
type ChapterRef = { id: string; manuscript_order: number; title: string };

// §5 notes + §3.5 panel: notes anchored to a chapter (chapter_ids). Scope to this
// Chapter, its Book, or the whole World; search; group by chapter when wider.
export function ChapterNotes({ worldId, chapterId, chapters, bookIds, onNavigate, onCount }: {
  worldId: string;
  chapterId: string;
  chapters: ChapterRef[];
  bookIds: Set<string>;
  onNavigate: (chapterId: string) => void;
  onCount?: (n: number) => void;
}) {
  const [all, setAll] = useState<Note[] | null>(null);
  const [scope, setScope] = useState<Scope>("chapter");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    getNotes(worldId).then(setAll).catch((x) => setErr(String(x)));
  }, [worldId]);
  useEffect(() => { reload(); }, [reload]);

  const chById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const anchorCh = (n: Note) => (n.chapter_ids ?? []).find((id) => chById.has(id)) ?? null;

  const scoped = useMemo(() => {
    const inScope = (n: Note) => {
      const chs = n.chapter_ids ?? [];
      if (scope === "world") return true;
      if (scope === "book") return chs.some((id) => bookIds.has(id));
      return chs.includes(chapterId);
    };
    const needle = q.trim().toLowerCase();
    return (all ?? []).filter((n) => inScope(n) && (!needle || n.body.toLowerCase().includes(needle)));
  }, [all, scope, q, bookIds, chapterId]);
  const chapterCount = useMemo(() => (all ?? []).filter((n) => (n.chapter_ids ?? []).includes(chapterId)).length, [all, chapterId]);
  useEffect(() => { onCount?.(chapterCount); }, [chapterCount]); // eslint-disable-line

  async function add() {
    const body = draft.trim();
    if (!body) { setAdding(false); setDraft(""); return; }
    try {
      const n = await createNote(worldId, 48, 48);
      await updateNote(n.id, { body, chapter_ids: [chapterId] });
      reload(); toast("Note saved");
    } catch (x) { setErr(String(x)); }
    setDraft(""); setAdding(false);
  }
  async function saveEdit(n: Note) {
    const body = editDraft.trim();
    setEditId(null);
    if (!body || body === n.body) return;
    try { await updateNote(n.id, { body }); reload(); toast("Note saved"); } catch (x) { setErr(String(x)); }
  }
  async function unpin(n: Note) {
    const next = (n.chapter_ids ?? []).filter((c) => c !== chapterId);
    try { await updateNote(n.id, { chapter_ids: next }); reload(); } catch (x) { setErr(String(x)); }
  }
  async function del(n: Note) {
    if (!(await confirmDialog({ title: "Delete note", message: "Delete this note? It moves to the Trash — recoverable from Settings → Trash.", confirmLabel: "Delete", tone: "danger" }))) return;
    try { await softDeleteNote(n.id); reload(); toast("Note deleted"); } catch (x) { setErr(String(x)); }
  }

  const row = (n: Note) => (
    <div className="cnote" key={n.id}>
      {editId === n.id ? (
        <textarea autoFocus className="cnote-edit" value={editDraft} rows={3}
          onChange={(e) => setEditDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setEditId(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(n); }}
          onBlur={() => saveEdit(n)} />
      ) : (
        <div className="cnote-body" onClick={() => { setEditId(n.id); setEditDraft(n.body); }} title="Click to edit">
          {n.body || <span className="muted">Empty note — click to write.</span>}
        </div>
      )}
      <div className="cnote-acts">
        {n.is_secret && <span className="cnote-secret" title="Secret note"><Icon name="lock" size={11} /></span>}
        {(n.chapter_ids ?? []).includes(chapterId)
          ? <span className="cnote-act" title="Unpin from this chapter" onClick={() => unpin(n)}><Icon name="close" size={12} /></span>
          : anchorCh(n) && <span className="cnote-act" title="Go to this note's chapter" onClick={() => onNavigate(anchorCh(n)!)}><Icon name="arrow" size={12} /></span>}
        <span className="cnote-act danger" title="Delete note" onClick={() => del(n)}><Icon name="trash" size={12} /></span>
      </div>
    </div>
  );

  const grouped = () => {
    if (scope === "chapter") return scoped.map(row);
    const byCh = new Map<string, Note[]>();
    for (const n of scoped) { const cid = anchorCh(n) ?? "world"; const a = byCh.get(cid) ?? []; a.push(n); byCh.set(cid, a); }
    return [...byCh.entries()]
      .sort((a, b) => (chById.get(a[0])?.manuscript_order ?? 9999) - (chById.get(b[0])?.manuscript_order ?? 9999))
      .map(([cid, rows]) => {
        const ch = chById.get(cid);
        return (
          <div className="ccmt-group" key={cid}>
            <div className={"ccmt-group-head" + (cid === chapterId ? " on" : "")}>{ch ? `Ch. ${ch.manuscript_order} · ${ch.title}` : "World"}</div>
            {rows.map(row)}
          </div>
        );
      });
  };

  return (
    <div className="cnotes">
      {err && <p className="err" style={{ margin: "0 0 8px" }}>{err}</p>}
      <div className="ed-scope">
        {(["chapter", "book", "world"] as Scope[]).map((s) => (
          <button key={s} className={"ed-scope-btn" + (scope === s ? " on" : "")} onClick={() => setScope(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <div className="searchwrap pnl"><span className="ic"><Icon name="search" size={13} /></span>
        <input className="ed-panel-search" value={q} placeholder="Search notes…" onChange={(e) => setQ(e.target.value)} /></div>
      <div className="ed-panel-count">{scoped.length} note{scoped.length === 1 ? "" : "s"}</div>

      {all === null && <span className="muted">Loading notes…</span>}
      {all !== null && scoped.length === 0 && !adding && (
        <span className="muted">{q.trim() ? "No notes match." : "No notes here yet."}</span>
      )}
      {grouped()}
      {adding ? (
        <textarea autoFocus className="cnote-edit" value={draft} rows={3} placeholder="A note about this chapter — a reminder, a thread to pick up…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setDraft(""); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
          onBlur={add} />
      ) : (
        <button className="cnote-add" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> Pin a note here</button>
      )}
    </div>
  );
}
