import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSegments, createSegment, updateSegment, softDeleteSegment, setChapterSegment,
  getChapters, getMarkers, createMarker, softDeleteMarker,
} from "../lib/api";
import type { Segment, Chapter, TimelineMarker } from "../lib/types";
import type { Nav } from "../App";
import { parseStoryTime } from "../lib/time";

// The World Timeline: an infinite, pannable canvas with a year-ruler. SEGMENTS
// (Series / Book / Season / Volume — nested any depth, writer's labels) are
// span-bars whose reach auto-fits their chapters + children. CHAPTERS ride as
// small squares at their in-world date (undated ones spread across the segment).
// Drag to pan in any direction, scroll to zoom time. Double-click to draw a
// segment. Chapters not on the line wait in the collapsible right sidebar, where
// you can bulk-select and drop them into a segment.

const BAR_H = 8, LABEL_H = 16, CH_ROW = 34, CH_SQ = 30, PAD_Y = 28;
const MIN_PPY = 0.002, MAX_PPY = 240;
const KIND_TINT: Record<string, string> = { series: "#8a6fb0", book: "#5b8ab0", season: "#5b8ab0", volume: "#5f9a6a" };

interface View { start: number; ppy: number; ty: number }   // year at x=0, px/year, vertical pan
type Span = [number, number];

