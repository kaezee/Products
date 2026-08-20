import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getRelationshipTypes, getChapterVersions, getChapterEntities,
  linkChapterEntity, saveChapterBody, getStream, deleteState, setStateAnchor,
  getEntities, createEntity, updateEntity, updateChapterTitle, setChapterStatus,
} from "../lib/api";
import type { Chapter, ChapterStatus, Entity, RelationshipType, ChapterVersion, ChapterEntity, StreamRow, Comment } from "../lib/types";
import { CHAPTER_STATUSES, statusMeta } from "../lib/chapterStatus";
import { resolveAnchor, makeAnchor } from "../lib/anchor";
import { markResume } from "../lib/resume";
import { firstCoOccurrence } from "../lib/offers";
import { VALENCE_COLOR } from "../lib/valence";
import type { ActiveFormats } from "../lib/blocks";
import { detectMentions } from "../lib/mentions";
import { computeBrief } from "../lib/brief";
import { statesAsOf } from "../lib/mentionState";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";
import { getLevelNames } from "../lib/levelNames";
import { Composer } from "./Composer";
import type { Anchor } from "../lib/anchor";
import { BriefPanel } from "./BriefPanel";
import { RichProse, type ProseApi } from "./RichProse";
import { ChapterDate } from "./ChapterDate";
import { ChapterNotes } from "./ChapterNotes";
import { ChapterComments } from "./ChapterComments";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import {
  READ_FACES, READ_SIZE_MIN, READ_SIZE_MAX, getReadFace, getReadSize, setReadFace, setReadSize, getCleanText, setCleanText, type ReadFace,
} from "../lib/readingPrefs";

type SaveState = "saved" | "saving" | "dirty";

