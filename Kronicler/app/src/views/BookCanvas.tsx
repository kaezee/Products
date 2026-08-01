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
import { SidePanel, Disclosure } from "../components/SidePanel";
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
  chapter, entities, stateOf, onOpenEntity, onSelect, onMentions,
  onNewEntity, onAlias, onMarkMoment, onComment, registerApi,
}: {
  chapter: Chapter;
  entities: Entity[];
  stateOf: (id: string, order: number) => ReturnType<typeof statesAsOf>;
  onOpenEntity?: (id: string) => void;
  onSelect: (chapterId: string, text: string) => void;
  onMentions: (chapterId: string, ids: string[]) => void;
  onNewEntity: (chapterId: string) => void;
  onAlias: (chapterId: string) => void;
  onMarkMoment: (chapterId: string) => void;
  onComment: (chapterId: string, range: { start: number; end: number; quote: string }) => void;
  registerApi: (chapterId: string, api: ProseApi | null) => void;
}) {
  const [body, setBody] = useState(chapter.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [title, setTitle] = useState(chapter.title);
  const [editingTitle, setEditingTitle] = useState(false);
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

  const mentioned = useMemo(() => detectMentions(body, entities), [body, entities]);
  useEffect(() => { onMentions(chapter.id, mentioned.map((e) => e.id)); }, [mentioned, chapter.id]); // eslint-disable-line

  const stOf = useCallback((id: string) => stateOf(id, chapter.manuscript_order), [stateOf, chapter.manuscript_order]);

  return (
    <section className="ed-chapter" data-chapter={chapter.id}>
      <div className="ed-canvas-head">
        <div className="ed-kicker">
          <span>Chapter {chapter.manuscript_order}</span>
          {chapter.planned && <span className="ed-kicker-plan">planned</span>}
          <span className="ed-chapter-save muted">{saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "unsaved"}</span>
        </div>
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
        onNewEntity={() => onNewEntity(chapter.id)}
        onAlias={() => onAlias(chapter.id)}
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
  onOpenEntity?: (id: string) => void;
  onNavigate: (chapterId: string) => void;
}) {
  const { worldId, chapters, openId, entities, onOpenEntity, onNavigate } = props;

  // Prev/next chapter by manuscript order (spans books — a continuous read).
  const ordered = useMemo(() => [...chapters].sort((a, b) => a.manuscript_order - b.manuscript_order), [chapters]);
  const idx = useMemo(() => ordered.findIndex((c) => c.id === openId), [ordered, openId]);
  const prevCh = idx > 0 ? ordered[idx - 1] : null;
  const nextCh = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [focused]);

  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem("k.chpanel") !== "0");
  const [readFace, setReadFaceState] = useState<ReadFace>(getReadFace());
  const [readSize, setReadSizeState] = useState<number>(getReadSize());
  function togglePanel() {
    setPanelOpen((v) => { const n = !v; localStorage.setItem("k.chpanel", n ? "1" : "0"); return n; });
  }
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

  // Selection: text plus the chapter it lives in, so entity/moment actions hit
  // the right chapter even mid-scroll.
  const [selText, setSelText] = useState("");
  const [selChapterId, setSelChapterId] = useState(openId);
  const onSelect = useCallback((chapterId: string, text: string) => {
    setSelText(text); setSelChapterId(chapterId); if (text) setActiveId(chapterId);
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
  const [pendingComment, setPendingComment] = useState<{ chapterId: string; start: number; end: number; quote: string } | null>(null);
  // Each chapter block registers a small handle so a comment can jump to its range.
  const proseApis = useRef(new Map<string, ProseApi | null>());
  const registerApi = useCallback((chapterId: string, api: ProseApi | null) => {
    if (api) proseApis.current.set(chapterId, api); else proseApis.current.delete(chapterId);
  }, []);
  const onComment = useCallback((chapterId: string, range: { start: number; end: number; quote: string }) => {
    setActiveId(chapterId);
    setPendingComment({ chapterId, ...range });
  }, []);
  const jumpComment = useCallback((c: Comment): boolean => {
    return proseApis.current.get(c.chapter_id)?.selectRange(c.anchor_start, c.anchor_end, c.quote) ?? false;
  }, []);
  const [entMode, setEntMode] = useState<null | "new" | "alias">(null);
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

  function openEntMode(mode: "new" | "alias", chapterId: string) {
    const w = selText.trim();
    if (!w) return;
    setSelWord(w); setEntChId(chapterId);
    setNewType("Character"); setCustomType(""); setAliasQuery("");
    setEntMode(mode);
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

  return (
    <div className={"ed-shell" + (focused ? " ed-focus" : "")}>
      {/* Top toolbar: always-present writing tools, acting on the active chapter. */}
      <div className="ed-toolbar">
        <button disabled={!selText.trim()} onClick={() => openEntMode("new", selChapterId)}
          title="Turn the selected word into a new character, place, item…">✦ New entity</button>
        <button disabled={!selText.trim()} onClick={() => openEntMode("alias", selChapterId)}
          title="Attach the selected word as another name for an entity you already have">⚯ Alias</button>
        <button disabled={selText.trim().length < 3} onClick={() => { setEntChId(selChapterId); setComposerOpen(true); }}
          title={selText ? "Record what happens between two characters in the selected sentence" : "Select a sentence in the draft first"}>✳ Mark a moment</button>
        <span className="ed-hint">select a word → entity · a sentence → a moment</span>
        <span className="spacer" />
        <select className="sel ed-face" value={readFace} title="Font the chapter is set in"
          onChange={(e) => changeFace(e.target.value as ReadFace)}>
          {READ_FACES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <div className="ed-size">
          <button disabled={readSize <= READ_SIZE_MIN} onClick={() => changeSize(readSize - 1)} title="Smaller">−</button>
          <span>{readSize}</span>
          <button disabled={readSize >= READ_SIZE_MAX} onClick={() => changeSize(readSize + 1)} title="Larger">+</button>
        </div>
        <button className="iconbtn" onClick={() => setFocused((f) => !f)}
          title={focused ? "Exit focus mode (Esc)" : "Focus mode — distraction-free writing"}>
          <Icon name={focused ? "shrink" : "expand"} size={15} />
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="ed-body">
        <div className="ed-prose" ref={scroller}>
          {entMode === "new" && (
            <div className="card" style={{ padding: 10, marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted">New entity</span>
              <span className="title-serif">“{selWord}”</span>
              <select className="sel" value={newType} onChange={(e) => setNewType(e.target.value)}>
                {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={CUSTOM_TYPE}>+ Custom type…</option>
              </select>
              {newType === CUSTOM_TYPE && (
                <input autoFocus value={customType} placeholder="New type (e.g. Deity)" style={{ width: 140 }}
                  onChange={(e) => setCustomType(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createFromSelection(); }} />
              )}
              <button className="primary" onClick={createFromSelection}>Create &amp; mark present</button>
              <button onClick={() => setEntMode(null)}>Cancel</button>
            </div>
          )}

          {entMode === "alias" && (
            <div className="card" style={{ padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span className="muted">“{selWord}” is another name for</span>
                <input autoFocus value={aliasQuery} placeholder="search your entities…" style={{ width: 200 }}
                  onChange={(e) => setAliasQuery(e.target.value)} />
                <button onClick={() => setEntMode(null)}>Cancel</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {aliasMatches.map((e) => (
                  <span key={e.id} className="chip click" onClick={() => addAliasTo(e)}>
                    {e.title} <span className="faint" style={{ marginLeft: 4 }}>{e.type}</span>
                  </span>
                ))}
                {aliasMatches.length === 0 && <span className="muted">No match — try another search, or use “✦ New entity”.</span>}
              </div>
            </div>
          )}

          {activeChapter && (
            <ChapterBlock key={activeChapter.id} chapter={activeChapter} entities={ents} stateOf={stateOf}
              onOpenEntity={onOpenEntity} onSelect={onSelect}
              onMentions={onMentions}
              onNewEntity={(id) => openEntMode("new", id)} onAlias={(id) => openEntMode("alias", id)}
              onMarkMoment={(id) => { setEntChId(id); setComposerOpen(true); }}
              onComment={onComment} registerApi={registerApi} />
          )}

          {/* Prev/next — step through the manuscript without leaving the page. */}
          <div className="ed-nav">
            <button disabled={!prevCh} onClick={() => prevCh && onNavigate(prevCh.id)}
              title={prevCh ? `Previous: ${prevCh.title} (Alt+←)` : "This is the first chapter"}>
              <Icon name="chevron-left" size={14} /> {prevCh ? prevCh.title : "First chapter"}
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            <button disabled={!nextCh} onClick={() => nextCh && onNavigate(nextCh.id)}
              title={nextCh ? `Next: ${nextCh.title} (Alt+→)` : "This is the last chapter"}>
              {nextCh ? nextCh.title : "Last chapter"} <Icon name="chevron" size={14} />
            </button>
          </div>
        </div>

        {!focused && activeChapter && <SidePanel open={panelOpen} onToggle={togglePanel}>
          <Disclosure label="Chapter" defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="muted" style={{ fontSize: 11 }}>Ch. {activeChapter.manuscript_order} · {activeChapter.title}</span>
              <span className="muted" style={{ fontSize: 11 }}>In-world date — sets this chapter's place on the Timeline.</span>
              <ChapterDate key={activeChapter.id} worldId={worldId} chapter={activeChapter} onChanged={() => {}} />
            </div>
          </Disclosure>

          <Disclosure label="Notes" count={noteCount} defaultOpen>
            <ChapterNotes key={activeChapter.id} worldId={worldId} chapterId={activeChapter.id} onCount={setNoteCount} />
          </Disclosure>

          <Disclosure label="Comments" count={commentCount} defaultOpen={commentCount > 0}
            openSignal={pendingComment && pendingComment.chapterId === activeChapter.id ? pendingComment : undefined}>
            <ChapterComments key={activeChapter.id} worldId={worldId} chapterId={activeChapter.id}
              pending={pendingComment && pendingComment.chapterId === activeChapter.id
                ? { start: pendingComment.start, end: pendingComment.end, quote: pendingComment.quote } : null}
              onPendingConsumed={() => setPendingComment(null)}
              onJump={jumpComment} onCount={setCommentCount} />
          </Disclosure>

          {(() => {
            const visible = activeMentions.filter((e) => !dismissed.has(e.id));
            const unlinked = visible.filter((e) => !castIds.includes(e.id));
            return (
              <Disclosure label="Cast detected" count={visible.length} defaultOpen>
                {unlinked.length > 1 && (
                  <button style={{ padding: "3px 9px", fontSize: 11, marginBottom: 8 }} onClick={() => linkAll(unlinked.map((e) => e.id))}
                    title="Add all detected characters to this chapter's cast">link all {unlinked.length}</button>
                )}
                {visible.length === 0 && <span className="muted">No known entities mentioned yet.</span>}
                {visible.map((e) => {
                  const linked = castIds.includes(e.id);
                  return (
                    <div className="row" key={e.id} style={{ padding: "7px 0", gap: 6, borderColor: "var(--line)" }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{e.title}</span>
                      {linked
                        ? <span className="muted" style={{ fontSize: 11 }}>linked</span>
                        : <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => link(e.id)} title="Confirm — add to this chapter's cast">link</button>}
                      <span title="Not this — hide the suggestion" onClick={() => setDismissed((d) => new Set(d).add(e.id))}
                        style={{ cursor: "pointer", color: "var(--faint)", display: "inline-flex" }}><Icon name="close" size={13} /></span>
                    </div>
                  );
                })}
              </Disclosure>
            );
          })()}

          <Disclosure label="Brief">
            {!brief ? <span className="muted">Computing brief…</span>
              : <BriefPanel brief={brief} chapterOrder={activeChapter.manuscript_order} nameOf={nameOf} onOpenEntity={onOpenEntity} compact />}
          </Disclosure>

          <Disclosure label="History" count={versions.length}>
            {versions.length === 0 && <span className="muted">No versions yet.</span>}
            {versions.map((v) => (
              <div className="row" key={v.id} style={{ padding: "7px 0", gap: 8, borderColor: "var(--line)" }}>
                <span className="muted" style={{ fontSize: 11, flex: 1 }}>{new Date(v.created_at).toLocaleString()}</span>
                <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => restore(v)}>restore</button>
              </div>
            ))}
          </Disclosure>
        </SidePanel>}
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
