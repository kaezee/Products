import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRelationshipTypes, getChapterVersions, getChapterEntities,
  linkChapterEntity, saveChapterBody, getStream,
  getEntities, createEntity, updateEntity, updateChapterTitle, setChapterPlanned,
} from "../lib/api";
import type { Chapter, Entity, RelationshipType, ChapterVersion, ChapterEntity, StreamRow, Comment } from "../lib/types";
import { detectMentions } from "../lib/mentions";
import { computeBrief } from "../lib/brief";
import { statesAsOf } from "../lib/mentionState";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";
import { Composer } from "./Composer";
import { BriefPanel } from "./BriefPanel";
import { RichProse, type ProseApi } from "./RichProse";
import { ChapterDate } from "./ChapterDate";
import { ChapterNotes } from "./ChapterNotes";
import { ChapterComments } from "./ChapterComments";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import {
  READ_FACES, READ_SIZE_MIN, READ_SIZE_MAX, getReadFace, getReadSize, setReadFace, setReadSize, type ReadFace,
} from "../lib/readingPrefs";

type SaveState = "saved" | "saving" | "dirty";

// One chapter as a block in the continuous scroll: an inline title heading then
// its prose, with its own debounced autosave. Reports selections, mentions, and
// which block the caret is in up to the BookCanvas — the shared toolbar and the
// inspector act on whichever chapter is active.
function ChapterBlock({
  worldId, chapter, entities, stateOf, onOpenEntity, onSelect, onMentions,
  onMarkEntity, onMarkMoment, onComment, registerApi, onSaveState, onDateChanged,
}: {
  worldId: string;
  chapter: Chapter;
  entities: Entity[];
  stateOf: (id: string, order: number) => ReturnType<typeof statesAsOf>;
  onOpenEntity?: (id: string) => void;
  onSelect: (chapterId: string, text: string) => void;
  onMentions: (chapterId: string, ids: string[]) => void;
  onMarkEntity: (chapterId: string) => void;
  onMarkMoment: (chapterId: string) => void;
  onComment: (chapterId: string, range: { start: number; end: number; quote: string }) => void;
  registerApi: (chapterId: string, api: ProseApi | null) => void;
  onSaveState: (s: SaveState) => void;
  onDateChanged: () => void;
}) {
  const [body, setBody] = useState(chapter.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(chapter.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const clearedPlanned = useRef(false);

  const scheduleSave = useCallback((next: string) => {
    setSaveState("dirty");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveChapterBody(chapter.id, next);
        setSaveState("saved");
        if (chapter.planned && !clearedPlanned.current && next.trim()) {
          clearedPlanned.current = true;
          setChapterPlanned(chapter.id, false).catch(() => {});
        }
      } catch { setSaveState("dirty"); }
    }, 1200);
  }, [chapter.id, chapter.planned]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
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
          <span>Chapter {chapter.manuscript_order}</span>
          <span className="ed-dot">·</span>
          <button className={"ed-prop" + (editingDate ? " on" : "")} onClick={() => setEditingDate((v) => !v)}
            title="Set the in-world date — sets this chapter's place on the Timeline">
            {dateLabel || <span className="muted">add date</span>}
          </button>
          <span className="ed-dot">·</span><span>{words.toLocaleString()} {words === 1 ? "word" : "words"}</span>
          {chapter.planned && <span className="ed-kicker-plan">planned</span>}
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
        onOpenEntity={onOpenEntity}
        stateOf={stOf}
        onMarkEntity={() => onMarkEntity(chapter.id)}
        onMarkMoment={() => onMarkMoment(chapter.id)}
        onComment={(range) => onComment(chapter.id, range)}
        apiRef={(api) => registerApi(chapter.id, api)}
        placeholder="Write the chapter here. Known names light up as you type — hover one to peek. Select a sentence to record a state."
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
  focused: boolean;                    // fullscreen writing — owned by Manuscript (keeps the tree)
  onToggleFocus: () => void;
}) {
  const { worldId, chapters, openId, entities, bookIds, onOpenEntity, onNavigate, onChapterMetaChanged, focused, onToggleFocus } = props;
  const chapterRefs = useMemo(() => chapters.map((c) => ({ id: c.id, manuscript_order: c.manuscript_order, title: c.title })), [chapters]);

  // Prev/next chapter by manuscript order (spans books — a continuous read).
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.manuscript_order - b.manuscript_order), [chapters]);
  const idx = useMemo(() => ordered.findIndex((c) => c.id === openId), [ordered, openId]);
  const prevCh = idx > 0 ? ordered[idx - 1] : null;
  const nextCh = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;


  const [readFace, setReadFaceState] = useState<ReadFace>(getReadFace());
  const [readSize, setReadSizeState] = useState<number>(getReadSize());
  function changeFace(f: ReadFace) { setReadFace(f); setReadFaceState(f); }
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [noteCount, setNoteCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [chSaveState, setChSaveState] = useState<SaveState>("saved");
  // Summoned right-margin panels (one at a time) and full-surface takeovers.
  const [panel, setPanel] = useState<null | "comments" | "notes" | "continuity">(null);
  const [takeover, setTakeover] = useState<null | "history">(null);
  const summon = (p: "comments" | "notes" | "continuity") => { setTakeover(null); setPanel((cur) => (cur === p ? null : p)); };
  const summonTakeover = (t: "history") => { setPanel(null); setTakeover((cur) => (cur === t ? null : t)); };
  const [pendingComment, setPendingComment] = useState<{ chapterId: string; start: number; end: number; quote: string } | null>(null);
  // Each chapter block registers a small handle so a comment can jump to its range.
  const proseApis = useRef(new Map<string, ProseApi | null>());
  const registerApi = useCallback((chapterId: string, api: ProseApi | null) => {
    if (api) proseApis.current.set(chapterId, api); else proseApis.current.delete(chapterId);
  }, []);
  const onComment = useCallback((chapterId: string, range: { start: number; end: number; quote: string }) => {
    setActiveId(chapterId);
    setPendingComment({ chapterId, ...range });
    setTakeover(null); setPanel("comments");
  }, []);
  const jumpComment = useCallback((c: Comment): boolean => {
    return proseApis.current.get(c.chapter_id)?.selectRange(c.anchor_start, c.anchor_end, c.quote) ?? false;
  }, []);
  const [entMode, setEntMode] = useState<null | "mark">(null);
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

  // §3.6: one "Mark entity" flow — find an existing entity (records an alias) or
  // create a new one (adds it to the world). No separate New/Alias buttons.
  function openMarkEntity(chapterId: string) {
    const w = selText.trim();
    if (!w) return;
    setSelWord(w); setEntChId(chapterId);
    setNewType("Character"); setCustomType(""); setAliasQuery("");
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

  return (
    <div className="ed-shell">
      {/* Top toolbar: document chrome only — the things a Docs/Word writer already
          knows how to find. Kronicler's marking verbs live in the selection
          popover, never here (IA handoff §3.2). */}
      <div className="ed-toolbar">
        <button className="ed-fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.format("**")} title="Bold (⌘B)"><b>B</b></button>
        <button className="ed-fmt" onMouseDown={(e) => e.preventDefault()} onClick={() => proseApis.current.get(openId)?.format("*")} title="Italic (⌘I)"><i>I</i></button>
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
        <span className="spacer" style={{ flex: 1 }} />
        <span className="ed-save muted">{chSaveState === "saved" ? "saved" : chSaveState === "saving" ? "saving…" : "unsaved"}</span>
        {/* Summon icons (§3.4): each opens one panel; opening one closes the rest. */}
        <span className="ed-summon">
          <button className={"iconbtn" + (panel === "comments" ? " on" : "")} onClick={() => summon("comments")}
            title="Comments">{commentCount > 0 && <span className="ed-badge">{commentCount > 99 ? "99+" : commentCount}</span>}<Icon name="comment" size={15} /></button>
          <button className={"iconbtn" + (panel === "notes" ? " on" : "")} onClick={() => summon("notes")}
            title="Notes">{noteCount > 0 && <span className="ed-badge">{noteCount > 99 ? "99+" : noteCount}</span>}<Icon name="notes" size={15} /></button>
          <button className={"iconbtn" + (panel === "continuity" ? " on" : "")} onClick={() => summon("continuity")}
            title="Cast in this chapter">{unlinkedCount > 0 && <span className="ed-badge dot" />}<Icon name="cast" size={15} /></button>
          <button className={"iconbtn" + (takeover === "history" ? " on" : "")} onClick={() => summonTakeover("history")}
            title="Version history">{versions.length > 0 && <span className="ed-badge">{versions.length > 99 ? "99+" : versions.length}</span>}<Icon name="history" size={15} /></button>
          <button className={"iconbtn" + (focused ? " on" : "")} onClick={onToggleFocus}
            title={focused ? "Exit fullscreen (Esc)" : "Fullscreen — write without the Kronicler chrome"}>
            <Icon name={focused ? "shrink" : "expand"} size={15} />
          </button>
        </span>
      </div>

      {err && <p className="err">{err}</p>}

      <div className={"ed-body" + (panel ? " has-panel" : "")}>
        <div className="ed-prose" ref={scroller}>
          {entMode === "mark" && (
            <div className="card ed-markent" style={{ marginBottom: 8 }}>
              <div className="ed-markent-head">
                <span className="muted">Mark</span>
                <span className="title-serif">“{selWord}”</span>
                <span className="spacer" style={{ flex: 1 }} />
                <button onClick={() => setEntMode(null)}>Cancel</button>
              </div>
              <input autoFocus value={aliasQuery} placeholder="Find an existing character, place, item…" style={{ width: "100%" }}
                onChange={(e) => setAliasQuery(e.target.value)} />
              <div className="ed-markent-results">
                {aliasMatches.map((e) => (
                  <span key={e.id} className="chip click" onClick={() => addAliasTo(e)} title={`Record “${selWord}” as another name for ${e.title}`}>
                    {e.title} <span className="faint" style={{ marginLeft: 4 }}>{e.type}</span>
                  </span>
                ))}
                {aliasMatches.length === 0 && aliasQuery.trim() && <span className="muted">No match — create it below.</span>}
              </div>
              <div className="ed-markent-new">
                <span className="ed-panel-lab" style={{ marginBottom: 0 }}>New to the world</span>
                <select className="sel" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value={CUSTOM_TYPE}>+ Custom type…</option>
                </select>
                {newType === CUSTOM_TYPE && (
                  <input value={customType} placeholder="New type (e.g. Deity)" style={{ width: 140 }}
                    onChange={(e) => setCustomType(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createFromSelection(); }} />
                )}
                <button className="primary" onClick={createFromSelection}>Add to world</button>
              </div>
            </div>
          )}

          {activeChapter && (
            <ChapterBlock key={activeChapter.id} worldId={worldId} chapter={activeChapter} entities={ents} stateOf={stateOf}
              onOpenEntity={onOpenEntity} onSelect={onSelect}
              onMentions={onMentions}
              onMarkEntity={(id) => openMarkEntity(id)}
              onMarkMoment={(id) => { setEntChId(id); setComposerOpen(true); }}
              onComment={onComment} registerApi={registerApi} onSaveState={setChSaveState}
              onDateChanged={() => onChapterMetaChanged?.()} />
          )}
        </div>

        {/* Summoned panel (§3.4): docks in the empty right space as a side nav,
            available in focus mode too. One at a time. Empty by default. */}
        {panel && activeChapter && (
          <div className="ed-panel">
            <div className="ed-panel-head">
              <span className="ed-panel-title">{panel === "comments" ? "Comments" : panel === "notes" ? "Notes" : "Cast"}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <button className="iconbtn" onClick={() => setPanel(null)} title="Close panel"><Icon name="close" size={15} /></button>
            </div>
            <div className="ed-panel-body">
              {panel === "comments" && (
                <ChapterComments key={activeChapter.id} worldId={worldId} chapterId={activeChapter.id}
                  chapters={chapterRefs} bookIds={bookIds}
                  pending={pendingComment && pendingComment.chapterId === activeChapter.id
                    ? { start: pendingComment.start, end: pendingComment.end, quote: pendingComment.quote } : null}
                  onPendingConsumed={() => setPendingComment(null)}
                  onJump={jumpComment} onNavigate={onNavigate} onCount={setCommentCount} />
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
                    <div className="ed-panel-lab">In this chapter {visible.length > 0 && <span className="ed-panel-count">{visible.length}</span>}</div>
                    {unlinked.length > 1 && (
                      <button style={{ padding: "3px 9px", fontSize: 11, marginBottom: 8 }} onClick={() => linkAll(unlinked.map((e) => e.id))}
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
                            : <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => link(e.id)} title="Add to this chapter">Add</button>}
                          <span title="Not this — hide the suggestion" onClick={() => setDismissed((d) => new Set(d).add(e.id))}
                            style={{ cursor: "pointer", color: "var(--faint)", display: "inline-flex" }}><Icon name="close" size={13} /></span>
                        </div>
                      );
                    })}
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
                  <button style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => restore(v)}>restore</button>
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
            onClose={() => setComposerOpen(false)}
            onAppended={() => reloadActiveSide(activeId)}
            onTypesChanged={() => getRelationshipTypes(worldId).then(setTypes).catch(() => {})}
          />
        );
      })()}
    </div>
  );
}
