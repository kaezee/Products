import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSegments, createSegment, updateSegment, softDeleteSegment, restoreSegment, setChapterSegment,
  getChapters, getMarkers, createMarker, softDeleteMarker, restoreMarker, getSegmentKinds, getWorld, setKnownTime, setChapterDate,
} from "../lib/api";
import type { Segment, Chapter, TimelineMarker, SegmentKind } from "../lib/types";
import type { Nav } from "../App";
import { parseStoryTime } from "../lib/time";
import { buildKindSwatches } from "../lib/segmentKinds";
import { deriveCalendar, DEFAULT_CALENDAR, type DerivedCalendar } from "../lib/worldTime";
import { SidePanel, Disclosure, PanelToggleIcon } from "../components/SidePanel";
import { Icon } from "../components/icons";
import { SwatchPicker } from "../components/SwatchPicker";

// The World Timeline (design doc 3). Everything positions on a signed DAY NUMBER;
// the axis is calendar-aware and the navigable range is bounded by "known time"
// (the writer's declared history) unioned with content — you can't drift into
// empty space. SEGMENTS are span-bars that auto-hug their dated chapters +
// children; CHAPTERS ride at their in-world date, year-precision ones as bands.
// Undated chapters wait in the sidebar until dated. (This batch: view model +
// ruler + known-time bounds + rendering. LOD tiers, clustering, framing,
// out-of-bounds editing, axis-mode, and drag-to-segment land in later batches.)

const LABEL_H = 16, BAR_H = 9, CH_H = 20, ROW_GAP = 10, PAD_Y = 26, LOOSE_H = 26;
const MAX_PPD = 60;             // zoom ceiling: one day at 60px (§5.2)
const RESIZE_MIN_W = 2;

interface View { start: number; ppd: number; ty: number }   // day at x=0, px/day, vertical pan
type Span = [number, number];   // [dayStart, dayEnd]

