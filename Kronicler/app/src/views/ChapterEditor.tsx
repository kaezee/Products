import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRelationshipTypes, getChapterVersions, getChapterEntities,
  linkChapterEntity, saveChapterBody, getStream,
  getEntities, createEntity, updateEntity, updateChapterTitle, setChapterPlanned,
} from "../lib/api";
import type { Chapter, Entity, RelationshipType, ChapterVersion, ChapterEntity, StreamRow } from "../lib/types";
import { detectMentions } from "../lib/mentions";
import { computeBrief } from "../lib/brief";
import { statesAsOf } from "../lib/mentionState";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";
import { Composer } from "./Composer";
import { BriefPanel } from "./BriefPanel";
import { RichProse } from "./RichProse";
import { ChapterDate } from "./ChapterDate";
import { SidePanel, Disclosure } from "../components/SidePanel";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import {
  READ_FACES, READ_SIZE_MIN, READ_SIZE_MAX, getReadFace, getReadSize, setReadFace, setReadSize, type ReadFace,
} from "../lib/readingPrefs";

type SaveState = "saved" | "saving" | "dirty";

export function ChapterEditor(props: {
  worldId: string;
  chapter: Chapter;
  entities: Entity[];
  onOpenEntity?: (id: string) => void;
}) {
  const { worldId, chapter, entities, onOpenEntity } = props;

  const [body, setBody] = useState(chapter.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selText, setSelText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  // Focus mode (§ phase 2): a full-viewport, distraction-free writing surface.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setFocused(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [focused]);

  // The chapter side panel: collapsible, and it holds the reading controls.
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem("k.chpanel") !== "0");
  const [readFace, setReadFaceState] = useState<ReadFace>(getReadFace());
  const [readSize, setReadSizeState] = useState<number>(getReadSize());
  function togglePanel() {
    setPanelOpen((v) => { const n = !v; localStorage.setItem("k.chpanel", n ? "1" : "0"); return n; });
  }
  function changeFace(f: ReadFace) { setReadFace(f); setReadFaceState(f); }
  function changeSize(n: number) { setReadSize(n); setReadSizeState(getReadSize()); }

  // Local copy of the cast so entities/aliases created from the prose light up
  // in the panel immediately, without bouncing back to the Manuscript list.
  const [ents, setEnts] = useState<Entity[]>(entities);
  const reloadEntities = useCallback(() => {
    getEntities(worldId).then(setEnts).catch((x) => setErr(String(x)));
  }, [worldId]);

  // select → act: promote a selected word to a new entity, or an alias.
  const [title, setTitle] = useState(chapter.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [entMode, setEntMode] = useState<null | "new" | "alias">(null);
  const [selWord, setSelWord] = useState("");
  const [newType, setNewType] = useState("Character");
  const [customType, setCustomType] = useState("");
  const [aliasQuery, setAliasQuery] = useState("");

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [cast, setCast] = useState<ChapterEntity[]>([]);
  const [stream, setStream] = useState<StreamRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const saveTimer = useRef<number | undefined>(undefined);
  const clearedPlanned = useRef(false);

  const reloadSide = useCallback(() => {
    getRelationshipTypes(worldId).then(setTypes).catch((x) => setErr(String(x)));
    getChapterVersions(chapter.id).then(setVersions).catch((x) => setErr(String(x)));
    getChapterEntities(chapter.id).then(setCast).catch((x) => setErr(String(x)));
  }, [worldId, chapter.id]);

  useEffect(() => { reloadSide(); }, [reloadSide]);

  // Debounced autosave.
  const scheduleSave = useCallback((next: string) => {
    setSaveState("dirty");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveChapterBody(chapter.id, next);
        setSaveState("saved");
        // writing a planned beat turns it into a real chapter
        if (chapter.planned && !clearedPlanned.current && next.trim()) {
          clearedPlanned.current = true;
          setChapterPlanned(chapter.id, false).catch(() => {});
        }
        getChapterVersions(chapter.id).then(setVersions).catch(() => {});
      } catch (x) {
        setErr(String(x));
        setSaveState("dirty");
      }
    }, 1200);
  }, [chapter.id]);

  // Flush a pending save when leaving the editor.
  useEffect(() => {
    return () => window.clearTimeout(saveTimer.current);
  }, []);

  const mentioned = useMemo(() => detectMentions(body, ents), [body, ents]);
  const castIds = useMemo(() => cast.map((c) => c.entity_id), [cast]);

  const aliasMatches = useMemo(() => {
    const q = aliasQuery.trim().toLowerCase();
    const base = q
      ? ents.filter((e) => [e.title, ...e.aliases].some((n) => n.toLowerCase().includes(q)))
      : ents;
    return base.slice(0, 8);
  }, [ents, aliasQuery]);

  // The world stream: loaded once on open. Powers both the Brief and the
  // hover card's "as of here" standing, so a peek never waits on a fetch.
  useEffect(() => {
    getStream(worldId).then(setStream).catch((x) => setErr(String(x)));
  }, [worldId]);

  // The entity's relationships as the story stands at THIS chapter.
  const stateOf = useCallback(
    (id: string) => (stream ? statesAsOf(stream, id, chapter.manuscript_order) : []),
    [stream, chapter.manuscript_order],
  );

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const nameOf = useMemo(() => {
    const m = new Map(ents.map((e) => [e.id, e.title]));
    return (id: string) => m.get(id) ?? "someone";
  }, [ents]);
  const brief = useMemo(
    () => (stream ? computeBrief(stream, castIds, { manuscript_order: chapter.manuscript_order, story_time_ref: chapter.story_time_ref }, typesById) : null),
    [stream, castIds, chapter.manuscript_order, chapter.story_time_ref, typesById],
  );

  async function link(entityId: string) {
    try {
      await linkChapterEntity(chapter.id, entityId, "mentioned");
      setCast(await getChapterEntities(chapter.id));
    } catch (x) {
      setErr(String(x));
    }
  }

  async function linkAll(ids: string[]) {
    try {
      for (const id of ids) await linkChapterEntity(chapter.id, id, "mentioned");
      setCast(await getChapterEntities(chapter.id));
    } catch (x) { setErr(String(x)); }
  }

  function openEntMode(mode: "new" | "alias") {
    const w = selText.trim();
    if (!w) return;
    setSelWord(w);
    setNewType("Character");
    setCustomType("");
    setAliasQuery("");
    setEntMode(mode);
  }

  // Promote the selected word to a brand-new entity, and mark it present here.
  async function createFromSelection() {
    const title = selWord.trim();
    const type = (newType === CUSTOM_TYPE ? customType.trim() : newType) || "Character";
    if (!title) return;
    try {
      const e = await createEntity(worldId, type, title);
      await linkChapterEntity(chapter.id, e.id, "present");
      setEntMode(null);
      reloadEntities();
      setCast(await getChapterEntities(chapter.id));
    } catch (x) { setErr(String(x)); }
  }

  // Attach the selected word as another name for an existing entity, so the
  // scan recognizes it everywhere — and mark that entity present here.
  async function addAliasTo(target: Entity) {
    const alias = selWord.trim();
    if (!alias) return;
    const next = [...new Set([...target.aliases, alias])];
    try {
      await updateEntity(target.id, { aliases: next });
      await linkChapterEntity(chapter.id, target.id, "mentioned");
      setEntMode(null);
      reloadEntities();
      setCast(await getChapterEntities(chapter.id));
    } catch (x) { setErr(String(x)); }
  }

  async function restore(v: ChapterVersion) {
    if (!(await confirmDialog({ title: "Restore version", message: "Restore this version? Your current text is snapshotted first, so nothing is lost.", confirmLabel: "Restore" }))) return;
    try {
      await saveChapterBody(chapter.id, v.body);
      setBody(v.body);
      setSaveState("saved");
      reloadSide();
    } catch (x) {
      setErr(String(x));
    }
  }

  return (
    <div className={"ed-shell" + (focused ? " ed-focus" : "")}>
      <div className="ed-head">
        <span className="ed-num">{String(chapter.manuscript_order).padStart(2, "0")}</span>
        {editingTitle ? (
          <input autoFocus value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitle(chapter.title); setEditingTitle(false); } }}
            onBlur={async () => {
              const t = title.trim();
              setEditingTitle(false);
              if (!t || t === chapter.title) { setTitle(chapter.title); return; }
              try { await updateChapterTitle(chapter.id, t); } catch (x) { setErr(String(x)); }
            }}
            style={{ fontFamily: "var(--serif)", fontWeight: 500, fontSize: 22, flex: 1, padding: "2px 8px" }} />
        ) : (
          <h2 className="ed-title" title="Double-click to rename" onDoubleClick={() => setEditingTitle(true)}>{title}</h2>
        )}
        <span className="spacer" />
        <span className="ed-save muted">{saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "unsaved"}</span>
      </div>

      {/* Top toolbar: always-present writing tools. The Kronicler verbs on the
          left (they light up on a selection); font + size on the right. */}
      <div className="ed-toolbar">
        <button disabled={!selText.trim()} onClick={() => openEntMode("new")}
          title="Turn the selected word into a new character, place, item…">✦ New entity</button>
        <button disabled={!selText.trim()} onClick={() => openEntMode("alias")}
          title="Attach the selected word as another name for an entity you already have">⚯ Alias</button>
        <button disabled={selText.trim().length < 3} onClick={() => setComposerOpen(true)}
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
        <div className="ed-prose">

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
          <RichProse
            value={body}
            entities={ents}
            onChange={(v) => { setBody(v); scheduleSave(v); }}
            onSelectText={(t) => setSelText(t)}
            onOpenEntity={onOpenEntity}
            stateOf={stateOf}
            onNewEntity={() => openEntMode("new")}
            onAlias={() => openEntMode("alias")}
            onMarkMoment={() => setComposerOpen(true)}
            placeholder="Write the chapter here. Known names light up as you type — hover one to peek. Select a sentence to record a state."
          />
        </div>

        {!focused && <SidePanel open={panelOpen} onToggle={togglePanel}>
          <Disclosure label="Chapter" defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="muted" style={{ fontSize: 11 }}>In-world date — sets this chapter's place on the Timeline.</span>
              <ChapterDate worldId={worldId} chapter={chapter} onChanged={() => {}} />
            </div>
          </Disclosure>

          {(() => {
            const visible = mentioned.filter((e) => !dismissed.has(e.id));
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
              : <BriefPanel brief={brief} chapterOrder={chapter.manuscript_order} nameOf={nameOf} onOpenEntity={onOpenEntity} compact />}
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

      {composerOpen && (
        <Composer
          worldId={worldId}
          chapterId={chapter.id}
          chapterOrder={chapter.manuscript_order}
          chapterTitle={title}
          entities={ents}
          types={types}
          castIds={castIds}
          note={selText.trim()}
          onClose={() => setComposerOpen(false)}
          onAppended={() => reloadSide()}
          onTypesChanged={() => getRelationshipTypes(worldId).then(setTypes).catch(() => {})}
        />
      )}
    </div>
  );
}
