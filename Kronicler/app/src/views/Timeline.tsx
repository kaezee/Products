import { useEffect, useRef, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand, setChapterBand,
  getChapters, getNotes, updateNote,
} from "../lib/api";
import type { Band, Chapter, Note } from "../lib/types";
import type { Nav } from "../App";

// The Timeline: an actual horizontal axis you can pan and zoom like a canvas.
// Chapters are stops along a line (left → future); BANDS are colored spans above
// it ("Novel 1", "Season 4"); planned 🗓 beats trail to the right. Zoom out to
// see the whole shape as dots; zoom in and chapter titles appear (level of
// detail). (Multi-select banding, band time-frames, and note-pinning are next.)

const COL = 158;          // horizontal space per chapter stop
const FUTURE_GAP = 40;
const BAND_TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];
const MIN_SCALE = 0.2, MAX_SCALE = 2, FIT_PAD = 50;
const DETAIL = 0.6;       // below this zoom, hide titles (just dots + numbers)

interface View { tx: number; ty: number; s: number }

export function Timeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [bands, setBands] = useState<Band[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ tx: 24, ty: 16, s: 1 });
  const [panning, setPanning] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view); viewRef.current = view;
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
  const indexById = new Map(ordered.map((c, i) => [c.id, i]));
  const tintOf = (b: Band, i: number) => b.color || BAND_TINTS[i % BAND_TINTS.length];
  const spanOf = (bandId: string): [number, number] | null => {
    const idxs = ordered.filter((c) => c.band_id === bandId).map((c) => indexById.get(c.id)!);
    return idxs.length ? [Math.min(...idxs), Math.max(...idxs)] : null;
  };
  const plannedNotes = notes.filter((n) => n.plan_ref);
  const emptyBands = bands.filter((b) => spanOf(b.id) === null);
  const axisWidth = Math.max(ordered.length * COL, 300);
  const futureX = axisWidth + FUTURE_GAP;
  const contentW = futureX + 260, contentH = 210;

  // ── pan / zoom (same engine as the Notes canvas) ────────────────────────
  function startPan(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".tl-card, .tl-note-bead, .tl-bandbar, .tl-mini, select, input, button")) return;
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

  async function addBand() {
    const order = bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0;
    try { const b = await createBand(worldId, `Band ${bands.length + 1}`, order); setBands((p) => [...p, b]); }
    catch (x) { setErr(String(x)); }
  }
  async function rename(b: Band, name: string) {
    setBands((prev) => prev.map((x) => x.id === b.id ? { ...x, name } : x));
    try { await updateBand(b.id, { name: name.trim() || "Untitled" }); } catch (x) { setErr(String(x)); }
  }
  async function removeBand(b: Band) {
    if (!confirm(`Delete band "${b.name}"? Its chapters stay on the line, just unbanded — nothing is lost.`)) return;
    try { await softDeleteBand(b.id); setBands((p) => p.filter((x) => x.id !== b.id)); } catch (x) { setErr(String(x)); }
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

  const detail = view.s >= DETAIL;
  const bandPicker = (value: string | null, onPick: (id: string | null) => void) => (
    <select className="tl-pick" value={value ?? ""} onChange={(e) => onPick(e.target.value || null)} onMouseDown={(e) => e.stopPropagation()}>
      <option value="">unbanded</option>
      {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag to pan · scroll to zoom · titles appear as you zoom in</span>
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
              {/* band ribbon */}
              <div className="tl-ribbon">
                {bands.map((b) => {
                  const span = spanOf(b.id);
                  if (!span) return null;
                  const i = bands.indexOf(b);
                  const left = span[0] * COL + 6, width = (span[1] - span[0] + 1) * COL - 12, tint = tintOf(b, i);
                  return (
                    <div key={b.id} className="tl-bandbar" style={{ left, width, background: tint + "26", borderColor: tint }}>
                      <input className="tl-bandname" value={b.name} style={{ color: tint }} onChange={(e) => rename(b, e.target.value)} />
                      <span className="tl-bandx" title="Delete band" onClick={() => removeBand(b)}>✕</span>
                    </div>
                  );
                })}
                {(emptyBands.length > 0 || plannedNotes.length > 0) && (
                  <div className="tl-bandbar tl-future-label" style={{ left: futureX, width: 240, background: "var(--obligationBg)", borderColor: "#e0c89a" }}>
                    <span style={{ color: "var(--obligation)", fontFamily: "var(--serif)", fontSize: 13 }}>🗓 Planned &amp; future</span>
                  </div>
                )}
              </div>

              <div className="tl-axis" style={{ width: futureX + 240 }} />

              {ordered.map((c, i) => {
                const band = bands.find((b) => b.id === c.band_id && bandIds.has(b.id));
                const tint = band ? tintOf(band, bands.indexOf(band)) : "var(--lineStrong)";
                return (
                  <div key={c.id} className="tl-stop" style={{ left: i * COL }}>
                    {detail ? (
                      <div className="tl-card" onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                        <div className="tl-card-top">
                          <span className="tl-ch-no">{String(c.manuscript_order).padStart(2, "0")}</span>
                          {bandPicker(c.band_id, (id) => assignChapter(c.id, id))}
                        </div>
                        <div className="tl-ch-title">{c.title}</div>
                      </div>
                    ) : (
                      <div className="tl-mini" style={{ borderColor: tint }} title={c.title}
                        onClick={() => go({ scope: "manuscript", chapterId: c.id })}>{c.manuscript_order}</div>
                    )}
                    <div className="tl-stem" />
                    <div className="tl-dot" style={{ background: tint, borderColor: tint }} />
                  </div>
                );
              })}

              {plannedNotes.map((n, i) => (
                <div key={n.id} className="tl-stop" style={{ left: futureX + i * 128 }}>
                  {detail ? (
                    <div className="tl-note-bead" title={n.body || ""}>
                      <div className="tl-card-top"><span className="tl-note-mark">🗓</span>{bandPicker(n.band_id, (id) => assignNote(n.id, id))}</div>
                      <div className="tl-note-body">{n.plan_ref}</div>
                    </div>
                  ) : (
                    <div className="tl-mini tl-mini-future" title={n.plan_ref ?? ""}>🗓</div>
                  )}
                  <div className="tl-stem tl-stem-future" />
                  <div className="tl-dot tl-dot-future" />
                </div>
              ))}
            </div>
          </div>

          <div className="canvas-zoom">
            <button title="Fit whole timeline" onClick={fitView}>⤢</button>
            <span className="zoom-sep" />
            <button title="Zoom out" onClick={() => zoomButton(-1)}>−</button>
            <span className="zoom-pct" title="Reset to 100%" onClick={() => setView({ tx: 24, ty: 16, s: 1 })}>{Math.round(view.s * 100)}%</span>
            <button title="Zoom in" onClick={() => zoomButton(1)}>+</button>
          </div>
        </div>
      )}

      {emptyBands.length > 0 && (
        <div className="row" style={{ borderBottom: "none", padding: "10px 2px 0", gap: 8, flexWrap: "wrap" }}>
          <span className="faint" style={{ fontSize: 11 }}>empty bands (assign chapters to place them on the line):</span>
          {emptyBands.map((b) => (
            <span key={b.id} className="chip" style={{ borderColor: tintOf(b, bands.indexOf(b)), color: tintOf(b, bands.indexOf(b)) }}>
              <input className="tl-bandname" value={b.name} style={{ width: 90, color: "inherit" }} onChange={(e) => rename(b, e.target.value)} />
              <span className="tl-bandx" onClick={() => removeBand(b)}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
