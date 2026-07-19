import { useEffect, useRef, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand, setChapterBand,
  getChapters, getNotes, createNote, updateNote, softDeleteNote,
} from "../lib/api";
import type { Band, Chapter, Note } from "../lib/types";
import type { Nav } from "../App";

// The Timeline: a pan/zoom canvas with a horizontal time spine. Chapters ride
// ABOVE the line, grouped into bands (a season/novel collapses to one block,
// clicks open/close). Notes pin BELOW the line to a chapter, a band, or the
// future. Bands can carry an in-world time frame ("Year 2000–2100").

const COL = 158, BAND_W = 214, GAP = 14, DOTC = 5.5;
const AXIS_Y = 150, NOTE_TOP = 172, NOTE_H = 58, STACK = 66;
const BAND_TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];
const MIN_SCALE = 0.2, MAX_SCALE = 2, FIT_PAD = 50;

interface View { tx: number; ty: number; s: number }
type Seg =
  | { kind: "band"; band: Band; chs: Chapter[]; x: number; w: number; exp: boolean; tint: string }
  | { kind: "chapter"; chapter: Chapter; x: number; w: number };

export function Timeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [bands, setBands] = useState<Band[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ tx: 24, ty: 24, s: 1 });
  const [panning, setPanning] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  async function reload() {
    try {
      const [b, c, n] = await Promise.all([getBands(worldId), getChapters(worldId), getNotes(worldId)]);
      setBands(b.sort((x, y) => x.band_order - y.band_order)); setChapters(c); setNotes(n);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const bandIds = new Set(bands.map((b) => b.id));
  const ordered = [...chapters].sort((a, b) => a.manuscript_order - b.manuscript_order);
  const tintOf = (b: Band) => b.color || BAND_TINTS[bands.indexOf(b) % BAND_TINTS.length];

  // segments left → right
  const segs: Seg[] = [];
  let x = 0;
  const placed = new Set<string>();
  for (const c of ordered) {
    if (placed.has(c.id)) continue;
    const band = bands.find((b) => b.id === c.band_id && bandIds.has(b.id));
    if (band) {
      const chs = ordered.filter((cc) => cc.band_id === band.id);
      chs.forEach((cc) => placed.add(cc.id));
      const exp = expanded.has(band.id);
      const w = exp ? Math.max(chs.length * COL, COL) : BAND_W;
      segs.push({ kind: "band", band, chs, x, w, exp, tint: tintOf(band) });
      x += w + GAP;
    } else {
      placed.add(c.id);
      segs.push({ kind: "chapter", chapter: c, x, w: COL });
      x += COL + GAP;
    }
  }
  const spineW = Math.max(x, 300);
  const futureX = spineW + 30;

  // x-anchor for pinning notes: a chapter's centre (band centre if collapsed),
  // a band's centre, else the future zone.
  const chapterX = new Map<string, number>();
  const bandCenterX = new Map<string, number>();
  for (const seg of segs) {
    if (seg.kind === "chapter") { chapterX.set(seg.chapter.id, seg.x + COL / 2); continue; }
    bandCenterX.set(seg.band.id, seg.x + seg.w / 2);
    if (seg.exp) seg.chs.forEach((c, i) => chapterX.set(c.id, seg.x + i * COL + COL / 2));
    else seg.chs.forEach((c) => chapterX.set(c.id, seg.x + seg.w / 2));
  }

  // place notes below the line (stacked when they share an anchor)
  const belowNotes: { note: Note; x: number; top: number }[] = [];
  const stackAt = new Map<number, number>();
  let futureCount = 0;
  const place = (note: Note, ax: number) => {
    const key = Math.round(ax / 8);
    const s = stackAt.get(key) ?? 0; stackAt.set(key, s + 1);
    belowNotes.push({ note, x: ax, top: NOTE_TOP + s * STACK });
  };
  for (const n of notes) {
    const chId = n.chapter_ids?.[0];
    if (chId && chapterX.has(chId)) { place(n, chapterX.get(chId)!); continue; }
    if (n.band_id && bandCenterX.has(n.band_id)) { place(n, bandCenterX.get(n.band_id)!); continue; }
    if (n.plan_ref) { place(n, futureX + futureCount * 138 + 64); futureCount++; }
  }
  const emptyBands = bands.filter((b) => !ordered.some((c) => c.band_id === b.id));
  const maxTop = belowNotes.reduce((m, b) => Math.max(m, b.top), NOTE_TOP);
  const contentW = Math.max(futureX + (futureCount ? futureCount * 138 + 60 : 40), 360);
  const contentH = maxTop + NOTE_H + 10;

  // ── pan / zoom ──────────────────────────────────────────────────────────
  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".tl-card, .tl-summary, .tl-bandbar, .tl-pinnote, select, input, button")) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    setPanning(true);
  }
  function onMove(e: React.MouseEvent) {
    if (!panRef.current) return;
    const p = panRef.current;
    setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
  }
  function endPan() { panRef.current = null; setPanning(false); }
  function zoomAt(cx: number, cy: number, factor: number) {
    setView((v) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const r = boardRef.current!.getBoundingClientRect();
      const bx = cx - r.left, by = cy - r.top;
      return { s, tx: bx - ((bx - v.tx) / v.s) * s, ty: by - ((by - v.ty) / v.s) * s };
    });
  }
  useEffect(() => {
    const el = boardRef.current;
    if (!el || loading) return;
    const h = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [loading]);
  function zoomButton(dir: 1 | -1) {
    const r = boardRef.current?.getBoundingClientRect();
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, dir > 0 ? 1.2 : 1 / 1.2);
  }
  function fitView() {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return;
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((r.width - 2 * FIT_PAD) / contentW, (r.height - 2 * FIT_PAD) / contentH, 1)));
    setView({ s, tx: (r.width - contentW * s) / 2, ty: FIT_PAD });
  }

  function toggle(bandId: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(bandId) ? n.delete(bandId) : n.add(bandId); return n; });
  }
  async function addBand() {
    const order = bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0;
    try { const b = await createBand(worldId, `Band ${bands.length + 1}`, order); setBands((p) => [...p, b]); }
    catch (x) { setErr(String(x)); }
  }
  async function patchBand(b: Band, patch: Partial<Band>) {
    setBands((prev) => prev.map((z) => z.id === b.id ? { ...z, ...patch } : z));
    try { await updateBand(b.id, patch); } catch (x) { setErr(String(x)); }
  }
  async function removeBand(b: Band) {
    if (!confirm(`Delete band "${b.name}"? Its chapters stay on the line, just unbanded — nothing is lost.`)) return;
    try { await softDeleteBand(b.id); setBands((p) => p.filter((z) => z.id !== b.id)); } catch (x) { setErr(String(x)); }
  }
  async function assignChapter(chapterId: string, bandId: string | null) {
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, band_id: bandId } : c));
    try { await setChapterBand(chapterId, bandId); } catch (x) { setErr(String(x)); }
  }
  async function addNote() {
    try {
      const n = await createNote(worldId, 40, 40);
      const anchor: Partial<Note> = ordered[0] ? { chapter_ids: [ordered[0].id] } : { plan_ref: "planned" };
      await updateNote(n.id, { body: "New note", ...anchor });
      setNotes((p) => [...p, { ...n, body: "New note", ...anchor } as Note]);
    } catch (x) { setErr(String(x)); }
  }
  function patchNoteLocal(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
  }
  async function pinNote(noteId: string, sel: string) {
    const patch: Partial<Note> = sel.startsWith("c:") ? { chapter_ids: [sel.slice(2)], band_id: null, plan_ref: null }
      : sel.startsWith("b:") ? { band_id: sel.slice(2), chapter_ids: [], plan_ref: null }
        : { plan_ref: "planned", chapter_ids: [], band_id: null };
    patchNoteLocal(noteId, patch);
    try { await updateNote(noteId, patch); } catch (x) { setErr(String(x)); }
  }
  async function editNoteBody(noteId: string, body: string) {
    patchNoteLocal(noteId, { body });
    try { await updateNote(noteId, { body }); } catch (x) { setErr(String(x)); }
  }
  async function deleteNote(noteId: string) {
    try { await softDeleteNote(noteId); setNotes((p) => p.filter((n) => n.id !== noteId)); } catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading timeline…</p>;

  const picker = (value: string | null, onPick: (id: string | null) => void) => (
    <select className="tl-pick" value={value ?? ""}
      onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onChange={(e) => onPick(e.target.value || null)}>
      <option value="">unbanded</option>
      {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );
  const chapterStop = (c: Chapter, left: number, tint: string) => (
    <div key={c.id}>
      <div className="tl-card" style={{ left: left + 6 }} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
        <div className="tl-card-top">
          <span className="tl-ch-no">{String(c.manuscript_order).padStart(2, "0")}</span>
          {picker(c.band_id, (id) => assignChapter(c.id, id))}
        </div>
        <div className="tl-ch-title">{c.title}</div>
      </div>
      <div className="tl-stem" style={{ left: left + COL / 2 }} />
      <div className="tl-dot" style={{ left: left + COL / 2 - DOTC, background: tint, borderColor: tint }} />
    </div>
  );

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag to pan · scroll to zoom · click a band to open/close · notes pin below the line</span>
        <span className="spacer" />
        <button onClick={addNote}>+ Note</button>
        <button onClick={addBand}>+ Band</button>
      </div>

      {ordered.length === 0 && notes.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">No chapters yet — write some in the Manuscript, then group them into bands here.</span></div></div>
      ) : (
        <div ref={boardRef} className={"notes-board" + (panning ? " panning" : "")}
          onMouseDown={startPan} onMouseMove={onMove} onMouseUp={endPan} onMouseLeave={endPan}>
          <div className="notes-canvas" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: "0 0" }}>
            <div className="tl-inner" style={{ width: contentW, height: contentH }}>
              <div className="tl-axis" style={{ width: contentW - 20, top: AXIS_Y }} />

              {segs.map((seg) => {
                if (seg.kind === "chapter") return chapterStop(seg.chapter, seg.x, "var(--lineStrong)");
                const { band, chs, x: sx, w, exp, tint } = seg;
                const first = chs[0].manuscript_order, last = chs[chs.length - 1].manuscript_order;
                return (
                  <div key={band.id}>
                    <div className="tl-bandbar" style={{ left: sx, width: w, background: tint + "26", borderColor: tint, cursor: "pointer" }}
                      onClick={() => toggle(band.id)} title={exp ? "Click to close" : "Click to open chapters"}>
                      <span className="tl-band-toggle">{exp ? "▾" : "▸"}</span>
                      <input className="tl-bandname" value={band.name} style={{ color: tint }}
                        onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => patchBand(band, { name: e.target.value })} />
                      {exp && (
                        <input className="tl-tf" value={band.time_frame ?? ""} placeholder="🕐 time frame…"
                          onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => patchBand(band, { time_frame: e.target.value })} />
                      )}
                      <span className="tl-bandx" title="Delete band" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeBand(band); }}>✕</span>
                    </div>
                    {exp ? (
                      chs.map((c, i) => chapterStop(c, sx + i * COL, tint))
                    ) : (
                      <>
                        <div className="tl-summary" style={{ left: sx + 4, width: w - 8, borderColor: tint }} onClick={() => toggle(band.id)}>
                          <div className="tl-sum-range" style={{ color: tint }}>ch {first}{last !== first ? `–${last}` : ""}</div>
                          <div className="tl-sum-count">{chs.length} chapter{chs.length > 1 ? "s" : ""}{band.time_frame ? ` · 🕐 ${band.time_frame}` : " · click to open"}</div>
                        </div>
                        <div className="tl-stem" style={{ left: sx + w / 2 }} />
                        <div className="tl-dot" style={{ left: sx + w / 2 - DOTC, background: tint, borderColor: tint }} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* pinned notes, below the line */}
              {belowNotes.map(({ note, x: nx, top }) => (
                <div key={note.id}>
                  <div className="tl-connector" style={{ left: nx, top: AXIS_Y, height: top - AXIS_Y }} />
                  <div className="tl-dot tl-dot-note" style={{ left: nx - DOTC, top: AXIS_Y - 5 }} />
                  <PinnedNote note={note} left={nx - 64} top={top} bands={bands} chapters={ordered}
                    onPin={(sel) => pinNote(note.id, sel)} onEdit={(b) => editNoteBody(note.id, b)} onDelete={() => deleteNote(note.id)} />
                </div>
              ))}
            </div>
          </div>

          <div className="canvas-zoom">
            <button title="Fit whole timeline" onClick={fitView}>⤢</button>
            <span className="zoom-sep" />
            <button title="Zoom out" onClick={() => zoomButton(-1)}>−</button>
            <span className="zoom-pct" title="Reset to 100%" onClick={() => setView({ tx: 24, ty: 24, s: 1 })}>{Math.round(view.s * 100)}%</span>
            <button title="Zoom in" onClick={() => zoomButton(1)}>+</button>
          </div>
        </div>
      )}

      {emptyBands.length > 0 && (
        <div className="row" style={{ borderBottom: "none", padding: "10px 2px 0", gap: 8, flexWrap: "wrap" }}>
          <span className="faint" style={{ fontSize: 11 }}>empty bands (assign chapters to place them on the line):</span>
          {emptyBands.map((b) => (
            <span key={b.id} className="chip" style={{ borderColor: tintOf(b), color: tintOf(b) }}>
              <input className="tl-bandname" value={b.name} style={{ width: 90, color: "inherit" }} onChange={(e) => patchBand(b, { name: e.target.value })} />
              <span className="tl-bandx" onClick={() => removeBand(b)}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// A note pinned below the spine: edit its text, re-pin it (chapter / band /
// future), or delete it.
function PinnedNote({ note, left, top, bands, chapters, onPin, onEdit, onDelete }: {
  note: Note;
  left: number; top: number;
  bands: Band[]; chapters: Chapter[];
  onPin: (sel: string) => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(note.body || note.plan_ref || "");
  const timer = useRef<number | undefined>(undefined);
  const pinVal = note.chapter_ids?.[0] ? "c:" + note.chapter_ids[0] : note.band_id ? "b:" + note.band_id : "future";
  function edit(v: string) {
    setBody(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onEdit(v), 600);
  }
  return (
    <div className="tl-pinnote" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="tl-pin-top">
        <select className="tl-pick" value={pinVal} onChange={(e) => onPin(e.target.value)}>
          {chapters.map((c) => <option key={c.id} value={"c:" + c.id}>📖 ch {c.manuscript_order}</option>)}
          {bands.map((b) => <option key={b.id} value={"b:" + b.id}>▦ {b.name}</option>)}
          <option value="future">🗓 future</option>
        </select>
        <span className="tl-bandx" title="Delete note" onClick={onDelete}>✕</span>
      </div>
      <input className="tl-pin-body" value={body} placeholder="a note…" onChange={(e) => edit(e.target.value)}
        onBlur={() => { window.clearTimeout(timer.current); if (body !== note.body) onEdit(body); }} />
    </div>
  );
}
