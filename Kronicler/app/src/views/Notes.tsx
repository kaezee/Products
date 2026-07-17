import { useEffect, useRef, useState } from "react";
import { getNotes, createNote, updateNote, softDeleteNote, getEntities } from "../lib/api";
import type { Note, Entity } from "../lib/types";

const CANVAS_W = 2600, CANVAS_H = 1800, CARD_W = 230;

// The planning board (canvas-lite). Freeform note cards you drag around, tag to
// entities, and flag as secrets — a place to hold ideas and reveals you haven't
// written yet. Full pan/zoom infinite canvas is a later evolution.
export function Notes({ worldId }: { worldId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "secrets">("all");
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  async function reload() {
    try {
      const [n, e] = await Promise.all([getNotes(worldId), getEntities(worldId)]);
      setNotes(n); setEntities(e);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  function patch(id: string, p: Partial<Note>) {
    setNotes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, ...p } : n)));
  }

  async function add() {
    const b = boardRef.current;
    const x = (b?.scrollLeft ?? 0) + 40, y = (b?.scrollTop ?? 0) + 40;
    try { const n = await createNote(worldId, x, y); setNotes((prev) => [...(prev ?? []), n]); }
    catch (x) { setErr(String(x)); }
  }

  function startDrag(note: Note, e: React.MouseEvent) {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = { id: note.id, offX: e.clientX - (rect.left + note.x), offY: e.clientY - (rect.top + note.y) };
  }
  function onMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(CANVAS_W - CARD_W, e.clientX - rect.left - dragRef.current.offX));
    const y = Math.max(0, e.clientY - rect.top - dragRef.current.offY);
    patch(dragRef.current.id, { x, y });
  }
  function endDrag() {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const n = (notes ?? []).find((x) => x.id === d.id);
    if (n) updateNote(n.id, { x: n.x, y: n.y }).catch((x) => setErr(String(x)));
  }

  if (err) return <p className="err">{err}</p>;
  if (!notes) return <p className="muted">Loading notes…</p>;

  const secretCount = notes.filter((n) => n.is_secret).length;
  const visible = show === "secrets" ? notes.filter((n) => n.is_secret) : notes;

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title">Notes</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag cards anywhere · tag to entities · flag secrets</span>
        <span className="spacer" />
        <div className="seg" style={{ fontSize: 11 }}>
          <span className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All {notes.length}</span>
          <span className={show === "secrets" ? "on" : ""} onClick={() => setShow("secrets")}>🔒 Secrets {secretCount}</span>
        </div>
        <button onClick={add}>+ New note</button>
      </div>

      <div ref={boardRef} className="notes-board" onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
        <div ref={canvasRef} className="notes-canvas" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {visible.length === 0 && (
            <div className="muted" style={{ position: "absolute", left: 44, top: 40 }}>
              {show === "secrets" ? "No secrets flagged yet — flag a note with the lock." : "Empty board — hit “+ New note” to jot your first idea."}
            </div>
          )}
          {visible.map((n) => (
            <NoteCard key={n.id} note={n} entities={entities}
              onDragStart={(e) => startDrag(n, e)}
              onChange={(p) => { patch(n.id, p); updateNote(n.id, p).catch((x) => setErr(String(x))); }}
              onDelete={async () => { if (!confirm("Delete this note?")) return; try { await softDeleteNote(n.id); setNotes((prev) => (prev ?? []).filter((x) => x.id !== n.id)); } catch (x) { setErr(String(x)); } }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note, entities, onChange, onDelete, onDragStart }: {
  note: Note;
  entities: Entity[];
  onChange: (p: Partial<Note>) => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const [body, setBody] = useState(note.body);
  const [tagOpen, setTagOpen] = useState(false);
  const [q, setQ] = useState("");
  const timer = useRef<number | undefined>(undefined);

  function edit(v: string) {
    setBody(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange({ body: v }), 600);
  }

  const tagged = note.entity_ids.map((id) => entities.find((e) => e.id === id)).filter(Boolean) as Entity[];
  const matches = entities
    .filter((e) => !note.entity_ids.includes(e.id) && (q ? e.title.toLowerCase().includes(q.toLowerCase()) : true))
    .slice(0, 6);

  return (
    <div className="notecard" style={{ left: note.x, top: note.y, borderColor: note.is_secret ? "var(--obligation)" : "var(--lineStrong)", background: note.is_secret ? "var(--obligationBg)" : "var(--surface)" }}>
      <div className="notecard-bar" onMouseDown={onDragStart}>
        <span style={{ color: "var(--faint)", cursor: "grab" }}>⠿</span>
        <span className="spacer" />
        <span title={note.is_secret ? "Secret — hidden reveal" : "Mark as secret"} style={{ cursor: "pointer", fontSize: 12 }}
          onMouseDown={(e) => e.stopPropagation()} onClick={() => onChange({ is_secret: !note.is_secret })}>
          {note.is_secret ? "🔒" : "🔓"}
        </span>
        <span title="Delete note" style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13 }}
          onMouseDown={(e) => e.stopPropagation()} onClick={onDelete}>✕</span>
      </div>
      <textarea className="notecard-body" value={body} placeholder="Jot an idea…"
        onChange={(e) => edit(e.target.value)} onBlur={() => { window.clearTimeout(timer.current); if (body !== note.body) onChange({ body }); }} />
      <div className="notecard-tags">
        {tagged.map((e) => (
          <span key={e.id} className="chip on" style={{ cursor: "pointer" }}
            onClick={() => onChange({ entity_ids: note.entity_ids.filter((id) => id !== e.id) })}>
            {e.title} ✕
          </span>
        ))}
        <span className="chip click" onClick={() => setTagOpen((v) => !v)}>+ tag</span>
        {tagOpen && (
          <div className="typeahead" style={{ position: "absolute", width: 200 }}>
            <input autoFocus value={q} placeholder="tag an entity…" style={{ width: "100%", border: "none", borderBottom: "1px solid var(--line)" }}
              onChange={(e) => setQ(e.target.value)} />
            {matches.map((e) => (
              <div key={e.id} className="ta-row" onClick={() => { onChange({ entity_ids: [...note.entity_ids, e.id] }); setQ(""); setTagOpen(false); }}>
                <span className="chip" style={{ fontSize: 10 }}>{e.type}</span> {e.title}
              </div>
            ))}
            {matches.length === 0 && <div className="ta-row"><span className="muted">no match</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}
