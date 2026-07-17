import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRelationshipTypes, getChapterVersions, getChapterEntities,
  linkChapterEntity, saveChapterBody, getStream,
  getEntities, createEntity, updateEntity,
} from "../lib/api";
import type { Chapter, Entity, RelationshipType, ChapterVersion, ChapterEntity, StreamRow } from "../lib/types";
import { detectMentions } from "../lib/mentions";
import { computeBrief } from "../lib/brief";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";
import { Composer } from "./Composer";
import { BriefPanel } from "./BriefPanel";

type SaveState = "saved" | "saving" | "dirty";

export function ChapterEditor(props: {
  worldId: string;
  chapter: Chapter;
  entities: Entity[];
  onBack: () => void;
}) {
  const { worldId, chapter, entities, onBack } = props;

  const [body, setBody] = useState(chapter.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selText, setSelText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  // Local copy of the cast so entities/aliases created from the prose light up
  // in the panel immediately, without bouncing back to the Manuscript list.
  const [ents, setEnts] = useState<Entity[]>(entities);
  const reloadEntities = useCallback(() => {
    getEntities(worldId).then(setEnts).catch((x) => setErr(String(x)));
  }, [worldId]);

  // select → act: promote a selected word to a new entity, or an alias.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [entMode, setEntMode] = useState<null | "new" | "alias">(null);
  const [selWord, setSelWord] = useState("");
  const [newType, setNewType] = useState("Character");
  const [customType, setCustomType] = useState("");
  const [aliasQuery, setAliasQuery] = useState("");

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [cast, setCast] = useState<ChapterEntity[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  const [stream, setStream] = useState<StreamRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const saveTimer = useRef<number | undefined>(undefined);

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

  // Brief: computed from the world stream once, when first opened.
  useEffect(() => {
    if (showBrief && stream === null) {
      getStream(worldId).then(setStream).catch((x) => setErr(String(x)));
    }
  }, [showBrief, stream, worldId]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const nameOf = useMemo(() => {
    const m = new Map(ents.map((e) => [e.id, e.title]));
    return (id: string) => m.get(id) ?? "someone";
  }, [ents]);
  const brief = useMemo(
    () => (stream ? computeBrief(stream, castIds, chapter.manuscript_order, typesById) : null),
    [stream, castIds, chapter.manuscript_order, typesById],
  );

  async function link(entityId: string) {
    try {
      await linkChapterEntity(chapter.id, entityId, "mentioned");
      setCast(await getChapterEntities(chapter.id));
    } catch (x) {
      setErr(String(x));
    }
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
    if (!confirm("Restore this version? Your current text is snapshotted first, so nothing is lost.")) return;
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
    <div>
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10 }}>
        <span className="tab" onClick={onBack} style={{ paddingLeft: 0 }}>← Manuscript</span>
        <span className="spacer" />
        <span className="muted">{saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : "unsaved changes"}</span>
        <span className={"tab" + (showBrief ? " on" : "")} onClick={() => setShowBrief((v) => !v)}>Brief</span>
        <span className="tab" onClick={() => setShowVersions((v) => !v)}>History ({versions.length})</span>
      </div>

      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: "0 0 12px" }}>
        Ch. {chapter.manuscript_order} — {chapter.title}
      </h2>

      {err && <p className="err">{err}</p>}

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <button disabled={!selText.trim()} onClick={() => openEntMode("new")}
              title="Turn the selected word into a new character, place, item…">✦ New entity</button>
            <button disabled={!selText.trim()} onClick={() => openEntMode("alias")}
              title="Attach the selected word as another name for an entity you already have">⚯ Alias of…</button>
            <button disabled={selText.trim().length < 3} onClick={() => setComposerOpen(true)}
              title={selText ? "Record a state from the selected sentence" : "Select a sentence in the draft first"}>
              ✳ Mark state change
            </button>
            <span className="muted" style={{ fontSize: 11.5 }}>select a word to make it an entity, or a sentence to mark what happened</span>
          </div>

          {entMode === "new" && (
            <div className="card" style={{ padding: 10, marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted">New entity</span>
              <span className="title-serif">“{selWord}”</span>
              <select className="sel" value={newType} onChange={(e) => setNewType(e.target.value)}>
                {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={CUSTOM_TYPE}>＋ Custom type…</option>
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
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); scheduleSave(e.target.value); }}
            onSelect={(e) => {
              const el = e.currentTarget;
              setSelText(el.value.slice(el.selectionStart, el.selectionEnd));
            }}
            placeholder="Write the chapter here. Select a sentence to record a state; your cast lights up on the right as you type."
            style={{
              width: "100%", minHeight: 420, resize: "vertical", fontFamily: "var(--serif)",
              fontSize: 16, lineHeight: 1.7, padding: 16,
            }}
          />
        </div>

        <div style={{ width: 230, flexShrink: 0 }}>
          {showBrief && (
            <div style={{ marginBottom: 4 }}>
              {!brief ? <p className="muted">Computing brief…</p>
                : <BriefPanel brief={brief} chapterOrder={chapter.manuscript_order} nameOf={nameOf} compact />}
            </div>
          )}
          {(() => {
            const visible = mentioned.filter((e) => !dismissed.has(e.id));
            return (
              <>
                <div className="label" style={{ marginTop: showBrief ? 22 : 0 }}>Cast detected · {visible.length}</div>
                <div className="card">
                  {visible.length === 0 && <div className="row"><span className="muted">No known entities mentioned yet.</span></div>}
                  {visible.map((e) => {
                    const linked = castIds.includes(e.id);
                    return (
                      <div className="row" key={e.id} style={{ padding: "8px 10px", gap: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{e.title}</span>
                        {linked
                          ? <span className="muted" style={{ fontSize: 11 }}>linked</span>
                          : <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => link(e.id)} title="Confirm — add to this chapter's cast">link</button>}
                        <span title="Not this — hide the suggestion" onClick={() => setDismissed((d) => new Set(d).add(e.id))}
                          style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13 }}>✕</span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {showVersions && (
            <>
              <div className="label">Version history</div>
              <div className="card">
                {versions.length === 0 && <div className="row"><span className="muted">No versions yet.</span></div>}
                {versions.map((v) => (
                  <div className="row" key={v.id} style={{ padding: "8px 12px", gap: 8 }}>
                    <span className="muted" style={{ fontSize: 11, flex: 1 }}>
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                    <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => restore(v)}>restore</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {composerOpen && (
        <Composer
          worldId={worldId}
          chapterId={chapter.id}
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
