import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSegments, createSegment, updateSegment, softDeleteSegment,
  getChapters,
} from "../lib/api";
import type { Segment, Chapter } from "../lib/types";
import type { Nav } from "../App";
import { parseStoryTime } from "../lib/time";

// The World Timeline: an infinite, zoomable year-ruler. SEGMENTS (Series / Book /
// Season / Volume — nested to any depth, writer's labels) are span-bars whose
// reach auto-fits their chapters + children. CHAPTERS ride as small squares at
// their in-world date. Drag to pan, scroll to zoom (level-of-detail reveals
// deeper detail as you zoom in). Double-click empty space to draw a new segment.
// Undated chapters wait in the right sidebar. Composed entirely by the writer.

const BAR_H = 8, LABEL_H = 16, CH_ROW = 34, CH_SQ = 30, PAD_Y = 12;
const MIN_PPY = 0.002, MAX_PPY = 220;   // pixels-per-year zoom bounds
const KIND_TINT: Record<string, string> = { series: "#8a6fb0", book: "#5b8ab0", season: "#5b8ab0", volume: "#5f9a6a" };

interface View { start: number; ppy: number }   // year at x=0, pixels per year
type Span = [number, number] | null;

export function WorldTimeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ start: 0, ppy: 1 });
  const [fitDone, setFitDone] = useState(false);

  const [adding, setAdding] = useState<{ start: number } | null>(null);
  const [fName, setFName] = useState(""); const [fKind, setFKind] = useState("series");
  const [fParent, setFParent] = useState(""); const [fStart, setFStart] = useState(""); const [fEnd, setFEnd] = useState("");

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; start: number } | null>(null);
  const resizeRef = useRef<{ id: string; edge: "start" | "end" } | null>(null);
  const [nowW, setNowW] = useState(900);

  async function reload() {
    try {
      const [s, c] = await Promise.all([getSegments(worldId), getChapters(worldId)]);
      setSegments(s); setChapters(c);
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
    return m;
  }, [chapters]);

  // effective span: hug this segment's dated chapters AND its children, else the
  // drawn manual range. Recursive, memoised per render.
  const spanOf = useMemo(() => {
    const cache = new Map<string, Span>();
    const compute = (s: Segment, seen: Set<string>): Span => {
      if (cache.has(s.id)) return cache.get(s.id)!;
      if (seen.has(s.id)) return null; seen.add(s.id);
      const vals: number[] = [];
      for (const c of chaptersBySeg.get(s.id) ?? []) if (c.story_time_ref != null) vals.push(c.story_time_ref);
      for (const ch of childrenOf.get(s.id) ?? []) { const cs = compute(ch, seen); if (cs) vals.push(cs[0], cs[1]); }
      let span: Span = vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
      if (!span && s.start_ref != null) span = [s.start_ref, s.end_ref ?? s.start_ref];
      if (span && s.start_ref != null) span = [Math.min(span[0], s.start_ref), Math.max(span[1], s.end_ref ?? s.start_ref)];
      cache.set(s.id, span); return span;
    };
    return (s: Segment) => compute(s, new Set());
  }, [chaptersBySeg, childrenOf]);

  // flatten the tree in DFS order, tracking depth + a stacked y for each node
  const rows = useMemo(() => {
    const out: { seg: Segment; depth: number; y: number; hasCh: boolean }[] = [];
    let y = PAD_Y;
    const walk = (parent: string | null, depth: number) => {
      for (const s of childrenOf.get(parent) ?? []) {
        const hasCh = (chaptersBySeg.get(s.id) ?? []).some((c) => c.story_time_ref != null);
        out.push({ seg: s, depth, y, hasCh });
        y += LABEL_H + BAR_H + 6 + (hasCh ? CH_ROW : 0);
        walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
    return { list: out, height: y + PAD_Y };
  }, [childrenOf, chaptersBySeg]);

  const looseDated = useMemo(() => chapters.filter((c) => !c.segment_id && c.story_time_ref != null), [chapters]);
  const undated = useMemo(() => chapters.filter((c) => c.story_time_ref == null), [chapters]);

  // world domain (for the initial fit)
  const domain = useMemo(() => {
    const vals: number[] = [];
    for (const s of segments) { const sp = spanOf(s); if (sp) vals.push(sp[0], sp[1]); }
    for (const c of looseDated) vals.push(c.story_time_ref!);
    if (!vals.length) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 5; hi += 5; }
    return { lo, hi };
  }, [segments, looseDated, spanOf]);

  // fit the view once data + width are known
  useEffect(() => {
    if (fitDone || loading) return;
    const w = boardRef.current?.clientWidth ?? nowW; setNowW(w);
    if (domain) {
      const span = (domain.hi - domain.lo) * 1.15 || 100;
      const ppy = Math.min(MAX_PPY, Math.max(MIN_PPY, w / span));
      setView({ start: domain.lo - (domain.hi - domain.lo) * 0.07 - 2, ppy });
    }
    setFitDone(true);
  }, [domain, loading, fitDone, nowW]);

  const xOf = (year: number) => (year - view.start) * view.ppy;
  const yearOf = (px: number) => view.start + px / view.ppy;
  const localX = (clientX: number) => clientX - (boardRef.current?.getBoundingClientRect().left ?? 0);

  const ticks = useMemo(() => niceTicks(yearOf(0), yearOf(nowW), Math.max(3, Math.round(nowW / 130))), [view, nowW]);

  // ── pan / zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = boardRef.current; if (!el || loading) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const lx = localX(e.clientX), yr = yearOf(lx);
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => { const ppy = Math.min(MAX_PPY, Math.max(MIN_PPY, v.ppy * f)); return { ppy, start: yr - lx / ppy }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => setNowW(el.clientWidth));
    ro.observe(el);
    return () => { el.removeEventListener("wheel", onWheel); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, view.ppy, view.start]);

  function onDown(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    const handle = t.closest("[data-edge]") as HTMLElement | null;
    if (handle) { resizeRef.current = { id: handle.dataset.seg!, edge: handle.dataset.edge as "start" | "end" }; e.preventDefault(); return; }
    if (t.closest(".wt2-seg, .wt2-ch, button, input, select")) return;
    panRef.current = { x: e.clientX, start: view.start };
  }
  function onMove(e: React.MouseEvent) {
    if (resizeRef.current) {
      const yr = Math.round(yearOf(localX(e.clientX))); const r = resizeRef.current;
      setSegments((prev) => prev.map((s) => s.id === r.id
        ? { ...s, ...(r.edge === "start" ? { start_ref: yr } : { end_ref: yr }) } : s));
    } else if (panRef.current) {
      const p = panRef.current; setView((v) => ({ ...v, start: p.start - (e.clientX - p.x) / v.ppy }));
    }
  }
  function onUp() {
    const r = resizeRef.current; resizeRef.current = null; panRef.current = null;
    if (r) { const s = segments.find((z) => z.id === r.id); if (s) updateSegment(s.id, { start_ref: s.start_ref, end_ref: s.end_ref }).catch((x) => setErr(String(x))); }
  }
  function onDouble(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".wt2-seg, .wt2-ch, button, input, select")) return;
    const yr = Math.round(yearOf(localX(e.clientX)));
    setFName(""); setFKind("series"); setFParent(""); setFStart(String(yr)); setFEnd(String(yr + 100));
    setAdding({ start: yr });
  }

  async function submitAdd() {
    if (!fName.trim()) { setErr("Name the segment."); return; }
    try {
      const sibs = segments.filter((s) => (s.parent_id ?? "") === fParent);
      await createSegment(worldId, {
        parent_id: fParent || null, kind: fKind.trim() || "segment", name: fName.trim(),
        seg_order: sibs.length, start_ref: fStart.trim() ? parseStoryTime(fStart) : null, end_ref: fEnd.trim() ? parseStoryTime(fEnd) : null,
      });
      setAdding(null); setErr(null); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function delSeg(s: Segment) {
    if (!confirm(`Delete "${s.name}" and its nested segments? Chapters stay in the manuscript. Recoverable.`)) return;
    try { await softDeleteSegment(s.id); await reload(); } catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading world timeline…</p>;

  const tintOf = (s: Segment) => s.color || KIND_TINT[s.kind] || "#7a7ab0";

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
        <h2 className="scope-title" style={{ margin: 0 }}>World Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>double-click to draw a segment · drag to pan · scroll to zoom · drag a bar's ends to resize</span>
        <span className="spacer" />
        <button onClick={() => { const yr = Math.round(yearOf(nowW / 2)); setFName(""); setFKind("series"); setFParent(""); setFStart(String(yr)); setFEnd(String(yr + 100)); setAdding({ start: yr }); }}>+ Segment</button>
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
          <button onClick={() => setAdding(null)}>Cancel</button>
        </div>
      )}

      <div className="wt2-wrap">
        <div ref={boardRef} className="wt2-board" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={onDouble}>
          {/* ruler */}
          <div className="wt2-ruler">
            {ticks.map((t) => <span key={t} className="wt2-tick" style={{ left: xOf(t) }}>{t}</span>)}
          </div>
          {/* gridlines + content */}
          <div className="wt2-plot" style={{ height: Math.max(rows.height, 160) }}>
            {ticks.map((t) => <div key={"g" + t} className="wt2-grid" style={{ left: xOf(t) }} />)}

            {segments.length === 0 && (
              <div className="wt2-empty">Double-click anywhere on the ruler to draw your first segment (a series, a book, an era…).</div>
            )}

            {/* loose dated chapters (no segment yet) */}
            {looseDated.map((c) => (
              <div key={c.id} className="wt2-ch loose" style={{ left: xOf(c.story_time_ref!) - CH_SQ / 2, top: PAD_Y }}
                title={`${c.title} · ${c.story_time_label ?? c.story_time_ref} — not in a segment yet`} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                <b>{c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")}</b><span>{trunc(c.title)}</span>
              </div>
            ))}

            {rows.list.map(({ seg, depth, y, hasCh }) => {
              const sp0 = spanOf(seg), tint = tintOf(seg);
              const dsp = domain ?? { lo: Math.round(view.start + 10), hi: Math.round(view.start + 110) };
              const placeholder = !sp0;
              const sp: [number, number] = sp0 ?? [dsp.lo, dsp.lo + Math.max(1, Math.round((dsp.hi - dsp.lo) * 0.15))];
              const chs = (chaptersBySeg.get(seg.id) ?? []).filter((c) => c.story_time_ref != null);
              const x1 = xOf(sp[0]), x2 = xOf(sp[1]), w = Math.max(x2 - x1, 2);
              const wideEnough = w > 90;
              return (
                <div key={seg.id}>
                  <span className="wt2-seglab" style={{ left: x1 + depth * 6, top: y, color: tint }}>
                    <span className="wt2-kind">{seg.kind}</span> {seg.name}
                    <span className="faint" style={{ fontSize: 10, marginLeft: 5 }}>{placeholder ? "drag to place →" : `${sp[0]}–${sp[1]}`}</span>
                    <span className="wt2-x" onClick={() => delSeg(seg)}>✕</span>
                  </span>
                  <div className="wt2-seg" style={{ left: x1, width: w, top: y + LABEL_H, height: BAR_H, background: tint, opacity: placeholder ? 0.4 : 1 }}
                    title={`${seg.name} · ${sp[0]}–${sp[1]}`}>
                    <span className="wt2-edge" data-seg={seg.id} data-edge="start" style={{ left: -3 }} />
                    <span className="wt2-edge" data-seg={seg.id} data-edge="end" style={{ right: -3 }} />
                  </div>
                  {hasCh && wideEnough && chs.map((c) => (
                    <div key={c.id} className="wt2-ch" style={{ left: xOf(c.story_time_ref!) - CH_SQ / 2, top: y + LABEL_H + BAR_H + 5, borderColor: tint, borderStyle: c.planned ? "dashed" : "solid" }}
                      title={`${c.planned ? "planned · " : ""}${c.title} · ${c.story_time_label ?? c.story_time_ref}`} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                      <b>{c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")}</b><span>{trunc(c.title)}</span>
                    </div>
                  ))}
                  {hasCh && !wideEnough && <span className="wt2-collapsed" style={{ left: x1, top: y + LABEL_H + BAR_H + 5, color: tint }}>{chs.length}▪ · zoom in</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* undated sidebar */}
        <div className="wt2-side">
          <div className="wt2-sidelab">Undated · {undated.length}</div>
          <div className="wt2-sidesub">no in-world date yet — click to open &amp; date one</div>
          {undated.length === 0 && <span className="faint" style={{ fontSize: 11 }}>All chapters are dated 🎉</span>}
          {undated.map((c) => (
            <div key={c.id} className="wt2-sideitem" onClick={() => go({ scope: "manuscript", chapterId: c.id })} title={c.title}>
              {c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")} · {trunc(c.title, 22)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const trunc = (s: string, n = 12) => (s.length > n ? s.slice(0, n) + "…" : s);

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min; if (span <= 0) return [Math.round(min)];
  const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return [...new Set(out)];
}
