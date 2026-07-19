import { useEffect, useRef, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand, setChapterBand,
  getChapters, getNotes, createNote, updateNote, softDeleteNote,
  getEntities, getStream, getEntityChapters,
} from "../lib/api";
import type { Band, Chapter, Note, Entity, StreamRow } from "../lib/types";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";
import { isBelief } from "../lib/knowledge";

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
  const [entities, setEntities] = useState<Entity[]>([]);
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [followId, setFollowId] = useState<string>("");
  const [appears, setAppears] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>({ tx: 24, ty: 24, s: 1 });
  const [panning, setPanning] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const noteDragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  async function reload() {
    try {
      const [b, c, n, e, s] = await Promise.all([getBands(worldId), getChapters(worldId), getNotes(worldId), getEntities(worldId), getStream(worldId)]);
      setBands(b.sort((x, y) => x.band_order - y.band_order)); setChapters(c); setNotes(n); setEntities(e); setStream(s);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); void reload(); /* eslint-disable-next-line */ }, [worldId]);

  // when following a character, load the chapters they appear in (to light them)
  useEffect(() => {
    if (!followId) { setAppears(new Set()); return; }
    let live = true;
    getEntityChapters(followId).then((cs) => { if (live) setAppears(new Set(cs.map((c) => c.chapter_id))); }).catch(() => {});
    return () => { live = false; };
  }, [followId]);

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

  // Character drill-down: the followed character's relationship beats (truth
  // only), anchored to the chapters they happen in, in story order → an arc.
  const characters = entities.filter((e) => e.type === "Character");
  const ARC_Y = 122;
  const beats = !followId ? [] : stream
    .filter((s) => !isBelief(s) && s.manuscript_ref && chapterX.has(s.manuscript_ref) && s.manuscript_order != null && s.participants.some((p) => p.entity_id === followId))
    .map((s) => ({
      x: chapterX.get(s.manuscript_ref!)!, valence: s.valence, order: s.manuscript_order!,
      label: s.type_label, other: s.participants.find((p) => p.entity_id !== followId)?.title ?? "",
    }))
    .sort((a, b) => a.order - b.order);
  const dimCh = (id: string) => followId !== "" && !appears.has(id);

  // Timeline notes: freely draggable (their x/y is where they sit). A note keeps
  // an optional anchor (chapter / band / future); when anchored, a connector runs
  // from the note to that point on the line. Legacy notes at the default (40,40)
  // fall back to a tidy stacked position under their anchor until first dragged.
  const anchorXof = (n: Note): number | null => {
    const chId = n.chapter_ids?.[0];
    if (chId && chapterX.has(chId)) return chapterX.get(chId)!;
    if (n.band_id && bandCenterX.has(n.band_id)) return bandCenterX.get(n.band_id)!;
    if (n.plan_ref) return futureX + 40;
    return null;
  };
  const stackAt = new Map<number, number>();
  const noteEls = notes.filter((n) => n.on_timeline).map((n) => {
    const ax = anchorXof(n);
    const positioned = !(n.x === 40 && n.y === 40);
    if (positioned) return { note: n, px: n.x, py: n.y, ax };
    const base = ax ?? futureX + 40;
    const key = Math.round(base / 8);
    const s = stackAt.get(key) ?? 0; stackAt.set(key, s + 1);
    return { note: n, px: base - 64, py: NOTE_TOP + s * STACK, ax };
  });
  const emptyBands = bands.filter((b) => !ordered.some((c) => c.band_id === b.id));
  const maxY = noteEls.reduce((m, e) => Math.max(m, e.py), NOTE_TOP);
  const maxX = noteEls.reduce((m, e) => Math.max(m, e.px + 128), futureX + 60);
  const contentW = Math.max(maxX + 40, 360);
  const contentH = maxY + NOTE_H + 20;

  // ── pan / zoom ──────────────────────────────────────────────────────────
  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".tl-card, .tl-summary, .tl-bandbar, .tl-pinnote, select, input, button")) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    setPanning(true);
  }
  function toWorld(cx: number, cy: number) {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s };
  }
  function startNoteDrag(note: Note, curX: number, curY: number, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    noteDragRef.current = { id: note.id, offX: w.x - curX, offY: w.y - curY };
  }
  function onMove(e: React.MouseEvent) {
    if (noteDragRef.current) {
      const d = noteDragRef.current, w = toWorld(e.clientX, e.clientY);
      const nx = Math.round(w.x - d.offX), ny = Math.round(w.y - d.offY);
      setNotes((prev) => prev.map((n) => n.id === d.id ? { ...n, x: nx, y: ny } : n));
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
    }
  }
  function endPan() {
    const nd = noteDragRef.current; noteDragRef.current = null;
    panRef.current = null; setPanning(false);
    if (nd) {
      const n = notes.find((x) => x.id === nd.id);
      if (n) updateNote(n.id, { x: n.x, y: n.y }).catch((x) => setErr(String(x)));
    }
  }
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
  function onChapterClick(c: Chapter, e: React.MouseEvent) {
    if (!selecting) { go({ scope: "manuscript", chapterId: c.id }); return; }
    e.stopPropagation();
    if (e.shiftKey && anchorRef.current) {
      const ai = ordered.findIndex((x) => x.id === anchorRef.current);
      const ci = ordered.findIndex((x) => x.id === c.id);
      if (ai >= 0 && ci >= 0) {
        const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai];
        setSelected((prev) => { const n = new Set(prev); for (let i = lo; i <= hi; i++) n.add(ordered[i].id); return n; });
      }
    } else {
      setSelected((prev) => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; });
      anchorRef.current = c.id;
    }
  }
  async function assignMany(bandId: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setChapters((prev) => prev.map((c) => selected.has(c.id) ? { ...c, band_id: bandId } : c));
    setSelected(new Set()); anchorRef.current = null;
    try { await Promise.all(ids.map((id) => setChapterBand(id, bandId))); } catch (x) { setErr(String(x)); }
  }
  async function newBandFromSelection() {
    if (selected.size === 0) return;
    try {
      const order = bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0;
      const b = await createBand(worldId, `Season ${bands.length + 1}`, order);
      setBands((p) => [...p, b]);
      await assignMany(b.id);
    } catch (x) { setErr(String(x)); }
  }
  async function addNote() {
    try {
      // drop it near the centre of the current view, on the timeline
      const r = boardRef.current?.getBoundingClientRect();
      const c = r ? toWorld(r.left + r.width / 2 - 64 * view.s, r.top + r.height * 0.55) : { x: 80, y: 200 };
      const px = Math.round(c.x), py = Math.max(NOTE_TOP, Math.round(c.y));
      const n = await createNote(worldId, px, py, true);
      const anchor: Partial<Note> = ordered[0] ? { chapter_ids: [ordered[0].id] } : { plan_ref: "planned" };
      await updateNote(n.id, { body: "New note", ...anchor });
      setNotes((p) => [...p, { ...n, body: "New note", on_timeline: true, ...anchor } as Note]);
    } catch (x) { setErr(String(x)); }
  }
  function patchNoteLocal(id: string, patch: Partial<Note>) {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
  }
  async function pinNote(noteId: string, sel: string) {
    const patch: Partial<Note> = sel.startsWith("c:") ? { chapter_ids: [sel.slice(2)], band_id: null, plan_ref: null }
      : sel.startsWith("b:") ? { band_id: sel.slice(2), chapter_ids: [], plan_ref: null }
        : sel === "free" ? { chapter_ids: [], band_id: null, plan_ref: null }
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
  const chapterStop = (c: Chapter, left: number, tint: string) => {
    const dim = dimCh(c.id);
    return (
      <div key={c.id} style={dim ? { opacity: 0.28 } : undefined}>
        <div className={"tl-card" + (selected.has(c.id) ? " sel" : "")} style={{ left: left + 6 }} onClick={(e) => onChapterClick(c, e)}>
          <div className="tl-card-top">
            <span className="tl-ch-no">{selecting ? (selected.has(c.id) ? "☑" : "☐") : String(c.manuscript_order).padStart(2, "0")}</span>
            {selecting ? <span className="tl-ch-no">{String(c.manuscript_order).padStart(2, "0")}</span> : picker(c.band_id, (id) => assignChapter(c.id, id))}
          </div>
          <div className="tl-ch-title">{c.title}</div>
        </div>
        <div className="tl-stem" style={{ left: left + COL / 2 }} />
        <div className="tl-dot" style={{ left: left + COL / 2 - DOTC, background: tint, borderColor: tint }} />
      </div>
    );
  };

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag to pan · scroll to zoom · click a band to open/close · notes pin below the line</span>
        <span className="spacer" />
        {characters.length > 0 && (
          <select className={"sel" + (followId ? " " : "")} value={followId} onChange={(e) => setFollowId(e.target.value)}
            style={followId ? { borderColor: "var(--bond)", color: "var(--bond)" } : undefined} title="Trace one character's arc across the line">
            <option value="">Follow a character…</option>
            {characters.map((e) => <option key={e.id} value={e.id}>◇ {e.title}</option>)}
          </select>
        )}
        <button className={selecting ? "primary" : ""} onClick={() => { setSelecting((v) => !v); setSelected(new Set()); anchorRef.current = null; }}>
          {selecting ? "Done selecting" : "☑ Select"}
        </button>
        <button onClick={addNote}>+ Note</button>
        <button onClick={addBand}>+ Band</button>
      </div>

      {followId && (
        <div className="tl-selbar" style={{ borderColor: "var(--bond)" }}>
          <span style={{ fontWeight: 600, color: "var(--bond)" }}>◇ {characters.find((c) => c.id === followId)?.title}</span>
          <span className="faint" style={{ fontSize: 11 }}>{beats.length} relationship beat{beats.length === 1 ? "" : "s"} on the line · their chapters lit, arc coloured by valence</span>
          <span className="spacer" />
          <button onClick={() => setFollowId("")}>Stop following</button>
        </div>
      )}

      {selecting && (
        <div className="tl-selbar">
          <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
          <span className="faint" style={{ fontSize: 11 }}>click chapters to pick · shift-click for a range</span>
          <span className="spacer" />
          <select className="sel" value="" disabled={selected.size === 0} onChange={(e) => e.target.value && assignMany(e.target.value === "__none" ? null : e.target.value)}>
            <option value="">assign to band…</option>
            {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="__none">— unband</option>
          </select>
          <button disabled={selected.size === 0} onClick={newBandFromSelection}>＋ New band</button>
          <button disabled={selected.size === 0} onClick={() => { setSelected(new Set()); anchorRef.current = null; }}>Clear</button>
        </div>
      )}

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
                const bandDim = followId !== "" && !exp && !chs.some((c) => appears.has(c.id));
                return (
                  <div key={band.id} style={bandDim ? { opacity: 0.32 } : undefined}>
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

              {/* the followed character's arc, threaded through their chapters */}
              {followId && beats.length > 0 && (
                <svg className="tl-arc" width={contentW} height={contentH} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
                  {beats.slice(1).map((b, i) => (
                    <line key={"l" + i} x1={beats[i].x} y1={ARC_Y} x2={b.x} y2={ARC_Y}
                      stroke={VALENCE_COLOR[b.valence]} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
                  ))}
                  {beats.map((b, i) => (
                    <circle key={"c" + i} cx={b.x} cy={ARC_Y} r={5} fill={VALENCE_COLOR[b.valence]} stroke="#fff" strokeWidth={1.5} style={{ pointerEvents: "auto" }}>
                      <title>{`${b.label}${b.other ? " · " + b.other : ""} — ch ${b.order}`}</title>
                    </circle>
                  ))}
                </svg>
              )}

              {/* connectors from anchored notes to their point on the line */}
              <svg width={contentW} height={contentH} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
                {noteEls.filter((e) => e.ax != null).map((e) => (
                  <g key={e.note.id}>
                    <line x1={e.ax!} y1={AXIS_Y} x2={e.px + 64} y2={e.py} stroke="var(--muted)" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                    <circle cx={e.ax!} cy={AXIS_Y} r={4} fill="var(--sub)" />
                  </g>
                ))}
              </svg>

              {/* draggable timeline notes */}
              {noteEls.map(({ note, px, py, ax }) => (
                <PinnedNote key={note.id} note={note} left={px} top={py} pinned={ax != null} bands={bands} chapters={ordered}
                  onDragStart={(e) => startNoteDrag(note, px, py, e)}
                  onPin={(sel) => pinNote(note.id, sel)} onEdit={(b) => editNoteBody(note.id, b)} onDelete={() => deleteNote(note.id)} />
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

// A note on the timeline canvas: drag it anywhere by the grip, edit its text,
// choose whether it's attached (pinned to a chapter / band / future — a
// connector shows) or free, or delete it.
function PinnedNote({ note, left, top, pinned, bands, chapters, onDragStart, onPin, onEdit, onDelete }: {
  note: Note;
  left: number; top: number; pinned: boolean;
  bands: Band[]; chapters: Chapter[];
  onDragStart: (e: React.MouseEvent) => void;
  onPin: (sel: string) => void;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(note.body || note.plan_ref || "");
  const timer = useRef<number | undefined>(undefined);
  const pinVal = note.chapter_ids?.[0] ? "c:" + note.chapter_ids[0] : note.band_id ? "b:" + note.band_id : note.plan_ref ? "future" : "free";
  function edit(v: string) {
    setBody(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onEdit(v), 600);
  }
  return (
    <div className={"tl-pinnote" + (pinned ? "" : " free")} style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="tl-pin-top">
        <span className="tl-pin-grip" title="Drag to move" onMouseDown={onDragStart}>⠿</span>
        <select className="tl-pick" value={pinVal} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => onPin(e.target.value)}>
          {chapters.map((c) => <option key={c.id} value={"c:" + c.id}>📖 ch {c.manuscript_order}</option>)}
          {bands.map((b) => <option key={b.id} value={"b:" + b.id}>▦ {b.name}</option>)}
          <option value="future">🗓 future</option>
          <option value="free">○ free (no line)</option>
        </select>
        <span className="tl-bandx" title="Delete note" onClick={onDelete}>✕</span>
      </div>
      <input className="tl-pin-body" value={body} placeholder="a note…" onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => edit(e.target.value)}
        onBlur={() => { window.clearTimeout(timer.current); if (body !== note.body) onEdit(body); }} />
    </div>
  );
}