export function WorldTimeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [kinds, setKinds] = useState<SegmentKind[]>([]);
  const [cal, setCal] = useState<DerivedCalendar>(() => deriveCalendar(DEFAULT_CALENDAR));
  const [known, setKnown] = useState<{ start: number; end: number }>({ start: 0, end: 1000 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ start: 0, ppd: 0.02, ty: 0 });
  const [fitDone, setFitDone] = useState(false);
  const [nowW, setNowW] = useState(900);
  const [sideOpen, setSideOpen] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkSeg, setBulkSeg] = useState("");
  // Live placement guide while an undated chapter is dragged over the canvas.
  const [dropHint, setDropHint] = useState<{ x: number; year: number } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteYear, setNoteYear] = useState(""); const [noteText, setNoteText] = useState("");
  const [addMenu, setAddMenu] = useState(false);
  const [ktStart, setKtStart] = useState(""); const [ktEnd, setKtEnd] = useState("");
  const [warn, setWarn] = useState<null | { segs: { id: string; name: string; lo: number; hi: number }[]; chs: { id: string; title: string; year: number }[]; contain: [number, number]; want: [number, number] }>(null);

  const viewRef = useRef(view); viewRef.current = view;
  const navRef = useRef<{ lo: number; hi: number }>({ lo: 0, hi: 360000 });
  const nowWRef = useRef(nowW); nowWRef.current = nowW;
  const rowsHRef = useRef(360);
  const animRef = useRef<number | null>(null);
  const undoStack = useRef<Array<() => Promise<void>>>([]);
  const pushUndo = (fn: () => Promise<void>) => { undoStack.current.push(fn); if (undoStack.current.length > 60) undoStack.current.shift(); };

  const [adding, setAdding] = useState(false);
  const [fName, setFName] = useState(""); const [fKind, setFKind] = useState("series");
  const [fParent, setFParent] = useState(""); const [fStart, setFStart] = useState(""); const [fEnd, setFEnd] = useState("");

  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number; start: number; ty: number } | null>(null);
  const resizeRef = useRef<{ id: string; edge: "start" | "end"; prevStart: number | null; prevEnd: number | null } | null>(null);

  const dpy = cal.daysPerYear;
  const yearToDay = (y: number) => y * dpy;                 // start-of-year day number
  const dayToYear = (d: number) => Math.floor(d / dpy);

  // Axis mode (§8): Story time positions on the day number (undated chapters wait
  // in the sidebar); Manuscript order positions on manuscript_order, evenly
  // spaced, so EVERY chapter appears — the fallback for a world with few dates.
  const [axisMode, setAxisMode] = useState<"story" | "ms">("story");
  const modeChosen = useRef(false);
  const ms = axisMode === "ms";
  const startU = (c: Chapter): number | null => (ms ? c.manuscript_order : c.day_num_start);
  const endU = (c: Chapter): number | null => (ms ? c.manuscript_order : (c.day_num_end ?? c.day_num_start));

  async function reload() {
    try {
      const [w, s, c, m, k] = await Promise.all([
        getWorld(worldId), getSegments(worldId), getChapters(worldId), getMarkers(worldId), getSegmentKinds(worldId),
      ]);
      setCal(deriveCalendar(w.calendar ?? DEFAULT_CALENDAR));
      setKnown({ start: w.known_start_year ?? 0, end: w.known_end_year ?? 1000 });
      setSegments(s); setChapters(c); setMarkers(m); setKinds(k);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); setFitDone(false); modeChosen.current = false; undoStack.current = []; void reload(); /* eslint-disable-next-line */ }, [worldId]);
  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);
  // Keep the World-clock inputs in sync with the loaded/edited known range.
  useEffect(() => { setKtStart(String(known.start)); setKtEnd(String(known.end)); }, [known]);
  // Default axis: Manuscript order when fewer than 20% of chapters are dated (§8).
  useEffect(() => {
    if (loading || modeChosen.current || chapters.length === 0) return;
    const dated = chapters.filter((c) => c.day_num_start != null).length;
    setAxisMode(dated / chapters.length < 0.2 ? "ms" : "story");
    modeChosen.current = true;
  }, [loading, chapters]);

  async function undo() {
    const fn = undoStack.current.pop(); if (!fn) return;
    try { await fn(); await reload(); } catch (x) { setErr(String(x)); }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        e.preventDefault(); void undo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kindSwatch = useMemo(() => buildKindSwatches(kinds, segments.map((s) => s.kind)), [kinds, segments]);
  const swatchOf = (s: Segment) => s.color ?? kindSwatch.get(s.kind.toLowerCase()) ?? "slate";

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Segment[]>();
    for (const s of segments) { const k = s.parent_id; (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    for (const arr of m.values()) arr.sort((a, b) => a.seg_order - b.seg_order);
    return m;
  }, [segments]);

  const chaptersBySeg = useMemo(() => {
    const m = new Map<string, Chapter[]>();
    for (const c of chapters) if (c.segment_id) (m.get(c.segment_id) ?? m.set(c.segment_id, []).get(c.segment_id)!).push(c);
    for (const arr of m.values()) arr.sort((a, b) => (a.day_num_start ?? 0) - (b.day_num_start ?? 0) || a.manuscript_order - b.manuscript_order);
    return m;
  }, [chapters]);

  // Effective span in DAY NUMBERS: hug dated chapters (excluding anachronic) AND
  // children, else the drawn manual range (stored as years, converted to days).
  const spanOf = useMemo(() => {
    const cache = new Map<string, Span | null>();
    const compute = (s: Segment, seen: Set<string>): Span | null => {
      if (cache.has(s.id)) return cache.get(s.id)!;
      if (seen.has(s.id)) return null; seen.add(s.id);
      const vals: number[] = [];
      for (const c of chaptersBySeg.get(s.id) ?? []) {
        if (c.anachronic) continue;                       // flashbacks don't stretch the bar (§4.4)
        const a = startU(c), b = endU(c);
        if (a != null) { vals.push(a, b ?? a); }
      }
      for (const ch of childrenOf.get(s.id) ?? []) { const cs = compute(ch, seen); if (cs) vals.push(cs[0], cs[1]); }
      let span: Span | null = vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
      // Manual drawn range only applies on the story-time (day) axis.
      const manual: Span | null = (!ms && s.start_ref != null) ? [yearToDay(s.start_ref), yearToDay(s.end_ref ?? s.start_ref) + dpy - 1] : null;
      if (!span) span = manual;
      else if (manual) span = [Math.min(span[0], manual[0]), Math.max(span[1], manual[1])];
      cache.set(s.id, span); return span;
    };
    return (s: Segment) => compute(s, new Set());
  }, [chaptersBySeg, childrenOf, dpy, ms]);

  const looseDated = useMemo(
    () => chapters.filter((c) => !c.segment_id && startU(c) != null && !c.anachronic),
    [chapters, ms],
  );

  // Row layout: depth-first, indent + shrink bar per level; a chapter row only
  // where a segment has dated chapters.
  const rows = useMemo(() => {
    const out: { seg: Segment; depth: number; y: number; hasCh: boolean }[] = [];
    let y = PAD_Y + (looseDated.length ? LOOSE_H : 0);
    const walk = (parent: string | null, depth: number) => {
      for (const s of childrenOf.get(parent) ?? []) {
        const hasCh = (chaptersBySeg.get(s.id) ?? []).some((c) => startU(c) != null);
        out.push({ seg: s, depth, y, hasCh });
        y += LABEL_H + BAR_H + ROW_GAP + (hasCh ? CH_H + 6 : 0);
        walk(s.id, depth + 1);
      }
    };
    walk(null, 0);
    return { list: out, height: y + PAD_Y };
  }, [childrenOf, chaptersBySeg, looseDated, ms]);
  rowsHRef.current = rows.height;

  // Story mode parks undated chapters in the sidebar; ms mode places them all.
  const undatedSidebar = useMemo(() => (ms ? [] : chapters.filter((c) => c.day_num_start == null)), [chapters, ms]);

  // Content bounds in the active unit (segment spans + every placed chapter).
  const content = useMemo(() => {
    const vals: number[] = [];
    for (const s of segments) { const sp = spanOf(s); if (sp) vals.push(sp[0], sp[1]); }
    for (const c of chapters) { const a = startU(c); if (a != null) vals.push(a, endU(c) ?? a); }
    if (!vals.length) return null;
    return { lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [segments, chapters, spanOf, ms]);

  // Known time in day-numbers, and the padded navigable range (§5.2). Padding is
  // proportional; the union with content means shrinking known time never
  // strands anything.
  const nav = useMemo(() => {
    if (ms) {
      const lo = content ? content.lo : 1, hi = content ? content.hi : Math.max(1, chapters.length);
      const span = Math.max(1, hi - lo), pad = Math.max(0.5, span * 0.06);
      return { lo: lo - pad, hi: hi + pad, knownLo: lo, knownHi: hi };
    }
    const knownLo = yearToDay(known.start), knownHi = yearToDay(known.end) + dpy - 1;
    // A fixed ±500-year buffer around known time (unioned with content so nothing
    // is ever stranded). Known time is the focus; the buffer is breathing room.
    const pad = 500 * dpy;
    const lo = (content ? Math.min(knownLo, content.lo) : knownLo) - pad;
    const hi = (content ? Math.max(knownHi, content.hi) : knownHi) + pad;
    return { lo, hi, knownLo, knownHi };
  }, [known, content, dpy, ms, chapters.length]);
  navRef.current = { lo: nav.lo, hi: nav.hi };

  // Clamp a view to the navigable range and derived zoom bounds (§5.2).
  function clampView(v: View, w: number): View {
    const navSpan = Math.max(1, navRef.current.hi - navRef.current.lo);
    const minPPD = w / navSpan;                          // can't zoom out past seeing everything
    const ppd = Math.min(MAX_PPD, Math.max(minPPD, v.ppd));
    const visible = w / ppd;
    let start: number;
    const loStart = navRef.current.lo, hiStart = navRef.current.hi - visible;
    if (loStart > hiStart) start = (navRef.current.lo + navRef.current.hi) / 2 - visible / 2;
    else start = Math.min(hiStart, Math.max(loStart, v.start));
    const minTy = Math.min(0, (boardRef.current?.clientHeight ?? 360) - rowsHRef.current);
    const ty = Math.min(0, Math.max(minTy, v.ty));
    return { start, ppd, ty };
  }

  // Initial frame: known time + its buffer (known time centred, in focus).
  useEffect(() => {
    if (fitDone || loading) return;
    const w = boardRef.current?.clientWidth ?? nowW; setNowW(w);
    setView(clampView({ start: nav.lo, ppd: w / Math.max(dpy, nav.hi - nav.lo), ty: 0 }, w));
    setFitDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, nav, loading, fitDone]);

  const xOf = (day: number) => (day - view.start) * view.ppd;
  const dayOf = (px: number) => view.start + px / view.ppd;
  const localX = (clientX: number) => clientX - (boardRef.current?.getBoundingClientRect().left ?? 0);

  // Ruler ticks (unit-aware): year steps on the story axis, chapter numbers on
  // the manuscript-order axis. Each carries its unit position + label.
  const ticks = useMemo(() => {
    if (ms) {
      const lo = dayOf(0), hi = dayOf(nowW);
      return niceTicks(lo, hi, Math.max(3, Math.round(nowW / 110)))
        .filter((t) => t >= 1).map((t) => ({ pos: t, label: `ch ${t}` }));
    }
    const yLo = dayOf(0) / dpy, yHi = dayOf(nowW) / dpy;
    return niceTicks(yLo, yHi, Math.max(3, Math.round(nowW / 130))).map((t) => ({ pos: yearToDay(t), label: `${t}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, nowW, dpy, ms]);

  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      const v = viewRef.current, w = nowWRef.current;
      // Shift-scroll (or a horizontal swipe) pans; plain scroll zooms at the cursor.
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5) {
        setView(clampView({ ...v, start: v.start + (e.shiftKey ? e.deltaY : e.deltaX) / v.ppd }, w));
        return;
      }
      const lx = localX(e.clientX), day = v.start + lx / v.ppd;
      const k = (e.ctrlKey || e.metaKey) ? 0.01 : 0.0025;   // pinch is snappier
      const ppd = v.ppd * Math.exp(-e.deltaY * k);
      setView(clampView({ ...v, ppd, start: day - lx / ppd }, w));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => setNowW(el.clientWidth));
    ro.observe(el);
    setNowW(el.clientWidth);
    return () => { el.removeEventListener("wheel", onWheel); ro.disconnect(); };
    // Re-attach once the board actually renders (it's absent during loading), else
    // scroll-to-zoom is wired to nothing. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Fit frames known time with its ±500y buffer (the whole navigable range), so
  // known time sits in focus in the middle with a little room either side.
  function fitKnown() {
    const w = boardRef.current?.clientWidth ?? nowW;
    animateTo({ start: nav.lo, ppd: w / Math.max(dpy, nav.hi - nav.lo), ty: 0 });
  }

  // ── known time: edit, extend, and the shrink warning (§5.3–5.4) ─────────
  async function applyKnown(startYr: number, endYr: number) {
    const prev = known;
    setKnown({ start: startYr, end: endYr });
    pushUndo(() => setKnownTime(worldId, prev.start, prev.end));
    setWarn(null);
    try { await setKnownTime(worldId, startYr, endYr); } catch (x) { setErr(String(x)); }
  }
  // Validate a proposed range: which segments fall (partly) outside, and which
  // chapters are individually outside while their PARENT is inside (flashbacks).
  function validateShrink(ns: number, ne: number): typeof warn {
    const segs: { id: string; name: string; lo: number; hi: number }[] = [];
    const inside = new Map<string, boolean>();
    for (const s of segments) {
      const sp = spanOf(s); if (!sp) { inside.set(s.id, true); continue; }
      const lo = dayToYear(sp[0]), hi = dayToYear(sp[1]);
      inside.set(s.id, lo >= ns && hi <= ne);
      if (lo < ns || hi > ne) segs.push({ id: s.id, name: s.name, lo, hi });
    }
    const chs: { id: string; title: string; year: number }[] = [];
    for (const c of chapters) {
      if (c.day_num_start == null) continue;
      const y = dayToYear(c.day_num_start);
      if ((y < ns || y > ne) && c.segment_id && inside.get(c.segment_id)) chs.push({ id: c.id, title: c.title, year: y });
    }
    if (!segs.length && !chs.length) return null;
    const cLo = content ? dayToYear(content.lo) : ns, cHi = content ? dayToYear(content.hi) : ne;
    return { segs, chs, contain: [Math.min(ns, cLo), Math.max(ne, cHi)], want: [ns, ne] };
  }
  // Quick date-a-chapter from the panel (year precision) — the core loop.
  async function dateChapter(chapterId: string, raw: string) {
    const yr = raw.trim() ? parseStoryTime(raw) : null;
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, story_time_ref: yr, day_num_start: yr == null ? null : yr * dpy } : c));
    try { await setChapterDate(chapterId, yr, raw.trim() || null); await reload(); } catch (x) { setErr(String(x)); }
  }
  function requestKnown() {
    const ns = ktStart.trim() ? parseStoryTime(ktStart) ?? known.start : known.start;
    const ne = ktEnd.trim() ? parseStoryTime(ktEnd) ?? known.end : known.end;
    if (ne < ns) { setErr("End year must be on or after start."); return; }
    const v = validateShrink(ns, ne);
    if (!v) void applyKnown(ns, ne); else setWarn(v);
  }
  function onDown(e: React.MouseEvent) {
    cancelAnim();
    const t = e.target as HTMLElement;
    const handle = t.closest("[data-edge]") as HTMLElement | null;
    if (handle) {
      const seg = segments.find((z) => z.id === handle.dataset.seg);
      resizeRef.current = { id: handle.dataset.seg!, edge: handle.dataset.edge as "start" | "end", prevStart: seg?.start_ref ?? null, prevEnd: seg?.end_ref ?? null };
      e.preventDefault(); return;
    }
    if (t.closest(".wt2-seglab, .wt2-ch, .wt2-note, button, input, select")) return;
    panRef.current = { x: e.clientX, y: e.clientY, start: view.start, ty: view.ty };
  }
  function onMove(e: React.MouseEvent) {
    if (resizeRef.current) {
      const yr = dayToYear(dayOf(localX(e.clientX))); const r = resizeRef.current;
      setSegments((prev) => prev.map((s) => s.id === r.id ? { ...s, ...(r.edge === "start" ? { start_ref: yr } : { end_ref: yr }) } : s));
    } else if (panRef.current) {
      const p = panRef.current;
      setView((v) => clampView({ ...v, start: p.start - (e.clientX - p.x) / v.ppd, ty: p.ty + (e.clientY - p.y) }, nowW));
    }
  }
  function onUp() {
    const r = resizeRef.current; resizeRef.current = null; panRef.current = null;
    if (r) {
      const s = segments.find((z) => z.id === r.id);
      if (s && (s.start_ref !== r.prevStart || s.end_ref !== r.prevEnd)) {
        pushUndo(() => updateSegment(r.id, { start_ref: r.prevStart, end_ref: r.prevEnd }));
        updateSegment(s.id, { start_ref: s.start_ref, end_ref: s.end_ref }).catch((x) => setErr(String(x)));
      }
    }
  }

  // Drag-to-place dating (the "Both" half of the core loop): drag an undated
  // chapter out of the sidebar and drop it on the canvas — the year under the
  // cursor becomes its date. Only on the story axis (manuscript order isn't a date).
  const DRAG_KEY = "application/x-kronicler-chapter";
  const draggingChapter = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG_KEY);
  function onBoardDragOver(e: React.DragEvent) {
    if (ms || !draggingChapter(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const lx = localX(e.clientX);
    setDropHint({ x: lx, year: dayToYear(dayOf(lx)) });
  }
  function onBoardDrop(e: React.DragEvent) {
    const id = e.dataTransfer.getData(DRAG_KEY);
    setDropHint(null);
    if (ms || !id) return;
    e.preventDefault();
    void dateChapter(id, String(dayToYear(dayOf(localX(e.clientX)))));
  }

  async function submitAdd() {
    if (!fName.trim()) { setErr("Name the segment."); return; }
    try {
      const sibs = segments.filter((s) => (s.parent_id ?? "") === fParent);
      const created = await createSegment(worldId, { parent_id: fParent || null, kind: fKind.trim() || "segment", name: fName.trim(),
        seg_order: sibs.length, start_ref: fStart.trim() ? parseStoryTime(fStart) : null, end_ref: fEnd.trim() ? parseStoryTime(fEnd) : null });
      pushUndo(() => softDeleteSegment(created.id));
      setAdding(false); setErr(null); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function setSegColor(id: string, color: string | null) {
    setSegments((prev) => prev.map((z) => z.id === id ? { ...z, color } : z));
    try { await updateSegment(id, { color }); } catch (x) { setErr(String(x)); }
  }
  async function delSeg(s: Segment) {
    if (!confirm(`Delete "${s.name}" and its nested segments? Chapters return to the sidebar. Recoverable.`)) return;
    try { await softDeleteSegment(s.id); pushUndo(() => restoreSegment(s.id)); await reload(); } catch (x) { setErr(String(x)); }
  }
  async function addSelectedTo(segId: string) {
    const ids = [...sel]; if (!ids.length || !segId) return;
    try {
      await Promise.all(ids.map((id) => setChapterSegment(id, segId)));
      pushUndo(() => Promise.all(ids.map((id) => setChapterSegment(id, null))).then(() => {}));
      setSel(new Set()); setBulkSeg(""); await reload();
    } catch (x) { setErr(String(x)); }
  }
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function addNote() {
    if (!noteText.trim()) { setNoteOpen(false); return; }
    try {
      const yr = noteYear.trim() ? parseStoryTime(noteYear) : null;
      const clock = yr == null ? {} : { time_year: yr, time_precision: "year" as const, day_num_start: yr * dpy, day_num_end: yr * dpy + dpy - 1 };
      const m = await createMarker(worldId, { kind: "note", label: noteText.trim(), story_time_ref: yr, story_time_label: noteYear.trim() || null, ...clock });
      pushUndo(() => softDeleteMarker(m.id));
      setNoteText(""); setNoteYear(""); setNoteOpen(false); setErr(null); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function delMarker(id: string) { try { await softDeleteMarker(id); pushUndo(() => restoreMarker(id)); await reload(); } catch (x) { setErr(String(x)); } }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading world timeline…</p>;

  const visibleUnits = nowW / view.ppd;
  const visibleYears = visibleUnits / dpy;
  const tier: Tier = ms ? (visibleUnits > 40 ? "season" : "detail") : tierOf(visibleYears);
  const knownX0 = xOf(nav.knownLo), knownX1 = xOf(nav.knownHi);
  function switchMode(m: "story" | "ms") { if (m === axisMode) return; modeChosen.current = true; setAxisMode(m); setFitDone(false); }

  // Frame a day range (+10% pad) with a smooth ~340ms cubic-out animation.
  // Zoom is interpolated GEOMETRICALLY (§7.3) — linear scale rushes then crawls.
  function frameRange(dLo: number, dHi: number) {
    const w = nowWRef.current, span = Math.max(dpy * 0.1, dHi - dLo), pad = span * 0.1;
    animateTo({ start: dLo - pad, ppd: w / (span + 2 * pad), ty: viewRef.current.ty });
  }
  function cancelAnim() { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; } }
  function animateTo(target: View) {
    cancelAnim();
    const from = viewRef.current, w = nowWRef.current;
    const to = clampView(target, w);
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setView(to); return; }
    const t0 = performance.now(), dur = 340;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);                 // cubic ease-out
      const ppd = from.ppd * Math.pow(to.ppd / from.ppd, e);   // geometric
      const start = from.start + (to.start - from.start) * e;
      setView(clampView({ start, ppd, ty: from.ty + (to.ty - from.ty) * e }, nowWRef.current));
      if (p < 1) animRef.current = requestAnimationFrame(step);
      else animRef.current = null;
    };
    animRef.current = requestAnimationFrame(step);
  }

  // A dated chapter's band. Year/month precision → hatched band across its whole
  // span; day precision → a solid mark. Colour from its segment's swatch.
  const chapterBand = (c: Chapter, sw: string, top: number, showTitle: boolean) => {
    const a = startU(c)!, b = endU(c) ?? a;
    const x1 = xOf(a), x2 = xOf(b);
    const w = Math.max(x2 - x1, 7);
    const hatched = !ms && c.time_precision !== "day";
    const num = c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0");
    return (
      <div key={c.id} className={"wt2-chband" + (hatched ? " hatch" : "") + (c.planned ? " planned" : "")}
        style={{ left: x1, width: w, top, ["--sw" as string]: `var(--k-entity-${sw})` }}
        title={`${c.planned ? "planned · " : ""}${c.title}${c.story_time_label ? " · " + c.story_time_label : ""}`}
        onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
        <span className="wt2-chlab">{showTitle ? `${num} ${trunc(c.title, 14)}` : num}</span>
      </div>
    );
  };

  // Chapters under a segment (or loose), rendered for the current LOD tier:
  //  work  → a density strip (ticks, no individual chapters)
  //  season/chapter → pixel-proximity clusters: singles as bands, groups as a
  //                   "N chapters" badge (double-click to frame)
  //  detail → every chapter as a titled band, lane-stacked for same-day overlap
  const midU = (c: Chapter) => { const a = startU(c) ?? 0, b = endU(c) ?? a; return (a + b) / 2; };
  const chapterLayer = (chs: Chapter[], sw: string, top: number): React.ReactNode => {
    if (tier === "era") return null;                     // Era shows only top-level bars
    const dated = chs.filter((c) => startU(c) != null);
    if (dated.length === 0) return null;
    if (tier === "work") {
      return dated.map((c) => (
        <span key={c.id} className="wt2-density" title={`${dated.length} chapters here`}
          style={{ left: xOf(midU(c)), top: top + 4, background: `var(--k-entity-${sw})` }} />
      ));
    }
    if (tier === "detail") {
      const lanes = laneAssign(dated, (c) => xOf(startU(c)!), (c) => xOf(endU(c) ?? startU(c)!));
      return dated.map((c) => chapterBand(c, sw, top + (lanes.get(c.id) ?? 0) * (CH_H + 3), true));
    }
    // season / chapter: cluster by pixel proximity
    const groups = clusterByPixel(dated.map((c) => ({ c, x: xOf(midU(c)) })), 56);
    return groups.map((g, i) => {
      if (g.items.length === 1) return chapterBand(g.items[0], sw, top, false);
      const cx = (g.x0 + g.x1) / 2;
      const dLo = Math.min(...g.items.map((c) => startU(c)!));
      const dHi = Math.max(...g.items.map((c) => endU(c) ?? startU(c)!));
      return (
        <span key={"cl" + i} className="wt2-cluster" style={{ left: cx, top }}
          title={g.items.map((c) => c.title).join(", ") + " — double-click to open up"}
          onDoubleClick={(e) => { e.stopPropagation(); frameRange(dLo, dHi); }}>
          {g.items.length} chapters
        </span>
      );
    });
  };

  return (
    <div className="fi wt2-fill">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 4, gap: 8, flexWrap: "wrap", flexShrink: 0, alignItems: "baseline" }}>
        <h2 className="scope-title" style={{ margin: 0 }}>World Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }} title="Scroll to zoom · shift-scroll / drag to pan · double-click a bar to frame · ⌘Z undo">
          {ms ? <>{Math.round(visibleUnits)} chapters in view</> : <>{fmtSpan(visibleYears)} in view</>}
        </span>
        <span className="spacer" />
        <button className="iconbtn" onClick={() => void undo()} title="Undo (⌘Z)"><Icon name="undo" size={15} /></button>
        <button onClick={fitKnown} title="Frame known time">Fit</button>
        <div style={{ position: "relative" }}>
          <button className="primary" onClick={() => setAddMenu((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="plus" size={14} /> Add</button>
          {addMenu && (
            <div className="wt2-addmenu" onMouseLeave={() => setAddMenu(false)}>
              <button onClick={() => { setAddMenu(false); const yr = dayToYear(dayOf(nowW / 2)); setFName(""); setFKind("series"); setFParent(""); setFStart(String(yr)); setFEnd(String(yr + 50)); setAdding(true); }}><Icon name="plus" size={13} /> Segment</button>
              <button onClick={() => { setAddMenu(false); setNoteText(""); setNoteYear(String(dayToYear(dayOf(nowW / 2)))); setNoteOpen(true); }}><Icon name="edit" size={13} /> Note</button>
            </div>
          )}
        </div>
        <button className="iconbtn" onClick={() => setSideOpen((v) => !v)} title={sideOpen ? "Hide panel" : "Show panel"} aria-pressed={sideOpen}><PanelToggleIcon /></button>
      </div>

      {warn && (
        <div className="wt2-warn">
          <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><Icon name="alert" size={15} style={{ color: "var(--obligation)" }} /> {warn.segs.length + warn.chs.length} thing{warn.segs.length + warn.chs.length === 1 ? "" : "s"} fall outside {warn.want[0]}–{warn.want[1]}</div>
          {warn.segs.map((s) => (
            <div key={s.id} className="row" style={{ borderBottom: "none", padding: "3px 0", gap: 8, fontSize: 12.5 }}>
              <span className="wt2-kind" style={{ color: "var(--obligation)" }}>segment</span>
              <b>{s.name}</b><span className="faint">{s.lo}–{s.hi}</span>
              <span className="spacer" />
              <span className="wt2-open" title="Show it" onClick={() => { const seg = segments.find((z) => z.id === s.id); const sp = seg && spanOf(seg); if (sp) frameRange(sp[0], sp[1]); }}>jump <Icon name="jump" size={12} /></span>
            </div>
          ))}
          {warn.chs.map((c) => (
            <div key={c.id} className="row" style={{ borderBottom: "none", padding: "3px 0", gap: 8, fontSize: 12.5 }}>
              <span className="wt2-kind" style={{ color: "var(--obligation)" }}>chapter</span>
              <b>{trunc(c.title, 26)}</b><span className="faint">{c.year} · outside, but its segment isn't (a flashback?)</span>
              <span className="spacer" />
              <span className="wt2-open" onClick={() => go({ scope: "manuscript", chapterId: c.id })}>open <Icon name="jump" size={12} /></span>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11.5, margin: "6px 0 10px" }}>Nothing is deleted or moved — they stay put and you can still pan to them, but they'll sit outside known time and Fit won't show them.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary" onClick={() => applyKnown(warn.contain[0], warn.contain[1])}>Use {warn.contain[0]}–{warn.contain[1]} instead</button>
            <button onClick={() => applyKnown(warn.want[0], warn.want[1])}>Keep {warn.want[0]}–{warn.want[1]} anyway</button>
            <button onClick={() => setWarn(null)}>Cancel</button>
          </div>
        </div>
      )}

      {adding && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus placeholder="Name (e.g. Against the Rot)" value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: 200 }} />
          <input list="wt2-kinds" value={fKind} onChange={(e) => setFKind(e.target.value)} style={{ width: 110 }} title="What is it — your label" />
          <datalist id="wt2-kinds">{[...new Set([...kinds.map((k) => k.name), "series", "book", "season", "volume", "arc"])].map((k) => <option key={k} value={k} />)}</datalist>
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
          <input placeholder="year (blank = no time)" value={noteYear} onChange={(e) => setNoteYear(e.target.value)} style={{ width: 150 }} />
          <button className="primary" onClick={addNote}>Add</button>
          <button onClick={() => setNoteOpen(false)}>Cancel</button>
        </div>
      )}

      <div className="wt2-wrap">
        <div ref={boardRef} className="wt2-board" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onDragOver={onBoardDragOver} onDrop={onBoardDrop} onDragLeave={() => setDropHint(null)}>
          {/* Known time is the bright focus; the buffer is dim. Editing lives in
              the panel's World clock section, not on the canvas. */}
          {!ms && <>
            <div className="wt2-known" style={{ left: Math.max(0, knownX0), width: Math.max(0, Math.min(nowW, knownX1) - Math.max(0, knownX0)) }} />
            {knownX0 > 0 && <div className="wt2-oob" style={{ left: 0, width: Math.min(nowW, knownX0) }} />}
            {knownX1 < nowW && <div className="wt2-oob" style={{ left: Math.max(0, knownX1), right: 0 }} />}
          </>}

          {dropHint && !ms && (
            <div className="wt2-drophint" style={{ left: dropHint.x }}>
              <span className="wt2-drophint-lab">{dropHint.year}</span>
            </div>
          )}

          <div className="wt2-ruler">
            {ticks.map((t) => <span key={t.pos} className="wt2-tick" style={{ left: xOf(t.pos) }}>{t.label}</span>)}
          </div>
          <div className="wt2-gridlayer">
            {ticks.map((t) => <div key={"g" + t.pos} className="wt2-grid" style={{ left: xOf(t.pos) }} />)}
          </div>

          <div className="wt2-content" style={{ transform: `translateY(${view.ty}px)`, height: rows.height, bottom: "auto" }}>
            {/* markers with a date */}
            {markers.filter((m) => m.day_num_start != null).map((m) => (
              <div key={m.id} className="wt2-note" style={{ left: xOf(m.day_num_start!), top: 2 }} title={`${m.label ?? ""} · ${m.story_time_label ?? ""}`}>
                <span className="wt2-notedot" />
                <span className="wt2-notelab"><Icon name="edit" size={11} /> {trunc(m.label ?? "note", 22)}<span className="wt2-x" onClick={() => delMarker(m.id)}><Icon name="close" size={12} /></span></span>
              </div>
            ))}

            {/* loose dated chapters (a date but no segment) */}
            {looseDated.length > 0 && tier !== "era" && (
              <>
                <span className="wt2-loose-lab" style={{ top: PAD_Y - 14 }}>loose chapters</span>
                {chapterLayer(looseDated, "slate", PAD_Y)}
              </>
            )}

            {segments.length === 0 && markers.length === 0 && (
              <div className="wt2-empty">Add a segment (a series, book, or season), then date chapters or bulk-add them from the sidebar. Dated chapters appear here; the ruler is bounded by your world's known time.</div>
            )}

            {rows.list.map(({ seg, depth, y }) => {
              if (tier === "era" && depth > 0) return null;   // Era: top-level segments only
              const sp0 = spanOf(seg), sw = swatchOf(seg);
              const color = `var(--k-entity-${sw})`;
              const placeholder = !sp0;
              const sp: Span = sp0 ?? [nav.knownLo, nav.knownLo + Math.max(dpy, Math.round((nav.knownHi - nav.knownLo) * 0.15))];
              const chs = chaptersBySeg.get(seg.id) ?? [];
              const barH = Math.max(4, BAR_H - depth * 2);
              const x1 = xOf(sp[0]), w = Math.max(xOf(sp[1]) - x1, RESIZE_MIN_W);
              return (
                <div key={seg.id}>
                  <span className="wt2-seglab" style={{ left: x1 + depth * 16, top: y, color, cursor: sp0 ? "zoom-in" : "default" }}
                    title={sp0 ? "Double-click to frame this segment" : undefined}
                    onDoubleClick={() => { if (sp0) frameRange(sp[0], sp[1]); }}>
                    <span className="wt2-kind">{seg.kind}</span>{seg.name}
                    <span className="faint" style={{ fontSize: 10.5, marginLeft: 6 }}>
                      {placeholder ? "drag ends to set" : `${dayToYear(sp[0])}–${dayToYear(sp[1])}`}
                    </span>
                    <span className="wt2-x" onClick={() => delSeg(seg)}><Icon name="close" size={12} /></span>
                  </span>
                  <div className="wt2-seg" style={{ left: x1 + depth * 16, width: Math.max(w - depth * 16, RESIZE_MIN_W), top: y + LABEL_H, height: barH, background: color, opacity: placeholder ? 0.4 : 1 }} title={`${seg.name} · ${dayToYear(sp[0])}–${dayToYear(sp[1])}`}>
                    <span className="wt2-edge" data-seg={seg.id} data-edge="start" style={{ left: -3 }} />
                    <span className="wt2-edge" data-seg={seg.id} data-edge="end" style={{ right: -3 }} />
                  </div>
                  {chapterLayer(chs, sw, y + LABEL_H + barH + 6)}
                </div>
              );
            })}
          </div>
        </div>

        <SidePanel open={sideOpen} onClose={() => setSideOpen(false)}>
          {/* Undated — the core loop. Type a year to drop a chapter on the line. */}
          <Disclosure label="Undated" count={undatedSidebar.length} defaultOpen>
            {undatedSidebar.length === 0
              ? <div className="wt2-sidesub" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="done" size={13} style={{ color: "var(--bond)" }} /> Every chapter has a date</div>
              : <>
                  <div className="wt2-sidesub" style={{ marginTop: 0 }}>Type a year, or drag a chapter onto the line to place it.</div>
                  {sel.size > 0 && (
                    <div className="wt2-sidefile">
                      <span style={{ fontSize: 11.5, fontWeight: 600 }}>{sel.size} selected</span>
                      <select className="sel" value={bulkSeg} style={{ fontSize: 11, padding: "4px 6px", flex: 1 }}
                        onChange={(e) => { setBulkSeg(e.target.value); if (e.target.value) addSelectedTo(e.target.value); }}>
                        <option value="">file into…</option>
                        {segments.map((s) => <option key={s.id} value={s.id}>{s.kind} · {s.name}</option>)}
                      </select>
                      <span className="wt2-open" onClick={() => setSel(new Set())}>clear</span>
                    </div>
                  )}
                  {undatedSidebar.map((c) => (
                    <div key={c.id} className={"wt2-und" + (sel.has(c.id) ? " on" : "")}>
                      <span className="wt2-grip" title="Drag onto the timeline to date"
                        draggable={!ms}
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_KEY, c.id); e.dataTransfer.effectAllowed = "copy"; }}
                        onDragEnd={() => setDropHint(null)}>
                        <Icon name="grip" size={13} />
                      </span>
                      <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`select ${c.title}`}
                        style={{ width: 14, height: 14, accentColor: "var(--bond)" }} />
                      <span className="wt2-und-title" title={c.title} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                        {c.planned ? <Icon name="edit" size={11} /> : String(c.manuscript_order).padStart(2, "0")} · {trunc(c.title, 16)}
                      </span>
                      <input className="wt2-und-date" placeholder="year"
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => { if (e.target.value.trim()) void dateChapter(c.id, e.target.value); }} />
                    </div>
                  ))}
                </>}
          </Disclosure>

          {/* World clock — set once, so it lives here, not on the canvas. */}
          <Disclosure label="World clock">
            <div className="wt2-sidesub" style={{ marginTop: 0 }}>The years your world's history spans — it frames the timeline.</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <input value={ktStart} onChange={(e) => setKtStart(e.target.value)} style={{ width: 68, fontSize: 12 }} aria-label="known start year" />
              <span className="muted">→</span>
              <input value={ktEnd} onChange={(e) => setKtEnd(e.target.value)} style={{ width: 68, fontSize: 12 }} aria-label="known end year" />
              <button className="primary" style={{ padding: "6px 12px" }} onClick={requestKnown}>Set</button>
            </div>
            <div className="wt2-sidesub" style={{ margin: "0 0 5px" }}>How chapters are placed</div>
            <span className="seg" style={{ fontSize: 11 }}>
              <span className={!ms ? "on" : ""} onClick={() => switchMode("story")}>Story time</span>
              <span className={ms ? "on" : ""} onClick={() => switchMode("ms")}>Manuscript</span>
            </span>
          </Disclosure>

          {/* Structure — jump to any segment; add a top-level one. */}
          <Disclosure label="Structure" count={segments.length}>
            {segments.length === 0 && <div className="wt2-sidesub" style={{ marginTop: 0 }}>No segments yet — use + Add · Segment.</div>}
            {rows.list.map(({ seg, depth }) => (
              <div key={seg.id} className="wt2-outline" style={{ paddingLeft: 4 + depth * 12 }}>
                <SwatchPicker value={swatchOf(seg)} onPick={(c) => setSegColor(seg.id, c)} title="Segment colour — pick or Auto" />
                <span className="wt2-outline-name" title={`${seg.kind} · ${seg.name}`}
                  onClick={() => { const sp = spanOf(seg); if (sp) frameRange(sp[0], sp[1]); }}>{trunc(seg.name, 18)}</span>
                <span className="wt2-open" title="Delete" onClick={() => delSeg(seg)}><Icon name="close" size={13} /></span>
              </div>
            ))}
          </Disclosure>

          {/* Notes */}
          <Disclosure label="Notes" count={markers.length}>
            {markers.length === 0 && <div className="wt2-sidesub" style={{ marginTop: 0 }}>No notes yet — use + Add · Note.</div>}
            {markers.map((m) => (
              <div key={m.id} className="wt2-outline">
                <span className="wt2-outline-name" title={m.label ?? ""}><Icon name="edit" size={11} /> {trunc(m.label ?? "note", 20)}{m.day_num_start == null ? "" : ` · ${dayToYear(m.day_num_start)}`}</span>
                <span className="wt2-open" title="Delete" onClick={() => delMarker(m.id)}><Icon name="close" size={13} /></span>
              </div>
            ))}
          </Disclosure>
        </SidePanel>
      </div>
    </div>
  );
}

const trunc = (s: string, n = 12) => (s.length > n ? s.slice(0, n) + "…" : s);

// LOD tier from the visible span in years (§6). Different objects at different
// altitudes; this is what makes the surface feel like a canvas, not a scaled drawing.
type Tier = "era" | "work" | "season" | "chapter" | "detail";
function tierOf(visibleYears: number): Tier {
  if (visibleYears >= 500) return "era";
  if (visibleYears >= 60) return "work";
  if (visibleYears >= 5) return "season";
  if (visibleYears >= 0.5) return "chapter";
  return "detail";
}

// Group items by pixel proximity (§7.1): a gap smaller than `gap` keeps them in
// the same cluster. Degrades gracefully where lane-stacking fails (22 in a month).
function clusterByPixel(items: { c: Chapter; x: number }[], gap: number) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const groups: { x0: number; x1: number; items: Chapter[] }[] = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && it.x - last.x1 < gap) { last.x1 = it.x; last.items.push(it.c); }
    else groups.push({ x0: it.x, x1: it.x, items: [it.c] });
  }
  return groups;
}

// Greedy lane assignment for genuinely-overlapping chapters at Detail tier (§7.2).
function laneAssign(chs: Chapter[], x0Of: (c: Chapter) => number, x1Of: (c: Chapter) => number): Map<string, number> {
  const items = chs
    .map((c) => ({ id: c.id, x0: x0Of(c), x1: Math.max(x1Of(c), x0Of(c) + 7) }))
    .sort((a, b) => a.x0 - b.x0);
  const laneEnds: number[] = [];
  const m = new Map<string, number>();
  for (const it of items) {
    let lane = laneEnds.findIndex((end) => end <= it.x0 - 4);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = it.x1;
    m.set(it.id, lane);
  }
  return m;
}

function fmtSpan(years: number): string {
  if (years >= 2) return `${Math.round(years).toLocaleString()} years`;
  const months = years * 12;
  if (months >= 2) return `${Math.round(months)} months`;
  return "weeks";
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min; if (span <= 0) return [Math.round(min)];
  const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return [...new Set(out)];
}
