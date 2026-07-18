import { useEffect, useRef, useState } from "react";
import { getNotes, createNote, updateNote, softDeleteNote, getEntities, getRelationshipTypes, getChapters } from "../lib/api";
import type { Note, Entity, RelationshipType, Chapter } from "../lib/types";
import { NoteToState } from "./NoteToState";

const CARD_W = 230, CARD_H = 150; // CARD_H is a nominal height, for framing math only
const MIN_SCALE = 0.3, MAX_SCALE = 2.2;
const FIT_PAD = 60;

interface View { tx: number; ty: number; s: number } // canvas transform: translate(tx,ty) scale(s), origin 0 0

// The planning board — an infinite canvas. Note cards live in world coordinates
// (note.x / note.y); the board is a fixed viewport you pan (drag empty space)
// and zoom (wheel / the ± controls) over that unbounded space. Cards can be
// tagged to entities, flagged as secrets, and promoted into lens-enforced states.
export function Notes({ worldId }: { worldId: string }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<"all" | "secrets">("all");
  const [lensNote, setLensNote] = useState<Note | null>(null);
  const [view, setView] = useState<View>({ tx: 40, ty: 40, s: 1 });
  const [panning, setPanning] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  async function reload() {
    try {
      const [n, e, t, c] = await Promise.all([getNotes(worldId), getEntities(worldId), getRelationshipTypes(worldId), getChapters(worldId)]);
      setNotes(n); setEntities(e); setTypes(t); setChapters(c);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  function patch(id: string, p: Partial<Note>) {
    setNotes((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, ...p } : n)));
  }

  // board-local screen point → world coordinate
  function toWorld(clientX: number, clientY: number) {
    const r = boardRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.tx) / v.s, y: (clientY - r.top - v.ty) / v.s };
  }

  async function createAt(wx: number, wy: number) {
    try { const n = await createNote(worldId, Math.round(wx), Math.round(wy)); setNotes((prev) => [...(prev ?? []), n]); }
    catch (x) { setErr(String(x)); }
  }
  function add() {
    // drop the new card near the centre of the current viewport, in world space
    const r = boardRef.current?.getBoundingClientRect();
    const c = r ? toWorld(r.left + r.width / 2 - (CARD_W / 2) * view.s, r.top + 80) : { x: 60, y: 60 };
    void createAt(c.x, c.y);
  }
  function onDoubleClick(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return; // only on empty board
    const w = toWorld(e.clientX, e.clientY);
    void createAt(w.x - CARD_W / 2, w.y - 16);
  }

  function startDrag(note: Note, e: React.MouseEvent) {
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    dragRef.current = { id: note.id, offX: w.x - note.x, offY: w.y - note.y };
  }
  function startPan(e: React.MouseEvent) {
    // pan only when the gesture starts on empty board (not on a card)
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    setPanning(true);
  }
  function onMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      patch(dragRef.current.id, { x: Math.round(w.x - dragRef.current.offX), y: Math.round(w.y - dragRef.current.offY) });
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
    }
  }
  function endDrag() {
    const d = dragRef.current; dragRef.current = null;
    panRef.current = null; setPanning(false);
    if (!d) return;
    const n = (notes ?? []).find((x) => x.id === d.id);
    if (n) updateNote(n.id, { x: n.x, y: n.y }).catch((x) => setErr(String(x)));
  }

  // zoom toward the cursor, keeping the world point under it fixed
  function zoomAt(clientX: number, clientY: number, factor: number) {
    setView((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const r = boardRef.current!.getBoundingClientRect();
      const bx = clientX - r.left, by = clientY - r.top;
      const wx = (bx - v.tx) / v.s, wy = (by - v.ty) / v.s;
      return { s, tx: bx - wx * s, ty: by - wy * s };
    });
  }
  // Native non-passive wheel listener: React's synthetic onWheel is passive, so
  // preventDefault there is a no-op and the page scrolls instead of zooming.
  // Depend on notes being loaded: the board isn't rendered while notes === null,
  // so an empty-dep effect would attach to a boardRef that's still null.
  const boardReady = notes != null;
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [boardReady]);

  function zoomButton(dir: 1 | -1) {
    const r = boardRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, dir > 0 ? 1.2 : 1 / 1.2);
  }
  function resetView() { setView({ tx: 40, ty: 40, s: 1 }); }
  // frame every visible card within the viewport — the "I've lost my cards" escape hatch
  function fitView() {
    const cards = show === "secrets" ? (notes ?? []).filter((n) => n.is_secret) : (notes ?? []);
    const r = boardRef.current?.getBoundingClientRect();
    if (!r || cards.length === 0) { resetView(); return; }
    const minX = Math.min(...cards.map((n) => n.x));
    const minY = Math.min(...cards.map((n) => n.y));
    const maxX = Math.max(...cards.map((n) => n.x + CARD_W));
    const maxY = Math.max(...cards.map((n) => n.y + CARD_H));
    const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY);
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((r.width - 2 * FIT_PAD) / cw, (r.height - 2 * FIT_PAD) / ch, 1)));
    setView({ s, tx: (r.width - cw * s) / 2 - minX * s, ty: (r.height - ch * s) / 2 - minY * s });
  }

  if (err) return <p className="err">{err}</p>;
  if (!notes) return <p className="muted">Loading notes…</p>;

  const secretCount = notes.filter((n) => n.is_secret).length;
  const visible = show === "secrets" ? notes.filter((n) => n.is_secret) : notes;

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title">Notes</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag to pan · scroll to zoom · double-click to add</span>
        <span className="spacer" />
        <div className="seg" style={{ fontSize: 11 }}>
          <span className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>All {notes.length}</span>
          <span className={show === "secrets" ? "on" : ""} onClick={() => setShow("secrets")}>🔒 Secrets {secretCount}</span>
        </div>
        <button onClick={add}>+ New note</button>
      </div>

      <div ref={boardRef} className={"notes-board" + (panning ? " panning" : "")}
        onMouseDown={startPan} onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag} onDoubleClick={onDoubleClick}>
        <div className="notes-canvas" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: "0 0" }}>
          {visible.map((n) => (
            <NoteCard key={n.id} note={n} entities={entities}
              onDragStart={(e) => startDrag(n, e)}
              onToLens={() => setLensNote(n)}
              onChange={(p) => { patch(n.id, p); updateNote(n.id, p).catch((x) => setErr(String(x))); }}
              onDelete={async () => { if (!confirm("Delete this note?")) return; try { await softDeleteNote(n.id); setNotes((prev) => (prev ?? []).filter((x) => x.id !== n.id)); } catch (x) { setErr(String(x)); } }} />
          ))}
        </div>

        {visible.length === 0 && (
          <div className="muted" style={{ position: "absolute", left: 44, top: 40, pointerEvents: "none" }}>
            {show === "secrets" ? "No secrets flagged yet — flag a note with the lock." : "Empty board — double-click anywhere (or “+ New note”) to jot your first idea."}
          </div>
        )}

        <div className="canvas-zoom">
          <button title="Fit all notes in view" onClick={fitView}>⤢</button>
          <span className="zoom-sep" />
          <button title="Zoom out" onClick={() => zoomButton(-1)}>−</button>
          <span className="zoom-pct" title="Reset to 100%" onClick={resetView}>{Math.round(view.s * 100)}%</span>
          <button title="Zoom in" onClick={() => zoomButton(1)}>+</button>
        </div>
      </div>

      {lensNote && (
        <NoteToState worldId={worldId} note={lensNote} entities={entities} types={types} chapters={chapters}
          onClose={() => setLensNote(null)}
          onDone={() => reload()}
          onTypesChanged={() => getRelationshipTypes(worldId).then(setTypes).catch(() => {})} />
      )}
    </div>
  );
}

function NoteCard({ note, entities, onChange, onDelete, onDragStart, onToLens }: {
  note: Note;
  entities: Entity[];
  onChange: (p: Partial<Note>) => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onToLens: () => void;
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
      {note.is_secret && (
        <div className="notecard-foot" onMouseDown={(e) => e.stopPropagation()}>
          <span className="chip click" title="Turn this secret into a real, lens-enforced concealed state" onClick={onToLens}>
            → concealed state
          </span>
        </div>
      )}
    </div>
  );
}
