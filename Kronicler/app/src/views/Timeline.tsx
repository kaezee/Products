import { useEffect, useRef, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand, setChapterBand,
  getChapters, getNotes, updateNote,
} from "../lib/api";
import type { Band, Chapter, Note } from "../lib/types";
import type { Nav } from "../App";

// The Timeline: a pan/zoom canvas with a horizontal time spine. Chapters are
// stops on the line; a BAND (a season / novel) collapses to one block —
// "ch 1–22 · Season 1" — and expands to its chapters on click. Unbanded chapters
// stand alone on the line; planned 🗓 beats trail into the future.

const COL = 158, BAND_W = 214, GAP = 14, DOTC = 5.5;
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

  // Lay the spine out left → right as a sequence of segments: a band (collapsed
  // block or expanded run of chapters) or a lone unbanded chapter.
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
  const plannedNotes = notes.filter((n) => n.plan_ref);
  const futureX = spineW + 30;
  const emptyBands = bands.filter((b) => !ordered.some((c) => c.band_id === b.id));
  const contentW = futureX + (plannedNotes.length ? plannedNotes.length * 128 + 40 : 40);
  const contentH = 200;

  // ── pan / zoom (Notes canvas engine) ────────────────────────────────────
  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".tl-card, .tl-note-bead, .tl-bandbar, .tl-summary, select, input, button")) return;
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
  async function rename(b: Band, name: string) {
    setBands((prev) => prev.map((z) => z.id === b.id ? { ...z, name } : z));
    try { await updateBand(b.id, { name: name.trim() || "Untitled" }); } catch (x) { setErr(String(x)); }
  }
  async function removeBand(b: Band) {
    if (!confirm(`Delete band "${b.name}"? Its chapters stay on the line, just unbanded — nothing is lost.`)) return;
    try { await softDeleteBand(b.id); setBands((p) => p.filter((z) => z.id !== b.id)); } catch (x) { setErr(String(x)); }
  }
  async function assignChapter(chapterId: string, bandId: string | null) {
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, band_id: bandId } : c));
    try { await setChapterBand(chapterId, bandId); } catch (x) { setErr(String(x)); }
  }
  async function assignNote(noteId: string, bandId: string | null) {
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, band_id: bandId } : n));
    try { await updateNote(noteId, { band_id: bandId }); } catch (x) { setErr(String(x)); }
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
        <span className="faint" style={{ fontSize: 11 }}>drag to pan · scroll to zoom · click a band to expand its chapters</span>
        <span className="spacer" />
        <button onClick={addBand}>+ Band</button>
      </div>

      {ordered.length === 0 && plannedNotes.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">No chapters yet — write some in the Manuscript, then group them into bands here.</span></div></div>
      ) : (
        <div ref={boardRef} className={"notes-board" + (panning ? " panning" : "")}
          onMouseDown={startPan} onMouseMove={onMove} onMouseUp={endPan} onMouseLeave={endPan}>
          <div className="notes-canvas" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: "0 0" }}>
            <div className="tl-inner" style={{ width: contentW }}>
              <div className="tl-axis" style={{ width: contentW - 20 }} />

              {segs.map((seg) => {
                if (seg.kind === "chapter") return chapterStop(seg.chapter, seg.x, "var(--lineStrong)");
                const { band, chs, x: sx, w, exp, tint } = seg;
                const first = chs[0].manuscript_order, last = chs[chs.length - 1].manuscript_order;
                return (
                  <div key={band.id}>
                    <div className="tl-bandbar" style={{ left: sx, width: w, background: tint + "26", borderColor: tint }}>
                      <span className="tl-band-toggle" title={exp ? "Collapse" : "Expand chapters"} onClick={() => toggle(band.id)}>{exp ? "▾" : "▸"}</span>
                      <input className="tl-bandname" value={band.name} style={{ color: tint }} onChange={(e) => rename(band, e.target.value)} />
                      <span className="tl-bandx" title="Delete band" onClick={() => removeBand(band)}>✕</span>
                    </div>
                    {exp ? (
                      chs.map((c, i) => chapterStop(c, sx + i * COL, tint))
                    ) : (
                      <>
                        <div className="tl-summary" style={{ left: sx + 4, width: w - 8, borderColor: tint }} onClick={() => toggle(band.id)}>
                          <div className="tl-sum-range" style={{ color: tint }}>ch {first}{last !== first ? `–${last}` : ""}</div>
                          <div className="tl-sum-count">{chs.length} chapter{chs.length > 1 ? "s" : ""} · click to open</div>
                        </div>
                        <div className="tl-stem" style={{ left: sx + w / 2 }} />
                        <div className="tl-dot" style={{ left: sx + w / 2 - DOTC, background: tint, borderColor: tint }} />
                      </>
                    )}
                  </div>
                );
              })}

              {plannedNotes.map((n, i) => (
                <div key={n.id}>
                  <div className="tl-note-bead" style={{ left: futureX + i * 128 }} title={n.body || ""}>
                    <div className="tl-card-top"><span className="tl-note-mark">🗓</span>{picker(n.band_id, (id) => assignNote(n.id, id))}</div>
                    <div className="tl-note-body">{n.plan_ref}</div>
                  </div>
                  <div className="tl-stem tl-stem-future" style={{ left: futureX + i * 128 + 59 }} />
                  <div className="tl-dot tl-dot-future" style={{ left: futureX + i * 128 + 59 - DOTC }} />
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
              <input className="tl-bandname" value={b.name} style={{ width: 90, color: "inherit" }} onChange={(e) => rename(b, e.target.value)} />
              <span className="tl-bandx" onClick={() => removeBand(b)}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
