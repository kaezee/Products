import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRelationshipTypes, getChapterVersions, getChapterEntities,
  linkChapterEntity, saveChapterBody,
} from "../lib/api";
import type { Chapter, Entity, RelationshipType, ChapterVersion, ChapterEntity } from "../lib/types";
import { detectMentions } from "../lib/mentions";
import { Composer } from "./Composer";

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

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [cast, setCast] = useState<ChapterEntity[]>([]);
  const [showVersions, setShowVersions] = useState(false);
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

  const mentioned = useMemo(() => detectMentions(body, entities), [body, entities]);
  const castIds = useMemo(() => cast.map((c) => c.entity_id), [cast]);

  async function link(entityId: string) {
    try {
      await linkChapterEntity(chapter.id, entityId, "mentioned");
      setCast(await getChapterEntities(chapter.id));
    } catch (x) {
      setErr(String(x));
    }
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
        <span className="tab" onClick={() => setShowVersions((v) => !v)}>History ({versions.length})</span>
      </div>

      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: "0 0 12px" }}>
        Ch. {chapter.manuscript_order} — {chapter.title}
      </h2>

      {err && <p className="err">{err}</p>}

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8, gap: 8 }}>
            <button
              disabled={selText.trim().length < 3}
              onClick={() => setComposerOpen(true)}
              title={selText ? "Record a state from the selected sentence" : "Select a sentence in the draft first"}
            >
              ✳ Mark state change
            </button>
            <span className="muted">select a sentence in the draft, then mark what happened</span>
          </div>
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
          <div className="label" style={{ marginTop: 0 }}>Cast detected · {mentioned.length}</div>
          <div className="card">
            {mentioned.length === 0 && <div className="row"><span className="muted">No known entities mentioned yet.</span></div>}
            {mentioned.map((e) => {
              const linked = castIds.includes(e.id);
              return (
                <div className="row" key={e.id} style={{ padding: "8px 12px" }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{e.title}</span>
                  {linked
                    ? <span className="muted" style={{ fontSize: 11 }}>linked</span>
                    : <button style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => link(e.id)}>link</button>}
                </div>
              );
            })}
          </div>

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
          entities={entities}
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
