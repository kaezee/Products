import { useEffect, useState } from "react";
import { getChapters, getEntities, createChapter, swapChapterOrder } from "../lib/api";
import type { Chapter, Entity } from "../lib/types";
import { ChapterEditor } from "./ChapterEditor";

export function Manuscript({ worldId, focusChapterId }: { worldId: string; focusChapterId?: string }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [openId, setOpenId] = useState<string | null>(focusChapterId ?? null);
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

  async function move(i: number, dir: -1 | 1, ev: React.MouseEvent) {
    ev.stopPropagation();
    const list = chapters ?? [];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    try {
      await swapChapterOrder(list[i], list[j]);
      await reload();
    } catch (x) { setErr(String(x)); }
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
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <h2 className="scope-title">Manuscript</h2>
        <span className="spacer" />
        <button onClick={addChapter}>+ New chapter</button>
      </div>
      <div className="card">
        {chapters.length === 0 && (
          <div className="row"><span className="muted">No chapters yet. Create one to start drafting.</span></div>
        )}
        {chapters.map((c, i) => (
          <div className="row click" key={c.id} onClick={() => setOpenId(c.id)}>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 0.9, marginRight: 2 }}>
              <span title="Move up" onClick={(ev) => move(i, -1, ev)}
                style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--faint)" : "var(--muted)", fontSize: 10 }}>▲</span>
              <span title="Move down" onClick={(ev) => move(i, 1, ev)}
                style={{ cursor: i === chapters.length - 1 ? "default" : "pointer", color: i === chapters.length - 1 ? "var(--faint)" : "var(--muted)", fontSize: 10 }}>▼</span>
            </span>
            <span className="muted" style={{ width: 44 }}>ch. {c.manuscript_order}</span>
            <span className="title-serif" style={{ flex: 1 }}>{c.title}</span>
            <span className="faint">{c.body.trim() ? `${c.body.trim().split(/\s+/).length} words` : "empty"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