export function WorldTimeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ start: 0, ppy: 1, ty: 0 });
  const [fitDone, setFitDone] = useState(false);
  const [nowW, setNowW] = useState(900);
  const [sideOpen, setSideOpen] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkSeg, setBulkSeg] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteYear, setNoteYear] = useState(""); const [noteText, setNoteText] = useState("");
  const viewRef = useRef(view); viewRef.current = view;

  const [adding, setAdding] = useState(false);
  const [fName, setFName] = useState(""); const [fKind, setFKind] = useState("series");
  const [fParent, setFParent] = useState(""); const [fStart, setFStart] = useState(""); const [fEnd, setFEnd] = useState("");

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; start: number; ty: number } | null>(null);
  const resizeRef = useRef<{ id: string; edge: "start" | "end" } | null>(null);

  async function reload() {
    try {
      const [s, c, m] = await Promise.all([getSegments(worldId), getChapters(worldId), getMarkers(worldId)]);
      setSegments(s); setChapters(c); setMarkers(m);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); setFitDone(false); void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Segment[]>();
    for (const s of segments) { const k = s.parent_id; (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    for (const arr of m.values()) arr.sort((a, b) => a.seg_order - b.seg_order);
    return m;
  }, [segments]);

  const chaptersBySeg = useMemo(() => {
    const m = new Map<string, Chapter[]>();
    for (const c of chapters) if (c.segment_id) (m.get(c.segment_id) ?? m.set(c.segment_id, []).get(c.segment_id)!).push(c);
    for (const arr of m.values()) arr.sort((a, b) => a.manuscript_order - b.manuscript_order);
    return m;
  }, [chapters]);

  // effective span: hug dated chapters AND children, else the drawn manual range
  const spanOf = useMemo(() => {
    const cache = new Map<string, Span | null>();
    const compute = (s: Segment, seen: Set<string>): Span | null => {
      if (cache.has(s.id)) return cache.get(s.id)!;
      if (seen.has(s.id)) return null; seen.add(s.id);
      const vals: number[] = [];
      for (const c of chaptersBySeg.get(s.id) ?? []) if (c.story_time_ref != null) vals.push(c.story_time_ref);
      for (const ch of childrenOf.get(s.id) ?? []) { const cs = compute(ch, seen); if (cs) vals.push(cs[0], cs[1]); }
      let span: Span | null = vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
      if (!span && s.start_ref != null) span = [s.start_ref, s.end_ref ?? s.start_ref];
      else if (span && s.start_ref != null) span = [Math.min(span[0], s.start_ref), Math.max(span[1], s.end_ref ?? s.start_ref)];
      cache.set(s.id, span); return span;
    };
    return (s: Segment) => compute(s, new Set());
  }, [chaptersBySeg, childrenOf]);

  const rows = useMemo(() => {
    const out: { seg: Segment; depth: number; y: number; hasCh: boolean }[] = [];
    let y = PAD_Y;
    const walk = (parent: string | null, depth: number) => {
      for (const s of childrenOf.get(parent) ?? []) {
        const hasCh = (chaptersBySeg.get(s.id) ?? []).length > 0;
        out.push({ seg: s, depth, y, hasCh });
        y += LABEL_H + BAR_H + 6 + (hasCh ? CH_ROW : 0);
        walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [childrenOf, chaptersBySeg]);

  const unfiled = useMemo(() => chapters.filter((c) => !c.segment_id), [chapters]);

  const domain = useMemo(() => {
    const vals: number[] = [];
    for (const s of segments) { const sp = spanOf(s); if (sp) vals.push(sp[0], sp[1]); }
    if (!vals.length) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 5; hi += 5; }
    return { lo, hi };
  }, [segments, spanOf]);

  useEffect(() => {
    if (fitDone || loading) return;
    const w = boardRef.current?.clientWidth ?? nowW; setNowW(w);
    if (domain) {
      const span = (domain.hi - domain.lo) * 1.15 || 100;
      const ppy = Math.min(MAX_PPY, Math.max(MIN_PPY, w / span));
      setView({ start: domain.lo - (domain.hi - domain.lo) * 0.07 - 2, ppy, ty: 0 });
    }
    setFitDone(true);
  }, [domain, loading, fitDone, nowW]);

  const xOf = (year: number) => (year - view.start) * view.ppy;
  const yearOf = (px: number) => view.start + px / view.ppy;
  const localX = (clientX: number) => clientX - (boardRef.current?.getBoundingClientRect().left ?? 0);
  const ticks = useMemo(() => niceTicks(yearOf(0), yearOf(nowW), Math.max(3, Math.round(nowW / 130))), [view, nowW]);

  // one stable wheel listener (reads live view via ref → no re-subscribe jank).
  // Trackpad two-finger scroll pans; ⌘/ctrl-scroll (or pinch) zooms smoothly.
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const lx = localX(e.clientX), yr = v.start + lx / v.ppy;
        const ppy = clamp(v.ppy * Math.exp(-e.deltaY * 0.01), MIN_PPY, MAX_PPY);
        setView({ ...v, ppy, start: yr - lx / ppy });
      } else {
        setView({ ...v, start: v.start + e.deltaX / v.ppy, ty: v.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => setNowW(el.clientWidth));
    ro.observe(el);
    return () => { el.removeEventListener("wheel", onWheel); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomBy(factor: number) {
    setView((v) => { const lx = nowW / 2, yr = v.start + lx / v.ppy; const ppy = clamp(v.ppy * factor, MIN_PPY, MAX_PPY); return { ...v, ppy, start: yr - lx / ppy }; });
  }
  function fitView() {
    const w = boardRef.current?.clientWidth ?? nowW;
    if (!domain) { setView({ start: 0, ppy: 1, ty: 0 }); return; }
    const span = (domain.hi - domain.lo) * 1.15 || 100;
    setView({ start: domain.lo - (domain.hi - domain.lo) * 0.07 - 2, ppy: clamp(w / span, MIN_PPY, MAX_PPY), ty: 0 });
  }

  function onDown(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    const handle = t.closest("[data-edge]") as HTMLElement | null;
    if (handle) { resizeRef.current = { id: handle.dataset.seg!, edge: handle.dataset.edge as "start" | "end" }; e.preventDefault(); return; }
    if (t.closest(".wt2-seglab, .wt2-ch, .wt2-note, button, input, select")) return;
    panRef.current = { x: e.clientX, y: e.clientY, start: view.start, ty: view.ty };
  }
  function onMove(e: React.MouseEvent) {
    if (resizeRef.current) {
      const yr = Math.round(yearOf(localX(e.clientX))); const r = resizeRef.current;
      setSegments((prev) => prev.map((s) => s.id === r.id ? { ...s, ...(r.edge === "start" ? { start_ref: yr } : { end_ref: yr }) } : s));
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => ({ ...v, start: p.start - (e.clientX - p.x) / v.ppy, ty: p.ty + (e.clientY - p.y) }));
    }
  }
  function onUp() {
    const r = resizeRef.current; resizeRef.current = null; panRef.current = null;
    if (r) { const s = segments.find((z) => z.id === r.id); if (s) updateSegment(s.id, { start_ref: s.start_ref, end_ref: s.end_ref }).catch((x) => setErr(String(x))); }
  }
  function onDouble(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".wt2-seglab, .wt2-ch, .wt2-note, button, input, select")) return;
    const yr = Math.round(yearOf(localX(e.clientX)));
    setFName(""); setFKind("series"); setFParent(""); setFStart(String(yr)); setFEnd(String(yr + 100)); setAdding(true);
  }

  async function submitAdd() {
    if (!fName.trim()) { setErr("Name the segment."); return; }
    try {
      const sibs = segments.filter((s) => (s.parent_id ?? "") === fParent);
      await createSegment(worldId, { parent_id: fParent || null, kind: fKind.trim() || "segment", name: fName.trim(),
        seg_order: sibs.length, start_ref: fStart.trim() ? parseStoryTime(fStart) : null, end_ref: fEnd.trim() ? parseStoryTime(fEnd) : null });
      setAdding(false); setErr(null); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function delSeg(s: Segment) {
    if (!confirm(`Delete "${s.name}" and its nested segments? Chapters return to the sidebar. Recoverable.`)) return;
    try { await softDeleteSegment(s.id); await reload(); } catch (x) { setErr(String(x)); }
  }
  async function addSelectedTo(segId: string) {
    const ids = [...sel]; if (!ids.length || !segId) return;
    try { await Promise.all(ids.map((id) => setChapterSegment(id, segId))); setSel(new Set()); setBulkSeg(""); await reload(); }
    catch (x) { setErr(String(x)); }
  }
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function addNote() {
    if (!noteText.trim()) { setNoteOpen(false); return; }
    try {
      const yr = noteYear.trim() ? parseStoryTime(noteYear) : null;
      await createMarker(worldId, { kind: "note", label: noteText.trim(), story_time_ref: yr, story_time_label: noteYear.trim() || null });
      setNoteText(""); setNoteYear(""); setNoteOpen(false); setErr(null); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function delMarker(id: string) { try { await softDeleteMarker(id); await reload(); } catch (x) { setErr(String(x)); } }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading world timeline…</p>;

  const tintOf = (s: Segment) => s.color || KIND_TINT[s.kind] || "#7a7ab0";

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
        <h2 className="scope-title" style={{ margin: 0 }}>World Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>drag or scroll to pan · ⌘/ctrl-scroll (or pinch) to zoom · double-click to draw a segment · drag a bar's ends to resize</span>
        <span className="spacer" />
        <span className="seg" style={{ fontSize: 13 }}>
          <span onClick={() => zoomBy(1 / 1.35)} title="Zoom out">−</span>
          <span onClick={fitView} title="Fit everything" style={{ fontSize: 12 }}>Fit</span>
          <span onClick={() => zoomBy(1.35)} title="Zoom in">+</span>
        </span>
        <button onClick={() => { setNoteText(""); setNoteYear(String(Math.round(yearOf(nowW / 2)))); setNoteOpen(true); }}>+ Note</button>
        <button onClick={() => { const yr = Math.round(yearOf(nowW / 2)); setFName(""); setFKind("series"); setFParent(""); setFStart(String(yr)); setFEnd(String(yr + 100)); setAdding(true); }}>+ Segment</button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus placeholder="Name (e.g. Against the Rot)" value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: 200 }} />
          <input list="wt2-kinds" value={fKind} onChange={(e) => setFKind(e.target.value)} style={{ width: 110 }} title="What is it — your label" />
          <datalist id="wt2-kinds"><option value="series" /><option value="book" /><option value="season" /><option value="volume" /></datalist>
          <select className="sel" value={fParent} onChange={(e) => setFParent(e.target.value)} style={{ width: 170 }}>
            <option value="">top level (no parent)</option>
            {segments.map((s) => <option key={s.id} value={s.id}>↳ inside {s.name}</option>)}
          </select>
          <input placeholder="start yr" value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ width: 84 }} />
          <span className="muted">→</span>
          <input placeholder="end yr" value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ width: 84 }} />
          <button className="primary" onClick={submitAdd}>Add</button>
          <button onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {noteOpen && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="wt2-kind" style={{ color: "var(--obligation)" }}>note</span>
          <input autoFocus placeholder="Note — a thought, an event, a reminder…" value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ width: 280 }} />
          <input placeholder="🕐 year (blank = no time)" value={noteYear} onChange={(e) => setNoteYear(e.target.value)} style={{ width: 150 }} title="A year pins it on the ruler; leave blank to keep it in the sidebar." />
          <button className="primary" onClick={addNote}>Add</button>
          <button onClick={() => setNoteOpen(false)}>Cancel</button>
        </div>
      )}

      <div className="wt2-wrap">
        <div ref={boardRef} className="wt2-board" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={onDouble}>
          <div className="wt2-ruler">
            {ticks.map((t) => <span key={t} className="wt2-tick" style={{ left: xOf(t) }}>{t}</span>)}
          </div>
          <div className="wt2-gridlayer">
            {ticks.map((t) => <div key={"g" + t} className="wt2-grid" style={{ left: xOf(t) }} />)}
          </div>

          <div className="wt2-content" style={{ transform: `translateY(${view.ty}px)` }}>
            {markers.filter((m) => m.story_time_ref != null).map((m) => (
              <div key={m.id} className="wt2-note" style={{ left: xOf(m.story_time_ref!) }} title={`${m.label ?? ""} · ${m.story_time_label ?? m.story_time_ref}`}>
                <span className="wt2-notedot" />
                <span className="wt2-notelab">✎ {trunc(m.label ?? "note", 22)}<span className="wt2-x" onClick={() => delMarker(m.id)}>✕</span></span>
              </div>
            ))}
            {segments.length === 0 && markers.length === 0 && (
              <div className="wt2-empty">Double-click anywhere on the ruler to draw your first segment — a series, a book, an era. Then bulk-add chapters from the sidebar.</div>
            )}
            {rows.map(({ seg, depth, y, hasCh }) => {
              const sp0 = spanOf(seg), tint = tintOf(seg);
              const dsp = domain ?? { lo: Math.round(view.start + 10), hi: Math.round(view.start + 110) };
              const placeholder = !sp0;
              const sp: Span = sp0 ?? [dsp.lo, dsp.lo + Math.max(1, Math.round((dsp.hi - dsp.lo) * 0.15))];
              const chs = chaptersBySeg.get(seg.id) ?? [];
              const undatedInSeg = chs.filter((c) => c.story_time_ref == null);
              const x1 = xOf(sp[0]), w = Math.max(xOf(sp[1]) - x1, 2);
              const wide = w > 90;
              return (
                <div key={seg.id}>
                  <span className="wt2-seglab" style={{ left: x1 + depth * 6, top: y, color: tint }}>
                    <span className="wt2-kind">{seg.kind}</span>{seg.name}
                    <span className="faint" style={{ fontSize: 10, marginLeft: 5 }}>{placeholder ? "drag to place →" : `${sp[0]}–${sp[1]}`}</span>
                    <span className="wt2-x" onClick={() => delSeg(seg)}>✕</span>
                  </span>
                  <div className="wt2-seg" style={{ left: x1, width: w, top: y + LABEL_H, height: BAR_H, background: tint, opacity: placeholder ? 0.4 : 1 }} title={`${seg.name} · ${sp[0]}–${sp[1]}`}>
                    <span className="wt2-edge" data-seg={seg.id} data-edge="start" style={{ left: -3 }} />
                    <span className="wt2-edge" data-seg={seg.id} data-edge="end" style={{ right: -3 }} />
                  </div>
                  {hasCh && wide && chs.map((c) => {
                    const cx = c.story_time_ref != null ? xOf(c.story_time_ref)
                      : x1 + (w * (undatedInSeg.indexOf(c) + 1)) / (undatedInSeg.length + 1);
                    return (
                      <div key={c.id} className="wt2-ch" style={{ left: cx - CH_SQ / 2, top: y + LABEL_H + BAR_H + 5, borderColor: tint, borderStyle: c.planned || c.story_time_ref == null ? "dashed" : "solid" }}
                        title={`${c.planned ? "planned · " : ""}${c.title}${c.story_time_ref != null ? " · " + (c.story_time_label ?? c.story_time_ref) : " · no date — drop in order"}`}
                        onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                        <b>{c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")}</b><span>{trunc(c.title)}</span>
                      </div>
                    );
                  })}
                  {hasCh && !wide && <span className="wt2-collapsed" style={{ left: x1, top: y + LABEL_H + BAR_H + 5, color: tint }}>{chs.length}▪ · zoom in</span>}
                </div>
              );
            })}
          </div>
        </div>

        {sideOpen ? (
          <div className="wt2-side">
            <div className="row" style={{ borderBottom: "none", padding: 0, gap: 6 }}>
              <span className="wt2-sidelab">Chapters · {unfiled.length}</span>
              <span className="spacer" />
              <span className="wt2-x" title="Collapse" style={{ margin: 0, fontSize: 13 }} onClick={() => setSideOpen(false)}>»</span>
            </div>
            <div className="wt2-sidesub">not on the line yet — tick some and drop them into a segment</div>
            {sel.size > 0 && (
              <div className="card" style={{ padding: 8, marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{sel.size} picked</span>
                <select className="sel" value={bulkSeg} style={{ fontSize: 11, padding: "4px 6px" }}
                  onChange={(e) => { setBulkSeg(e.target.value); if (e.target.value) addSelectedTo(e.target.value); }}>
                  <option value="">add to…</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.kind} · {s.name}</option>)}
                </select>
                <span className="wt2-x" style={{ margin: 0 }} onClick={() => setSel(new Set())}>clear</span>
              </div>
            )}
            {unfiled.length === 0 && <span className="faint" style={{ fontSize: 11 }}>Every chapter is on the line 🎉</span>}
            {unfiled.map((c) => (
              <div key={c.id} className={"wt2-sideitem" + (sel.has(c.id) ? " on" : "")} onClick={() => toggleSel(c.id)} title="Click to select · double-click to open">
                <span>{sel.has(c.id) ? "☑" : "☐"} {c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")} · {trunc(c.title, 20)}</span>
                <span className="wt2-open" onClick={(e) => { e.stopPropagation(); go({ scope: "manuscript", chapterId: c.id }); }}>↗</span>
              </div>
            ))}
            {markers.some((m) => m.story_time_ref == null) && (
              <>
                <div className="wt2-sidelab" style={{ marginTop: 16 }}>Notes · no time</div>
                <div className="wt2-sidesub">give one a year to pin it on the ruler</div>
                {markers.filter((m) => m.story_time_ref == null).map((m) => (
                  <div key={m.id} className="wt2-sideitem" title={m.label ?? ""}>
                    <span>✎ {trunc(m.label ?? "note", 20)}</span>
                    <span className="wt2-open" onClick={() => delMarker(m.id)}>✕</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="wt2-side collapsed" onClick={() => setSideOpen(true)} title="Show chapters">
            <span>«</span><span className="wt2-sidecount">{unfiled.length}</span><span className="wt2-sidevert">chapters</span>
          </div>
        )}
      </div>
    </div>
  );
}

const trunc = (s: string, n = 12) => (s.length > n ? s.slice(0, n) + "…" : s);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min; if (span <= 0) return [Math.round(min)];
  const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return [...new Set(out)];
}
