import { useCallback, useEffect, useMemo, useState } from "react";
import { getWorldComments, createComment, updateComment, softDeleteComment } from "../lib/api";
import type { Comment } from "../lib/types";
import { resolveAnchor, type Anchor } from "../lib/anchor";
import { Icon } from "../components/icons";

type Scope = "chapter" | "book" | "world";
type ChapterRef = { id: string; manuscript_order: number; title: string };

// §6 comments + §3.5 panel: margin comments anchored to prose. Scope the list to
// this Chapter, its Book, or the whole World; search; group by chapter when the
// scope is wider than one. Create from the selection bar; click a quote to jump.
export function ChapterComments({ worldId, chapterId, chapters, bookIds, body, pending, onPendingConsumed, onJump, onNavigate, onCount, getSelection }: {
  worldId: string;
  chapterId: string;
  chapters: ChapterRef[];
  bookIds: Set<string>;
  body: string;
  pending: { start: number; end: number; quote: string } | null;
  onPendingConsumed: () => void;
  onJump: (c: Comment) => boolean;
  onNavigate: (chapterId: string) => void;
  onCount?: (n: number) => void;
  getSelection: () => Anchor | null;
}) {
  const [all, setAll] = useState<Comment[] | null>(null);
  const [scope, setScope] = useState<Scope>("chapter");
  const [q, setQ] = useState("");
  const [compose, setCompose] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [detached, setDetached] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    getWorldComments(worldId).then(setAll).catch((x) => setErr(String(x)));
  }, [worldId]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (pending) { setCompose(pending); setDraft(""); onPendingConsumed(); }
    // eslint-disable-next-line
  }, [pending]);

  const chById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);

  // Scope → search → split. The toolbar badge always reflects THIS chapter.
  const scoped = useMemo(() => {
    const inScope = (c: Comment) => scope === "world" ? true : scope === "book" ? bookIds.has(c.chapter_id) : c.chapter_id === chapterId;
    const needle = q.trim().toLowerCase();
    return (all ?? []).filter((c) => inScope(c) && (!needle || (c.body + " " + c.quote).toLowerCase().includes(needle)));
  }, [all, scope, q, bookIds, chapterId]);
  const open = scoped.filter((c) => !c.resolved);
  const resolved = scoped.filter((c) => c.resolved);
  const chapterUnresolved = useMemo(() => (all ?? []).filter((c) => c.chapter_id === chapterId && !c.resolved).length, [all, chapterId]);
  useEffect(() => { onCount?.(chapterUnresolved); }, [chapterUnresolved]); // eslint-disable-line

  // Resolve this chapter's comments live against the prose — a stale one (its quote
  // edited away) is shown persistently with a repair path, never silently dropped
  // on reload (the old in-memory-only detach was quiet data loss).
  const staleIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of all ?? []) {
      if (c.chapter_id !== chapterId) continue;
      const res = resolveAnchor(body, { quote: c.quote, prefix: c.anchor_prefix ?? "", suffix: c.anchor_suffix ?? "", start: c.anchor_start, end: c.anchor_end });
      if (res.status === "stale") s.add(c.id);
    }
    return s;
  }, [all, chapterId, body]);

  async function save() {
    const body = draft.trim();
    if (!body || !compose) { setCompose(null); setDraft(""); return; }
    try { await createComment(worldId, chapterId, { body, anchor_start: compose.start, anchor_end: compose.end, quote: compose.quote }); reload(); }
    catch (x) { setErr(String(x)); }
    setCompose(null); setDraft("");
  }
  async function toggleResolve(c: Comment) {
    try { await updateComment(c.id, { resolved: !c.resolved }); reload(); } catch (x) { setErr(String(x)); }
  }
  async function saveEdit(c: Comment) {
    const body = editDraft.trim();
    setEditId(null);
    if (!body || body === c.body) return;
    try { await updateComment(c.id, { body }); reload(); } catch (x) { setErr(String(x)); }
  }
  async function del(c: Comment) {
    try { await softDeleteComment(c.id); reload(); } catch (x) { setErr(String(x)); }
  }
  async function reanchor(c: Comment) {
    const a = getSelection();
    if (!a || a.quote.length < 1) return;
    try {
      await updateComment(c.id, { anchor_start: a.start, anchor_end: a.end, quote: a.quote, anchor_prefix: a.prefix, anchor_suffix: a.suffix, anchor_status: "ok" });
      reload();
    } catch (x) { setErr(String(x)); }
  }
  function jump(c: Comment) {
    if (c.chapter_id !== chapterId) { onNavigate(c.chapter_id); return; }
    const ok = onJump(c);
    setDetached((d) => { const n = new Set(d); ok ? n.delete(c.id) : n.add(c.id); return n; });
  }

  const row = (c: Comment) => {
    const stale = staleIds.has(c.id) || detached.has(c.id);
    return (
    <div className={"ccmt" + (c.resolved ? " done" : "")} key={c.id}>
      <div className="ccmt-quote" onClick={() => !stale && jump(c)} title={stale ? undefined : "Jump to this passage"}>
        <span className="ccmt-bar" />
        <span className="ccmt-quote-t">{c.quote || <span className="muted">(no quote)</span>}</span>
        {stale && <span className="ccmt-detached" title="The quoted text was edited away">detached</span>}
      </div>
      {stale && c.chapter_id === chapterId && (
        <div className="moment-stale">
          This no longer points at any text — the passage was edited or removed.
          <button onClick={() => reanchor(c)} title="Attach to the current selection">Re-anchor</button>
          <button onClick={() => del(c)}>Delete</button>
        </div>
      )}
      {editId === c.id ? (
        <textarea autoFocus className="cnote-edit" value={editDraft} rows={2}
          onChange={(e) => setEditDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setEditId(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(c); }}
          onBlur={() => saveEdit(c)} />
      ) : (
        <div className="ccmt-body" onClick={() => { setEditId(c.id); setEditDraft(c.body); }} title="Click to edit">{c.body}</div>
      )}
      <div className="ccmt-acts">
        <button className="ccmt-resolve" onClick={() => toggleResolve(c)}>
          <Icon name={c.resolved ? "undo" : "check"} size={12} /> {c.resolved ? "Reopen" : "Resolve"}
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="cnote-act danger" title="Delete comment" onClick={() => del(c)}><Icon name="trash" size={12} /></span>
      </div>
    </div>
    );
  };

  // Group rows by chapter when the scope is wider than one chapter.
  const grouped = (list: Comment[]) => {
    if (scope === "chapter") return list.map(row);
    const byCh = new Map<string, Comment[]>();
    for (const c of list) { const a = byCh.get(c.chapter_id) ?? []; a.push(c); byCh.set(c.chapter_id, a); }
    return [...byCh.entries()]
      .sort((a, b) => (chById.get(a[0])?.manuscript_order ?? 0) - (chById.get(b[0])?.manuscript_order ?? 0))
      .map(([cid, rows]) => {
        const ch = chById.get(cid);
        return (
          <div className="ccmt-group" key={cid}>
            <div className={"ccmt-group-head" + (cid === chapterId ? " on" : "")}>
              Ch. {ch?.manuscript_order ?? "?"} · {ch?.title ?? "—"}
            </div>
            {rows.map(row)}
          </div>
        );
      });
  };

  const chapterCount = useMemo(() => new Set(open.map((c) => c.chapter_id)).size, [open]);

  return (
    <div className="ccmts">
      {err && <p className="err" style={{ margin: "0 0 8px" }}>{err}</p>}
      <div className="ed-scope">
        {(["chapter", "book", "world"] as Scope[]).map((s) => (
          <button key={s} className={"ed-scope-btn" + (scope === s ? " on" : "")} onClick={() => setScope(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <div className="searchwrap pnl"><span className="ic"><Icon name="search" size={13} /></span>
        <input className="ed-panel-search" value={q} placeholder="Search comments…" onChange={(e) => setQ(e.target.value)} /></div>
      <div className="ed-panel-count">{open.length} unresolved{scope !== "chapter" ? ` · ${chapterCount} chapter${chapterCount === 1 ? "" : "s"}` : ""}</div>

      {compose && (
        <div className="ccmt compose">
          <div className="ccmt-quote"><span className="ccmt-bar" /><span className="ccmt-quote-t">{compose.quote}</span></div>
          <textarea autoFocus className="cnote-edit" value={draft} rows={2} placeholder="Leave a comment on this passage…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setCompose(null); setDraft(""); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }} />
          <div className="ccmt-acts">
            <button className="primary" style={{ padding: "3px 10px", fontSize: 11 }} onClick={save}>Comment</button>
            <button style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => { setCompose(null); setDraft(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {all === null && <span className="muted">Loading comments…</span>}
      {all !== null && open.length === 0 && !compose && (
        <span className="muted">{q.trim() ? "No comments match." : "No comments here — select a passage and choose “Comment”."}</span>
      )}
      {grouped(open)}
      {resolved.length > 0 && (
        <>
          <button className="ccmt-toggle" onClick={() => setShowResolved((v) => !v)}>
            <Icon name={showResolved ? "chevron-down" : "chevron"} size={12} /> {resolved.length} resolved
          </button>
          {showResolved && grouped(resolved)}
        </>
      )}
    </div>
  );
}
