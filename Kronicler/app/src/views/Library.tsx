import { useEffect, useMemo, useState } from "react";
import { getEntities } from "../lib/api";
import type { Entity } from "../lib/types";

export function Library({ worldId }: { worldId: string }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);

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
  if (entities.length === 0) return <p className="muted">No entities yet.</p>;

  const currentType = activeType ?? types[0];
  const list = entities.filter((e) => e.type === currentType);

  return (
    <div>
      <div className="nav" style={{ marginBottom: 12 }}>
        {types.map((t) => (
          <span
            key={t}
            className={"tab" + (t === currentType ? " on" : "")}
            onClick={() => setActiveType(t)}
          >
            {t} <span className="muted">{entities.filter((e) => e.type === t).length}</span>
          </span>
        ))}
      </div>
      <div className="card">
        {list.map((e) => (
          <div className="row" key={e.id}>
            <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
            {e.aliases.length > 0 && (
              <span className="note">"{e.aliases.join('", "')}"</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
