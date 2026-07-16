import { useEffect, useMemo, useRef, useState } from "react";
import { getEntities, getChapters } from "../lib/api";
import type { Entity, Chapter } from "../lib/types";
import type { Nav } from "../App";

// ⌘/Ctrl+K switcher (§9.5, the "Go to" verb): name/alias match, global, with
// create-new inline. Distinct from content search — this is "I know the name,
// get me there."
export function Palette({ worldId, close, go, onCreateWorld }: {
  worldId: string;
  close: () => void;
  go: (n: Nav) => void;
  onCreateWorld: () => void;
}) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    Promise.all([getEntities(worldId), getChapters(worldId)]).then(([e, c]) => { setEntities(e); setChapters(c); }).catch(() => {});
  }, [worldId]);

  const ql = q.trim().toLowerCase();
  const eHits = useMemo(
    () => (ql ? entities.filter((e) => (e.title + " " + e.aliases.join(" ")).toLowerCase().includes(ql)) : entities.slice(0, 6)),
    [entities, ql],
  );
  const cHits = useMemo(
    () => (ql ? chapters.filter((c) => c.title.toLowerCase().includes(ql)).slice(0, 4) : []),
    [chapters, ql],
  );

  return (
    <div className="palette-scrim" onClick={close}>
      <div className="palette pop" onClick={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to anything by name — or create" />
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {eHits.map((e) => (
            <div className="row click" key={e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
              <span className="title-serif">{e.title}</span>
              <span className="chip">{e.type}</span>
              {e.aliases.length > 0 && <span className="note">"{e.aliases[0]}"</span>}
            </div>
          ))}
          {cHits.map((c) => (
            <div className="row click" key={c.id} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
              <span style={{ fontWeight: 550 }}>Ch. {c.manuscript_order} — {c.title}</span>
              <span className="chip">Chapter</span>
            </div>
          ))}
          {ql.length > 0 && eHits.length === 0 && cHits.length === 0 && (
            <div className="row"><span className="muted">No match. Create entities by mentioning them in a chapter; add a world below.</span></div>
          )}
          <div className="row click" onClick={() => { close(); onCreateWorld(); }}>
            <span style={{ color: "var(--bond)", fontWeight: 650 }}>+ New world</span>
            <span className="muted">start a fresh world</span>
          </div>
        </div>
        <div className="palette-foot">
          <span>↵ open</span><span>esc dismiss</span><span>matches names and aliases — content search lives in the top bar</span>
        </div>
      </div>
    </div>
  );
}
