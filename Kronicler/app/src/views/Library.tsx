import { useEffect, useMemo, useState } from "react";
import { getEntities } from "../lib/api";
import type { Entity } from "../lib/types";
import { EntityPage } from "./EntityPage";

export function Library({ worldId, focusEntityId }: { worldId: string; focusEntityId?: string }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusEntityId ?? null);

  useEffect(() => {
    let alive = true;
    getEntities(worldId)
      .then((e) => alive && setEntities(e))
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const types = useMemo(() => {
    if (!entities) return [];
    return [...new Set(entities.map((e) => e.type))].sort();
  }, [entities]);

  if (err) return <p className="err">{err}</p>;
  if (!entities) return <p className="muted">Loading entities…</p>;

  const openEntity = openId ? entities.find((e) => e.id === openId) : null;
  if (openEntity) return <EntityPage entity={openEntity} onBack={() => setOpenId(null)} />;

  if (entities.length === 0) {
    return (
      <div className="fi">
        <h2 className="scope-title">Library</h2>
        <div className="card"><div className="row"><span className="muted">No entities yet. Mention someone in a chapter, or create one with ⌘K.</span></div></div>
      </div>
    );
  }

  const currentType = activeType ?? types[0];
  const list = entities.filter((e) => e.type === currentType);

  return (
    <div className="fi">
      <h2 className="scope-title" style={{ marginBottom: 14 }}>Library</h2>
      <div className="tabs">
        {types.map((t) => (
          <span key={t} className={"tab" + (t === currentType ? " on" : "")} onClick={() => setActiveType(t)}>
            {t}s <span className="faint">{entities.filter((e) => e.type === t).length}</span>
          </span>
        ))}
      </div>
      <div className="card">
        {list.map((e) => (
          <div className="row click" key={e.id} onClick={() => setOpenId(e.id)}>
            <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
            {e.aliases.length > 0 && <span className="note">"{e.aliases.join('", "')}"</span>}
            <span className="faint">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
