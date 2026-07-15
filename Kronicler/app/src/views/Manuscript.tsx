import { useEffect, useState } from "react";
import { getChapters, getEntities, createChapter } from "../lib/api";
import type { Chapter, Entity } from "../lib/types";
import { ChapterEditor } from "./ChapterEditor";

export function Manuscript({ worldId }: { worldId: string }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    try {
      const [c, e] = await Promise.all([getChapters(worldId), getEntities(worldId)]);
      setChapters(c);
      setEntities(e);
    } catch (x) {
      setErr(String(x));
    }
  }

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  async function addChapter() {
    const title = prompt("Chapter title");
    if (!title) return;
    const order = (chapters ?? []).reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1;
    try {
      const c = await createChapter(worldId, title, order);
      setChapters((prev) => [...(prev ?? []), c]);
      setOpenId(c.id);
    } catch (x) {
      setErr(String(x));
    }
  }

  if (err) return <p className="err">{err}</p>;
  if (!chapters) return <p className="muted">Loading manuscript…</p>;

  const open = openId ? chapters.find((c) => c.id === openId) : null;
  if (open) {
    return (
      <ChapterEditor
        worldId={worldId}
        chapter={open}
        entities={entities}
        onBack={() => { setOpenId(null); void reload(); }}
      />
    );
  }

  return (
    <div>
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <span className="spacer" />
        <button onClick={addChapter}>+ New chapter</button>
      </div>
      <div className="card">
        {chapters.length === 0 && (
          <div className="row"><span className="muted">No chapters yet. Create one to start drafting.</span></div>
        )}
        {chapters.map((c) => (
          <div className="row" key={c.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(c.id)}>
            <span className="muted" style={{ width: 44 }}>ch. {c.manuscript_order}</span>
            <span className="title-serif" style={{ flex: 1 }}>{c.title}</span>
            <span className="muted">{c.body.trim() ? `${c.body.trim().split(/\s+/).length} words` : "empty"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
