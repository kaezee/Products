import { useEffect, useState } from "react";
import { getChapterComments, createComment, updateComment, softDeleteComment } from "../lib/api";
import type { Comment } from "../lib/types";
import { Icon } from "../components/icons";

// §6 comments: margin comments on the active chapter's prose. Create one by
// selecting text and hitting "Comment" in the selection bar; the comment stores
// the quoted range. Click a comment's quote to jump back to it in the prose.
export function ChapterComments({ worldId, chapterId, pending, onPendingConsumed, onJump, onCount }: {
  worldId: string;
  chapterId: string;
  pending: { start: number; end: number; quote: string } | null;
  onPendingConsumed: () => void;
  onJump: (c: Comment) => boolean;
  onCount?: (n: number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [compose, setCompose] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [detached, setDetached] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getChapterComments(chapterId).then((c) => live && setComments(c)).catch((x) => live && setErr(String(x)));
    return () => { live = false; };
  }, [chapterId]);

  // A pending range from the selection bar → open the composer for it.
  useEffect(() => {
    if (pending) { setCompose(pending); setDraft(""); onPendingConsumed(); }
    // eslint-disable-next-line
  }, [pending]);

  const open = (comments ?? []).filter((c) => !c.resolved);
  const resolved = (comments ?? []).filter((c) => c.resolved);
  useEffect(() => { onCount?.(open.length); }, [open.length]); // eslint-disable-line

  async function save() {
    const body = draft.trim();
    if (!body || !compose) { setCompose(null); setDraft(""); return; }
    try {
      const c = await createComment(worldId, chapterId, { body, anchor_start: compose.start, anchor_end: compose.end, quote: compose.quote });
      setComments((p) => [...(p ?? []), c]);
    } catch (x) { setErr(String(x)); }
    setCompose(null); setDraft("");
  }
  async function toggleResolve(c: Comment) {
    try {
      await updateComment(c.id, { resolved: !c.resolved });
      setComments((p) => (p ?? []).map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)));
    } catch (x) { setErr(String(x)); }
  }
  async function saveEdit(c: Comment) {
    const body = editDraft.trim();
    setEditId(null);
    if (!body || body === c.body) return;
    try {
      await updateComment(c.id, { body });
      setComments((p) => (p ?? []).map((x) => (x.id === c.id ? { ...x, body } : x)));
    } catch (x) { setErr(String(x)); }
  }
  async function del(c: Comment) {
    try {
      await softDeleteComment(c.id);
      setComments((p) => (p ?? []).filter((x) => x.id !== c.id));
    } catch (x) { setErr(String(x)); }
  }
  function jump(c: Comment) {
    const ok = onJump(c);
    setDetached((d) => { const n = new Set(d); ok ? n.delete(c.id) : n.add(c.id); return n; });
  }

  const row = (c: Comment) => (
    <div className={"ccmt" + (c.resolved ? " done" : "")} key={c.id}>
      <div className="ccmt-quote" onClick={() => jump(c)} title="Jump to this passage">
        <span className="ccmt-bar" />
        <span className="ccmt-quote-t">{c.quote || <span className="muted">(no quote)</span>}</span>
        {detached.has(c.id) && <span className="ccmt-detached" title="The quoted text was edited away — this comment is detached">detached</span>}
      </div>
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

  return (
    <div className="ccmts">
      {err && <p className="err" style={{ margin: "0 0 8px" }}>{err}</p>}
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
      {comments === null && <span className="muted">Loading comments…</span>}
      {comments !== null && open.length === 0 && !compose && (
        <span className="muted">No comments yet — select a passage in the prose and choose “Comment”.</span>
      )}
      {open.map(row)}
      {resolved.length > 0 && (
        <>
          <button className="ccmt-toggle" onClick={() => setShowResolved((v) => !v)}>
            <Icon name={showResolved ? "chevron-down" : "chevron"} size={12} /> {resolved.length} resolved
          </button>
          {showResolved && resolved.map(row)}
        </>
      )}
    </div>
  );
}
