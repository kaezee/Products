import { useEffect, useState } from "react";
import { getNotes, createNote, updateNote, softDeleteNote } from "../lib/api";
import type { Note } from "../lib/types";
import { Icon } from "../components/icons";

// §5 notes-in-context: the notes anchored to THIS chapter, surfaced right where
// the writing happens. Notes already carry a chapter_ids array, so anchoring is
// additive — an anchored note still lives on the Notes board, it just also
// appears here. No schema change.
export function ChapterNotes({ worldId, chapterId, onCount }: {
  worldId: string;
  chapterId: string;
  onCount?: (n: number) => void;
}) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getNotes(worldId).then((n) => live && setNotes(n)).catch((x) => live && setErr(String(x)));
    return () => { live = false; };
  }, [worldId]);

  const mine = (notes ?? []).filter((n) => n.chapter_ids?.includes(chapterId));
  useEffect(() => { onCount?.(mine.length); }, [mine.length]); // eslint-disable-line

  async function add() {
    const body = draft.trim();
    if (!body) { setAdding(false); setDraft(""); return; }
    try {
      const n = await createNote(worldId, 48, 48);
      await updateNote(n.id, { body, chapter_ids: [chapterId] });
      setNotes((p) => [...(p ?? []), { ...n, body, chapter_ids: [chapterId] }]);
    } catch (x) { setErr(String(x)); }
    setDraft(""); setAdding(false);
  }
  async function saveEdit(n: Note) {
    const body = editDraft.trim();
    setEditId(null);
    if (!body || body === n.body) return;
    try {
      await updateNote(n.id, { body });
      setNotes((p) => (p ?? []).map((x) => (x.id === n.id ? { ...x, body } : x)));
    } catch (x) { setErr(String(x)); }
  }
  // Unpin from this chapter (the note itself stays on the board).
  async function unpin(n: Note) {
    const next = (n.chapter_ids ?? []).filter((c) => c !== chapterId);
    try {
      await updateNote(n.id, { chapter_ids: next });
      setNotes((p) => (p ?? []).map((x) => (x.id === n.id ? { ...x, chapter_ids: next } : x)));
    } catch (x) { setErr(String(x)); }
  }
  async function del(n: Note) {
    try {
      await softDeleteNote(n.id);
      setNotes((p) => (p ?? []).filter((x) => x.id !== n.id));
    } catch (x) { setErr(String(x)); }
  }

  return (
    <div className="cnotes">
      {err && <p className="err" style={{ margin: "0 0 8px" }}>{err}</p>}
      {notes === null && <span className="muted">Loading notes…</span>}
      {notes !== null && mine.length === 0 && !adding && (
        <span className="muted">No notes pinned to this chapter yet.</span>
      )}
      {mine.map((n) => (
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
            <span className="cnote-act" title="Unpin from this chapter (keeps it on the board)" onClick={() => unpin(n)}><Icon name="close" size={12} /></span>
            <span className="cnote-act danger" title="Delete note" onClick={() => del(n)}><Icon name="trash" size={12} /></span>
          </div>
        </div>
      ))}
      {adding ? (
        <textarea autoFocus className="cnote-edit" value={draft} rows={3} placeholder="A note about this chapter — a reminder, a thread to pick up, a question…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setDraft(""); } if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}
          onBlur={add} />
      ) : (
        <button className="cnote-add" onClick={() => setAdding(true)}><Icon name="plus" size={12} /> Pin a note here</button>
      )}
    </div>
  );
}