// One chapter as a block in the continuous scroll: an inline title heading then
// its prose, with its own debounced autosave. Reports selections, mentions, and
// which block the caret is in up to the BookCanvas — the shared toolbar and the
// inspector act on whichever chapter is active.
function ChapterBlock({
  worldId, chapter, entities, stateOf, onOpenEntity, onSelect, onMentions,
  onMarkEntity, onMarkMoment, onComment, registerApi, onSaveState, onActive, onDateChanged, marks, onMarkClick,
}: {
  worldId: string;
  chapter: Chapter;
  entities: Entity[];
  stateOf: (id: string, order: number) => ReturnType<typeof statesAsOf>;
  onOpenEntity?: (id: string) => void;
  onSelect: (chapterId: string, text: string) => void;
  onMentions: (chapterId: string, ids: string[]) => void;
  onMarkEntity: (chapterId: string, at?: { x: number; y: number }) => void;
  onMarkMoment: (chapterId: string, anchor: Anchor) => void;
  onComment: (chapterId: string, range: { start: number; end: number; quote: string }) => void;
  registerApi: (chapterId: string, api: ProseApi | null) => void;
  onSaveState: (s: SaveState) => void;
  onActive: (a: ActiveFormats) => void;
  onDateChanged: () => void;
  marks?: { id: string; start: number; color: string }[];
  onMarkClick?: (id: string) => void;
}) {
  const [body, setBody] = useState(chapter.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(chapter.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<string | null>(null);   // unsaved body tail, or null when in sync
  const [status, setStatus] = useState<ChapterStatus>(chapter.status ?? "draft");
  const [statusMenu, setStatusMenu] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const statusWrap = useRef<HTMLDivElement>(null);
  useEffect(() => { setStatus(chapter.status ?? "draft"); }, [chapter.status]);
  // Stable so the editor registers its api once, not on every keystroke render.
  const setApi = useCallback((api: ProseApi | null) => registerApi(chapter.id, api), [registerApi, chapter.id]);

  const scheduleSave = useCallback((next: string) => {
    pendingRef.current = next;                     // remember the unsaved tail for flush-on-unmount
    markResume(worldId, chapter.id);               // an edit — this is now "where you stopped"
    setSaveState("dirty");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveChapterBody(chapter.id, next);
        if (pendingRef.current === next) pendingRef.current = null;   // in sync (unless newer keystrokes queued)
        setSaveState("saved");
        // Writing into a planned beat moves it along to Draft on its own.
        if (statusRef.current === "planned" && next.trim()) {
          setStatus("draft");
          setChapterStatus(chapter.id, "draft").then(onDateChanged).catch(() => {});
        }
      } catch { setSaveState("dirty"); }
    }, 1200);
  }, [chapter.id, worldId, onDateChanged]);

  function pickStatus(k: ChapterStatus) {
    setStatus(k);
    setStatusMenu(false);
    setChapterStatus(chapter.id, k).then(onDateChanged).catch(() => {});
  }
  useEffect(() => {
    if (!statusMenu) return;
    const h = (e: MouseEvent) => { if (!statusWrap.current?.contains(e.target as Node)) setStatusMenu(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [statusMenu]);

  // Flush a pending debounced save on unmount (switching chapters, leaving Write)
  // and on tab-hide, so edits typed in the last ~second are never dropped.
  useEffect(() => {
    const flush = () => {
      if (pendingRef.current != null) { void saveChapterBody(chapter.id, pendingRef.current); pendingRef.current = null; }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.clearTimeout(saveTimer.current);
      flush();
    };
  }, [chapter.id]);
  useEffect(() => { onSaveState(saveState); }, [saveState]); // eslint-disable-line

  // Live word count for the inline chapter-properties line (§3.3).
  const words = useMemo(() => { const t = body.trim(); return t ? t.split(/\s+/).length : 0; }, [body]);

  const mentioned = useMemo(() => detectMentions(body, entities), [body, entities]);
  useEffect(() => { onMentions(chapter.id, mentioned.map((e) => e.id)); }, [mentioned, chapter.id]); // eslint-disable-line

  const stOf = useCallback((id: string) => stateOf(id, chapter.manuscript_order), [stateOf, chapter.manuscript_order]);

  // In-world date summary for the properties line — numeric, no calendar (§9).
  const dateLabel = useMemo(() => {
    const p: string[] = [];
    if (chapter.time_year != null) p.push(String(chapter.time_year));
    if (chapter.time_month != null) p.push("M" + chapter.time_month);
    if (chapter.time_day != null) p.push("day " + chapter.time_day);
    return p.join(" · ");
  }, [chapter.time_year, chapter.time_month, chapter.time_day]);

  return (
    <section className="ed-chapter" data-chapter={chapter.id}>
      <div className="ed-canvas-head">
        {/* Inline chapter properties (§3.3): number · in-world date · words.
            Click the date to edit in place — a numeric control, no calendar. */}
        <div className="ed-kicker">
          <span>{getLevelNames(worldId).leaf} {chapter.manuscript_order}</span>
          <span className="ed-dot">·</span><span>{words.toLocaleString()} {words === 1 ? "word" : "words"}</span>
          <span className="ed-dot">·</span>
          <button className={"ed-status ed-datepill" + (editingDate ? " on" : "")} onClick={() => setEditingDate((v) => !v)}
            title="Set the in-world date — places this chapter on the Timeline">
            {dateLabel || "Add date"}
          </button>
          <span className="ed-dot">·</span>
          <div className="ed-status-wrap" ref={statusWrap}>
            <button className={"ed-status" + (statusMenu ? " on" : "")} onClick={() => setStatusMenu((v) => !v)} title="Chapter status">
              <span className="ed-status-dot" style={{ background: statusMeta(status).color }} />
              {statusMeta(status).label}
              <Icon name="chevron-down" size={11} />
            </button>
            {statusMenu && (
              <div className="ed-status-menu">
                {CHAPTER_STATUSES.map((s) => (
                  <button key={s.key} className={"ed-status-opt" + (s.key === status ? " on" : "")} onClick={() => pickStatus(s.key)}>
                    <span className="ed-status-dot" style={{ background: s.color }} />{s.label}
                    {s.key === status && <Icon name="check" size={13} style={{ marginLeft: "auto" }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {editingDate && (
          <div className="ed-dateedit">
            <ChapterDate worldId={worldId} chapter={chapter} onChanged={() => onDateChanged()} />
            <button className="ed-dateedit-done" onClick={() => setEditingDate(false)}>Done</button>
          </div>
        )}
        {editingTitle ? (
          <input className="ed-canvas-title ed-canvas-input" autoFocus value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setTitle(chapter.title); setEditingTitle(false); }
            }}
            onBlur={async () => {
              const t = title.trim();
              setEditingTitle(false);
              if (!t || t === chapter.title) { setTitle(chapter.title); return; }
              try { await updateChapterTitle(chapter.id, t); } catch { /* handled on reload */ }
            }} />
        ) : (
          <h2 className="ed-canvas-title" title="Double-click to rename this chapter"
            onDoubleClick={() => setEditingTitle(true)}>{title}</h2>
        )}
      </div>
      <RichProse
        value={body}
        entities={entities}
        onChange={(v) => { setBody(v); scheduleSave(v); }}
        onSelectText={(t) => onSelect(chapter.id, t)}
        onActive={onActive}
        onOpenEntity={onOpenEntity}
        stateOf={stOf}
        onMarkEntity={(at) => onMarkEntity(chapter.id, at)}
        onMarkMoment={(anchor) => onMarkMoment(chapter.id, anchor)}
        onComment={(range) => onComment(chapter.id, range)}
        apiRef={setApi}
        marks={marks} onMarkClick={onMarkClick}
        placeholder="Write the chapter here. Known names light up as you type — hover one to peek. Select a sentence to record a moment."
      />
    </section>
  );
}

// Write: one chapter at a time on a clean, Docs-like page — the tree is the
// navigator, so the editor holds a single chapter (fast, and every bit of the
// inspector belongs to that one chapter). Prev/next step through the manuscript
// without leaving the page. The title is an in-canvas header (number + title).
export function BookCanvas(props: {
  worldId: string;
  chapters: Chapter[];        // the manuscript's chapters in order, for prev/next
  openId: string;             // the chapter being edited
  entities: Entity[];
  bookIds: Set<string>;                // chapters in the open chapter's book (panel scope)
  onOpenEntity?: (id: string) => void;
  onNavigate: (chapterId: string) => void;
  onChapterMetaChanged?: () => void;   // e.g. an in-world date edit — refresh the chapter list
  onImport?: () => void;               // document action, lives in the editor toolbar's ··· menu
  focused: boolean;                    // fullscreen writing — owned by Manuscript (keeps the tree)
  onToggleFocus: () => void;
}) {
  const { worldId, chapters, openId, entities, bookIds, onOpenEntity, onNavigate, onChapterMetaChanged, onImport, focused, onToggleFocus } = props;
  const chapterRefs = useMemo(() => chapters.map((c) => ({ id: c.id, manuscript_order: c.manuscript_order, title: c.title })), [chapters]);

  // Prev/next chapter by manuscript order (spans books — a continuous read).
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.manuscript_order - b.manuscript_order), [chapters]);
  const idx = useMemo(() => ordered.findIndex((c) => c.id === openId), [ordered, openId]);
  const prevCh = idx > 0 ? ordered[idx - 1] : null;
  const nextCh = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;


  const [readFace, setReadFaceState] = useState<ReadFace>(getReadFace());
  const [readSize, setReadSizeState] = useState<number>(getReadSize());
  const [cleanText, setCleanTextState] = useState<boolean>(getCleanText());
  function changeFace(f: ReadFace) { setReadFace(f); setReadFaceState(f); }
  function toggleClean() { const v = !cleanText; setCleanText(v); setCleanTextState(v); }
  function changeSize(n: number) { setReadSize(n); setReadSizeState(getReadSize()); }

  const [ents, setEnts] = useState<Entity[]>(entities);
  useEffect(() => setEnts(entities), [entities]);
  const reloadEntities = useCallback(() => {
    getEntities(worldId).then(setEnts).catch((x) => setErr(String(x)));
  }, [worldId]);

  // Which chapter is active drives the whole inspector and the entity actions.
  const [activeId, setActiveId] = useState(openId);
  useEffect(() => setActiveId(openId), [openId]);
  const activeChapter = useMemo(() => chapters.find((c) => c.id === activeId) ?? chapters[0], [chapters, activeId]);

  // Selection text (the marking verbs live in the prose popover now, but the
  // moment composer still reads the selected sentence as its note).
  const [selText, setSelText] = useState("");
  const onSelect = useCallback((_chapterId: string, text: string) => {
    setSelText(text);
  }, []);

  // Mentions per chapter, so "Cast detected" reflects the active chapter.
  const [mentionsByCh, setMentionsByCh] = useState<Record<string, string[]>>({});
  const onMentions = useCallback((chapterId: string, ids: string[]) => {
    setMentionsByCh((m) => (m[chapterId]?.join() === ids.join() ? m : { ...m, [chapterId]: ids }));
  }, []);

  const [composerOpen, setComposerOpen] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [noteCount, setNoteCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [chSaveState, setChSaveState] = useState<SaveState>("saved");
  // Summoned right-margin panels (one at a time) and full-surface takeovers.
  const [panel, setPanel] = useState<null | "comments" | "notes" | "continuity">(null);
  const [takeover, setTakeover] = useState<null | "history">(null);
  // §4.4 the net: a one-line teach for the gesture, dismissible once per project.
  const [momentNetOff, setMomentNetOff] = useState(() => localStorage.getItem(`k.momentnet.${worldId}`) === "1");
  const dismissMomentNet = () => { localStorage.setItem(`k.momentnet.${worldId}`, "1"); setMomentNetOff(true); };
  // §4.2 engine offers retire permanently after 3 marked moments, per account
  // (browser-scoped), never re-arming.
  const [markedCount, setMarkedCount] = useState(() => Number(localStorage.getItem("k.momentsMarked") || 0));
  const bumpMarked = () => setMarkedCount((c) => { const n = c + 1; localStorage.setItem("k.momentsMarked", String(n)); return n; });
  const summon = (p: "comments" | "notes" | "continuity") => { setTakeover(null); setPanel((cur) => (cur === p ? null : p)); };
  // Clicking a margin ✳ focuses that one moment: open Continuity (never toggle it
  // shut) and flag its row so the effect below scrolls to it and flashes it.
  const [focusMoment, setFocusMoment] = useState<string | null>(null);
  const momentRowRef = useRef<HTMLDivElement | null>(null);
  const focusOnMoment = (id: string) => { setTakeover(null); setPanel("continuity"); setFocusMoment(id); };
  useEffect(() => {
    if (!focusMoment) return;
    momentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFocusMoment(null), 1800);   // one flash, then clear
    return () => clearTimeout(t);
  }, [focusMoment]);
  const summonTakeover = (t: "history") => { setPanel(null); setTakeover((cur) => (cur === t ? null : t)); };
  const [pendingComment, setPendingComment] = useState<{ chapterId: string; start: number; end: number; quote: string } | null>(null);
  // Each chapter block registers a small handle so a comment can jump to its range.
  const proseApis = useRef(new Map<string, ProseApi | null>());
  const [active, setActive] = useState<ActiveFormats | null>(null);
  const registerApi = useCallback((chapterId: string, api: ProseApi | null) => {
    if (api) proseApis.current.set(chapterId, api); else proseApis.current.delete(chapterId);
  }, []);

  // ⌘F find-in-chapter. The bar is chrome the writer already knows; the actual
  // highlighting lives in the prose (ProseApi), so this only drives the query
  // and reads back "n of m" for the counter.
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCase, setFindCase] = useState(false);
  const [findRes, setFindRes] = useState<{ count: number; index: number }>({ count: 0, index: -1 });
  const findInputRef = useRef<HTMLInputElement>(null);
  // The editor's find handle. Prefer the one keyed by the open chapter, but fall
  // back to the sole registered editor — only ever one ChapterBlock is mounted,
  // and keying by openId alone left find dead whenever that key lagged the
  // mounted chapter (the "⌘F finds nothing" bug).
  const findApi = useCallback(() => proseApis.current.get(openId) ?? [...proseApis.current.values()][0] ?? null, [openId]);
  const runFind = useCallback((q: string, cs = findCase) => {
    const api = findApi();
    setFindRes(api ? api.find(q, cs) : { count: 0, index: -1 });
  }, [findApi, findCase]);
  const toggleFindCase = useCallback(() => {
    setFindCase((v) => { const next = !v; runFind(findQuery, next); return next; });
  }, [runFind, findQuery]);
  const stepFind = useCallback((dir: 1 | -1) => {
    const api = findApi();
    if (api) setFindRes(api.findStep(dir));
  }, [findApi]);
  const closeFind = useCallback(() => {
    setFindOpen(false); setFindQuery("");
    findApi()?.findClear();
  }, [findApi]);
  const onComment = useCallback((chapterId: string, range: { start: number; end: number; quote: string }) => {
    setActiveId(chapterId);
    setPendingComment({ chapterId, ...range });
    setTakeover(null); setPanel("comments");
  }, []);
  const jumpComment = useCallback((c: Comment): boolean => {
    return proseApis.current.get(c.chapter_id)?.selectRange(c.anchor_start, c.anchor_end, c.quote) ?? false;
  }, []);
  const [entMode, setEntMode] = useState<null | "mark">(null);
  const [markAt, setMarkAt] = useState<{ x: number; y: number } | null>(null);
  const [entChId, setEntChId] = useState(openId);      // chapter the entity action targets
  const [selWord, setSelWord] = useState("");
  const [newType, setNewType] = useState("Character");
  const [customType, setCustomType] = useState("");
  const [aliasQuery, setAliasQuery] = useState("");

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [cast, setCast] = useState<ChapterEntity[]>([]);
  const [stream, setStream] = useState<StreamRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getRelationshipTypes(worldId).then(setTypes).catch((x) => setErr(String(x))); }, [worldId]);
  useEffect(() => { getStream(worldId).then(setStream).catch((x) => setErr(String(x))); }, [worldId]);

  // Cast + history reload when the active chapter changes.
  const reloadActiveSide = useCallback((id: string) => {
    getChapterVersions(id).then(setVersions).catch((x) => setErr(String(x)));
    getChapterEntities(id).then(setCast).catch((x) => setErr(String(x)));
  }, []);
  useEffect(() => { if (activeId) reloadActiveSide(activeId); }, [activeId, reloadActiveSide]);

  const castIds = useMemo(() => cast.map((c) => c.entity_id), [cast]);
  const aliasMatches = useMemo(() => {
    const q = aliasQuery.trim().toLowerCase();
    const base = q
      ? ents.filter((e) => [e.title, ...e.aliases].some((n) => n.toLowerCase().includes(q)))
      : ents;
    return base.slice(0, 8);
  }, [ents, aliasQuery]);

  const stateOf = useCallback(
    (id: string, order: number) => (stream ? statesAsOf(stream, id, order) : []),
    [stream],
  );

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const nameOf = useMemo(() => {
    const m = new Map(ents.map((e) => [e.id, e.title]));
    return (id: string) => m.get(id) ?? "someone";
  }, [ents]);
  const brief = useMemo(
    () => (stream && activeChapter ? computeBrief(stream, castIds, { manuscript_order: activeChapter.manuscript_order, story_time_ref: activeChapter.story_time_ref }, typesById) : null),
    [stream, castIds, activeChapter, typesById],
  );

  // §6.2 per-chapter moment count — everything recorded here (anchored or not),
  // corrections excluded (they amend a moment, they aren't new ones). No zero badge.
  const momentCount = useMemo(
    () => (stream && activeChapter ? stream.filter((s) => s.manuscript_ref === activeChapter.id && !s.is_correction).length : 0),
    [stream, activeChapter],
  );

  // This chapter's moments, each resolved live against the current prose — a
  // stale one (its quote gone) drives the repair path. Status is derived, not
  // cached, so it's always right without a write on every open.
  const chapterMoments = useMemo(() => {
    if (!stream || !activeChapter) return [];
    const body = activeChapter.body || "";
    return stream
      .filter((s) => s.manuscript_ref === activeChapter.id && !s.is_correction)
      .map((s) => {
        const anchored = s.anchor_start != null && s.anchor_quote != null;
        const res = anchored ? resolveAnchor(body, {
          quote: s.anchor_quote!, prefix: s.anchor_prefix ?? "", suffix: s.anchor_suffix ?? "",
          start: s.anchor_start!, end: s.anchor_end!,
        }) : null;
        return { s, anchored, stale: res?.status === "stale", start: res && res.status === "ok" ? res.start : null };
      });
  }, [stream, activeChapter]);

  // §6.3 the margin marks: resolved, non-stale anchored moments for the open chapter.
  const momentMarks = useMemo(
    () => chapterMoments.filter((m) => m.start != null).map((m) => ({ id: m.s.state_id, start: m.start!, color: VALENCE_COLOR[m.s.valence] })),
    [chapterMoments],
  );

  // §4.2 the one offer this chapter may make — a co-occurrence with no moment yet.
  const offer = useMemo(() => {
    if (!activeChapter || markedCount >= 3) return null;
    const anchored = chapterMoments.filter((m) => m.start != null)
      .map((m) => ({ start: m.start!, end: m.start! + (m.s.anchor_quote?.length ?? 0) }));
    return firstCoOccurrence(activeChapter.body || "", ents, anchored);
  }, [activeChapter, markedCount, chapterMoments, ents]);
  function acceptOffer() {
    if (!offer || !activeChapter) return;
    setEntChId(activeChapter.id);
    setPendingAnchor(makeAnchor(activeChapter.body || "", offer.start, offer.end));
    setComposerOpen(true);
  }

  const reloadStream = useCallback(() => { getStream(worldId).then(setStream).catch(() => {}); }, [worldId]);
  async function reanchorState(stateId: string) {
    const anchor = proseApis.current.get(openId)?.currentSelection();
    if (!anchor || anchor.quote.length < 3) return;
    try { await setStateAnchor(stateId, anchor); reloadStream(); } catch (x) { setErr(String(x)); }
  }
  async function deleteMoment(stateId: string) {
    // Moments are part of the append-only stream and have no soft-delete — this
    // is permanent, so it must ask first and say so plainly.
    if (!(await confirmDialog({ title: "Delete moment", message: "Delete this moment? Moments aren't kept in the Trash — this can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
    try { await deleteState(stateId); reloadStream(); } catch (x) { setErr(String(x)); }
  }

  const scroller = useRef<HTMLDivElement | null>(null);
  // Editing one chapter → scroll the page back to the top when it changes.
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [openId]);

  // prev/next also from the keyboard (Alt+←/→), so flow never needs the mouse.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft" && prevCh) { e.preventDefault(); onNavigate(prevCh.id); }
      if (e.key === "ArrowRight" && nextCh) { e.preventDefault(); onNavigate(nextCh.id); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [prevCh, nextCh, onNavigate]);

  // ⌘F / Ctrl+F opens the in-chapter find, seeded from the selection if any.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      const seed = selText.trim() && !selText.includes("\n") ? selText.trim() : "";
      setFindOpen(true);
      if (seed) setFindQuery(seed);
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
        if (seed) runFind(seed);
      });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selText, runFind]);

  // A find is scoped to one chapter's prose — switching chapters closes it.
  useEffect(() => { setFindOpen(false); setFindQuery(""); }, [openId]);

  // §3.6: one "Mark entity" flow — find an existing entity (records an alias) or
  // create a new one (adds it to the world). No separate New/Alias buttons.
  function openMarkEntity(chapterId: string, at?: { x: number; y: number }) {
    const w = selText.trim();
    if (!w) return;
    setSelWord(w); setEntChId(chapterId);
    setNewType("Character"); setCustomType(""); setAliasQuery("");
    setMarkAt(at ?? null);
    setEntMode("mark");
  }

  async function createFromSelection() {
    const t = selWord.trim();
    const type = (newType === CUSTOM_TYPE ? customType.trim() : newType) || "Character";
    if (!t) return;
    try {
      const e = await createEntity(worldId, type, t);
      await linkChapterEntity(entChId, e.id, "present");
      setEntMode(null); reloadEntities();
      if (entChId === activeId) setCast(await getChapterEntities(entChId));
    } catch (x) { setErr(String(x)); }
  }

  async function addAliasTo(target: Entity) {
    const alias = selWord.trim();
    if (!alias) return;
    const next = [...new Set([...target.aliases, alias])];
    try {
      await updateEntity(target.id, { aliases: next });
      await linkChapterEntity(entChId, target.id, "mentioned");
      setEntMode(null); reloadEntities();
      if (entChId === activeId) setCast(await getChapterEntities(entChId));
    } catch (x) { setErr(String(x)); }
  }

  async function link(entityId: string) {
    try { await linkChapterEntity(activeId, entityId, "mentioned"); setCast(await getChapterEntities(activeId)); }
    catch (x) { setErr(String(x)); }
  }
  async function linkAll(ids: string[]) {
    try { for (const id of ids) await linkChapterEntity(activeId, id, "mentioned"); setCast(await getChapterEntities(activeId)); }
    catch (x) { setErr(String(x)); }
  }
  async function restore(v: ChapterVersion) {
    if (!(await confirmDialog({ title: "Restore version", message: "Restore this version? Your current text is snapshotted first, so nothing is lost.", confirmLabel: "Restore" }))) return;
    try { await saveChapterBody(activeId, v.body); reloadActiveSide(activeId); }
    catch (x) { setErr(String(x)); }
  }

  const activeMentions = useMemo(
    () => (mentionsByCh[activeId] ?? []).map((id) => ents.find((e) => e.id === id)).filter(Boolean) as Entity[],
    [mentionsByCh, activeId, ents],
  );
  // New unlinked detections drive the Continuity badge (no zero badge).
  const unlinkedCount = useMemo(
    () => activeMentions.filter((e) => !castIds.includes(e.id) && !dismissed.has(e.id)).length,
    [activeMentions, castIds, dismissed],
  );

  // Esc closes the Mark-entity card from anywhere — the old card could only be
  // dismissed by a small "Cancel" link, which readers missed and felt trapped by.
  useEffect(() => {
    if (entMode !== "mark") return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setEntMode(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [entMode]);

  return (
    <div className="ed-shell">
      {/* Top toolbar: document chrome only — the things a Docs/Word writer already
          knows how to find. Kronicler's marking verbs live in the selection
          popover, never here (IA handoff §3.2). */}
      <div className="ed-toolbar">
        <button className={"ed-fmt" + (active?.bold ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.format("**")} title="Bold (⌘B)"><b>B</b></button>
        <button className={"ed-fmt" + (active?.italic ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.format("*")} title="Italic (⌘I)"><i>I</i></button>
        <span className="ed-tbsep" />
        <button className={"ed-fmt" + (active?.heading ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.block("h")} title="Heading"><Icon name="heading" size={15} /></button>
        <button className={"ed-fmt" + (active?.ul ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.block("ul")} title="Bulleted list"><Icon name="list" size={15} /></button>
        <button className={"ed-fmt" + (active?.ol ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.block("ol")} title="Numbered list"><Icon name="list-ordered" size={15} /></button>
        <button className={"ed-fmt" + (active?.quote ? " on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.block("quote")} title="Quote"><Icon name="quote" size={15} /></button>
        <button className="ed-fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.block("hr")} title="Scene break"><Icon name="scene-break" size={15} /></button>
        <span className="ed-tbsep" />
        <select className="sel ed-face" value={readFace} title="Font the chapter is set in"
          onChange={(e) => changeFace(e.target.value as ReadFace)}>
          {READ_FACES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <div className="ed-size">
          <button disabled={readSize <= READ_SIZE_MIN} onClick={() => changeSize(readSize - 1)} title="Smaller">−</button>
          <span>{readSize}</span>
          <button disabled={readSize >= READ_SIZE_MAX} onClick={() => changeSize(readSize + 1)} title="Larger">+</button>
        </div>
        <button className={"ed-fmt" + (cleanText ? " on" : "")} onClick={toggleClean}
          title={cleanText ? "Show entity links and moment marks" : "Clean text — hide links and moment marks to read your prose"}>
          <Icon name={cleanText ? "eye-off" : "eye"} size={15} />
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="ed-save muted">{chSaveState === "saved" ? "saved" : chSaveState === "saving" ? "saving…" : "unsaved"}</span>
        {/* Summon icons (§3.4): each opens one panel; opening one closes the rest. */}
        <span className="ed-summon">
          <button className={"iconbtn" + (panel === "comments" ? " on" : "")} onClick={() => summon("comments")}
            title="Comments">{commentCount > 0 && <span className="ed-badge">{commentCount > 99 ? "99+" : commentCount}</span>}<Icon name="comment" size={15} /></button>
          <button className={"iconbtn" + (panel === "notes" ? " on" : "")} onClick={() => summon("notes")}
            title="Notes">{noteCount > 0 && <span className="ed-badge">{noteCount > 99 ? "99+" : noteCount}</span>}<Icon name="notes" size={15} /></button>
          <button className={"iconbtn" + (panel === "continuity" ? " on" : "")} onClick={() => summon("continuity")}
            title="Continuity — people and moments in this chapter">{unlinkedCount > 0 && <span className="ed-badge dot" />}<Icon name="cast" size={15} /></button>
          <button className={"iconbtn" + (takeover === "history" ? " on" : "")} onClick={() => summonTakeover("history")}
            title="Version history">{versions.length > 0 && <span className="ed-badge">{versions.length > 99 ? "99+" : versions.length}</span>}<Icon name="history" size={15} /></button>
          <button className={"iconbtn" + (focused ? " on" : "")} onClick={onToggleFocus}
            title={focused ? "Exit fullscreen (Esc)" : "Fullscreen — write without the Kronicler chrome"}>
            <Icon name={focused ? "shrink" : "expand"} size={15} />
          </button>
          {onImport && (
            <button className="iconbtn" onClick={onImport} title="Import a manuscript"><Icon name="import" size={15} /></button>
          )}
        </span>
      </div>

      {err && <p className="err">{err}</p>}

      <div className={"ed-body" + (panel ? " has-panel" : "")}>
        {findOpen && (
          <div className="ed-find" role="search">
            <div className="ed-find-field">
              <Icon name="search" size={15} style={{ color: "var(--faint)", flex: "0 0 auto" }} />
              <input ref={findInputRef} className="ed-find-input" value={findQuery} placeholder="Find in chapter"
                aria-label="Find in chapter"
                onChange={(e) => { const v = e.target.value; setFindQuery(v); runFind(v); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
                  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFind(); }
                }} />
              <span className="ed-find-count" aria-live="polite">
                {findQuery.trim() === "" ? "" : findRes.count === 0 ? "0/0" : `${findRes.index + 1}/${findRes.count}`}
              </span>
            </div>
            <button className={"ed-find-btn ed-find-case" + (findCase ? " on" : "")} aria-pressed={findCase}
              onClick={toggleFindCase} title="Match case">Aa</button>
            <span className="ed-find-div" />
            <button className="ed-find-btn" disabled={findRes.count === 0} onClick={() => stepFind(-1)} aria-label="Previous match" title="Previous (⇧⏎)"><Icon name="chevron-up" size={16} /></button>
            <button className="ed-find-btn" disabled={findRes.count === 0} onClick={() => stepFind(1)} aria-label="Next match" title="Next (⏎)"><Icon name="chevron-down" size={16} /></button>
            <button className="ed-find-btn" onClick={closeFind} aria-label="Close find" title="Close (Esc)"><Icon name="close" size={16} /></button>
          </div>
        )}
        <div className={"ed-prose" + (cleanText ? " clean" : "")} ref={scroller}>
          {/* Mark-entity card floats over the prose, anchored to the selection
              (portaled to <body> so the prose column's overflow can't clip it —
              the old inline card was cut off under the toolbar). */}
          {entMode === "mark" && createPortal((() => {
            const W = 360;
            const flip = markAt ? markAt.y > window.innerHeight - 300 : false;
            const left = markAt ? Math.max(12, Math.min(markAt.x - W / 2, window.innerWidth - W - 12)) : (window.innerWidth - W) / 2;
            const top = markAt ? (flip ? markAt.y - 12 : markAt.y + 22) : 110;
            return (
              <>
                <div onMouseDown={() => setEntMode(null)} style={{ position: "fixed", inset: 0, zIndex: 315 }} />
                <div className="card ed-markent ed-markent-pop"
                  style={{ position: "fixed", zIndex: 320, width: W, left, top, transform: flip ? "translateY(-100%)" : "none", maxHeight: "min(70vh, 520px)", overflowY: "auto" }}
                  onKeyDown={(e) => { if (e.key === "Escape") setEntMode(null); }}>
                  <div className="ed-markent-head">
                    <span className="muted">Mark</span>
                    <span className="title-serif">“{selWord}”</span>
                    <span className="spacer" style={{ flex: 1 }} />
                    <button className="iconbtn" onClick={() => setEntMode(null)} title="Close (Esc)"><Icon name="close" size={15} /></button>
                  </div>

                  {/* Primary path: create it. Marking a name you just wrote almost
                      always means "make this real" — so lead with that, type inline,
                      one click to add + link. Searching existing is the fallback below. */}
                  <div className="ed-markent-new" style={{ paddingTop: 0, borderTop: "none" }}>
                    <span className="ed-panel-lab" style={{ marginBottom: 0 }}>Add as a</span>
                    <select className="sel" value={newType} onChange={(e) => setNewType(e.target.value)}>
                      {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value={CUSTOM_TYPE}>+ Custom type…</option>
                    </select>
                    {newType === CUSTOM_TYPE && (
                      <input autoFocus value={customType} placeholder="New type (e.g. Deity)" style={{ width: 140 }}
                        onChange={(e) => setCustomType(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") createFromSelection(); }} />
                    )}
                    <button className="primary" autoFocus={newType !== CUSTOM_TYPE} onClick={createFromSelection}>Add “{selWord}”</button>
                  </div>

                  {/* Fallback: only when there's a cast to link to. Records the word
                      as another name (alias) for someone who already exists. */}
                  {ents.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <span className="ed-panel-lab" style={{ marginBottom: 0 }}>Already written it? Link to an existing one instead</span>
                      <input value={aliasQuery} placeholder="Search your characters, places, items…" style={{ width: "100%" }}
                        onChange={(e) => setAliasQuery(e.target.value)} />
                      {aliasQuery.trim() && (
                        <div className="ed-markent-results">
                          {aliasMatches.map((e) => (
                            <span key={e.id} className="chip click" onClick={() => addAliasTo(e)} title={`Record “${selWord}” as another name for ${e.title}`}>
                              {e.title} <span className="faint" style={{ marginLeft: 4 }}>{e.type}</span>
                            </span>
                          ))}
                          {aliasMatches.length === 0 && <span className="muted">No match — use “Add” above to create it.</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })(), document.body)}

          {activeChapter && (
            <ChapterBlock key={activeChapter.id} worldId={worldId} chapter={activeChapter} entities={ents} stateOf={stateOf}
              onOpenEntity={onOpenEntity} onSelect={onSelect}
              onMentions={onMentions}
              onMarkEntity={(id, at) => openMarkEntity(id, at)}
              onMarkMoment={(id, anchor) => { setEntChId(id); setPendingAnchor(anchor); setComposerOpen(true); }}
              onComment={onComment} registerApi={registerApi} onSaveState={setChSaveState}
              onActive={setActive} marks={momentMarks} onMarkClick={focusOnMoment}
              onDateChanged={() => onChapterMetaChanged?.()} />
          )}
        </div>

        {/* Summoned panel (§3.4): docks in the empty right space as a side nav,
            available in focus mode too. One at a time. Empty by default. */}
        {panel && activeChapter && (
          <div className="ed-panel">
            <div className="ed-panel-head">
              <span className="ed-panel-title">{panel === "comments" ? "Comments" : panel === "notes" ? "Notes" : "Continuity"}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <button className="iconbtn" onClick={() => setPanel(null)} title="Close panel"><Icon name="close" size={15} /></button>
            </div>
            <div className="ed-panel-body">
              {panel === "comments" && (
                <ChapterComments key={activeChapter.id} worldId={worldId} chapterId={activeChapter.id}
                  chapters={chapterRefs} bookIds={bookIds} body={activeChapter.body || ""}
                  pending={pendingComment && pendingComment.chapterId === activeChapter.id
                    ? { start: pendingComment.start, end: pendingComment.end, quote: pendingComment.quote } : null}
                  onPendingConsumed={() => setPendingComment(null)}
                  onJump={jumpComment} onNavigate={onNavigate} onCount={setCommentCount}
                  getSelection={() => proseApis.current.get(openId)?.currentSelection() ?? null} />
              )}
              {panel === "notes" && (
                <ChapterNotes key={activeChapter.id} worldId={worldId} chapterId={activeChapter.id}
                  chapters={chapterRefs} bookIds={bookIds} onNavigate={onNavigate} onCount={setNoteCount} />
              )}
              {panel === "continuity" && (() => {
                const visible = activeMentions.filter((e) => !dismissed.has(e.id));
                const unlinked = visible.filter((e) => !castIds.includes(e.id));
                return (
                  <div className="ed-panel-sect">
                    {!momentNetOff && (
                      <div className="moment-net">
                        <span>Select a line where something shifts — who trusts who, what changed, who found out — and Kronicler will remember it.</span>
                        <button className="iconbtn" title="Got it" onClick={dismissMomentNet}><Icon name="close" size={13} /></button>
                      </div>
                    )}
                    {offer && (
                      <div className="moment-offer">
                        <span><b>{offer.aTitle}</b> and <b>{offer.bTitle}</b> appear together here.</span>
                        <div className="moment-offer-q">“{offer.quote}”</div>
                        <button className="primary" onClick={acceptOffer}>Record what changes</button>
                      </div>
                    )}
                    <div className="ed-panel-lab">In this chapter {visible.length > 0 && <span className="ed-panel-count">{visible.length}</span>}</div>
                    {unlinked.length > 1 && (
                      <button className="sm" style={{ marginBottom: 8 }} onClick={() => linkAll(unlinked.map((e) => e.id))}
                        title="Add all detected characters to this chapter">Add all {unlinked.length}</button>
                    )}
                    {visible.length === 0 && <span className="muted">No known names mentioned yet.</span>}
                    {visible.map((e) => {
                      const linked = castIds.includes(e.id);
                      return (
                        <div className="row" key={e.id} style={{ padding: "7px 0", gap: 6, borderColor: "var(--line)" }}>
                          <span style={{ flex: 1, fontSize: 13 }}>{e.title}</span>
                          {linked
                            ? <span className="muted" style={{ fontSize: 11 }}>in chapter</span>
                            : <button className="sm" onClick={() => link(e.id)} title="Add to this chapter">Add</button>}
                          <span title="Not this — hide the suggestion" onClick={() => setDismissed((d) => new Set(d).add(e.id))}
                            style={{ cursor: "pointer", color: "var(--faint)", display: "inline-flex" }}><Icon name="close" size={13} /></span>
                        </div>
                      );
                    })}
                    {chapterMoments.length > 0 && (
                      <div className="ed-panel-lab" style={{ marginTop: 14 }}>Recorded here <span className="ed-panel-count">{momentCount}</span></div>
                    )}
                    {chapterMoments.map(({ s, stale }) => (
                      <div className={"row" + (s.state_id === focusMoment ? " moment-focus" : "")} key={s.state_id}
                        ref={s.state_id === focusMoment ? momentRowRef : undefined}
                        style={{ padding: "7px 0", gap: 6, borderColor: "var(--line)", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                          <span aria-hidden style={{ color: VALENCE_COLOR[s.valence], marginRight: 5 }}>✳</span>
                          {s.participants.map((p) => p.title).join(" · ")} <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 600 }}>{s.type_label}</span>
                        </span>
                        {stale && (
                          <div className="moment-stale">
                            This no longer points at any text — the passage was edited or removed.
                            <button onClick={() => reanchorState(s.state_id)} title="Attach to the current selection">Re-anchor</button>
                            <button onClick={() => deleteMoment(s.state_id)}>Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="ed-panel-lab" style={{ marginTop: 14 }}>The story so far</div>
                    {!brief ? <span className="muted">Computing…</span>
                      : <BriefPanel brief={brief} chapterOrder={activeChapter.manuscript_order} nameOf={nameOf} onOpenEntity={onOpenEntity} compact />}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Takeover (§3.4): replaces the editing surface; prose goes read-only. */}
        {takeover === "history" && (
          <div className="ed-takeover">
            <div className="ed-takeover-head">
              <button className="iconbtn" onClick={() => setTakeover(null)} title="Back to the chapter"><Icon name="chevron-left" size={16} /></button>
              <span className="ed-takeover-title">Version history</span>
            </div>
            <div className="ed-takeover-body">
              {versions.length === 0 && <span className="muted">No versions yet — they're snapshotted as you write.</span>}
              {versions.map((v) => (
                <div className="row" key={v.id} style={{ padding: "9px 0", gap: 8, borderColor: "var(--line)" }}>
                  <span className="muted" style={{ fontSize: 12, flex: 1 }}>{new Date(v.created_at).toLocaleString()}</span>
                  <button className="sm" onClick={() => restore(v)}>restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {composerOpen && activeChapter && (() => {
        const ch = chapters.find((c) => c.id === entChId) ?? activeChapter;
        return (
          <Composer
            worldId={worldId}
            chapterId={ch.id}
            chapterOrder={ch.manuscript_order}
            chapterTitle={ch.title}
            entities={ents}
            types={types}
            castIds={castIds}
            note={selText.trim()}
            anchor={pendingAnchor}
            onClose={() => { setComposerOpen(false); setPendingAnchor(null); }}
            onAppended={() => { reloadActiveSide(activeId); bumpMarked(); }}
            onTypesChanged={() => getRelationshipTypes(worldId).then(setTypes).catch(() => {})}
          />
        );
      })()}
    </div>
  );
}
