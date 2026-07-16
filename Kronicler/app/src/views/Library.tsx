import { useEffect, useMemo, useState } from "react";
import { getEntities, createEntity } from "../lib/api";
import type { Entity } from "../lib/types";
import { EntityPage } from "./EntityPage";

const SUGGESTED_TYPES = ["Character", "Place", "Faction", "Item"];

export function Library({ worldId, focusEntityId }: { worldId: string; focusEntityId?: string }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusEntityId ?? null);
  const [openNew, setOpenNew] = useState(false);

  // new-entity form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Character");

  async function reload() {
    try { setEntities(await getEntities(worldId)); } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const types = useMemo(() => {
    if (!entities) return [];
    return [...new Set(entities.map((e) => e.type))].sort();
  }, [entities]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    try {
      const e = await createEntity(worldId, newType.trim() || "Character", name);
      setNewName("");
      setAdding(false);
      await reload();
      setOpenId(e.id);
      setOpenNew(true);
    } catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!entities) return <p className="muted">Loading entities…</p>;

  const openEntity = openId ? entities.find((e) => e.id === openId) : null;
  if (openEntity) {
    return (
      <EntityPage
        entity={openEntity}
        startEditing={openNew}
        onBack={() => { setOpenId(null); setOpenNew(false); void reload(); }}
        onChanged={() => reload()}
      />
    );
  }

  const currentType = activeType ?? types[0] ?? "Character";
  const list = entities.filter((e) => e.type === currentType);

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 14 }}>
        <h2 className="scope-title">Library</h2>
        <span className="spacer" />
        {!adding && <button onClick={() => setAdding(true)}>+ New</button>}
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 14, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newName} placeholder="Name" style={{ width: 200 }}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} />
          <input value={newType} placeholder="Type" style={{ width: 130 }}
            onChange={(e) => setNewType(e.target.value)} list="type-suggestions" />
          <datalist id="type-suggestions">
            {[...new Set([...SUGGESTED_TYPES, ...types])].map((t) => <option key={t} value={t} />)}
          </datalist>
          <button className="primary" onClick={create}>Create</button>
          <button onClick={() => setAdding(false)}>Cancel</button>
          <span className="muted">a character, place, faction, item — any type you name</span>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">No entities yet. Hit “+ New” to add your first character.</span></div></div>
      ) : (
        <>
          <div className="tabs">
            {types.map((t) => (
              <span key={t} className={"tab" + (t === currentType ? " on" : "")} onClick={() => setActiveType(t)}>
                {t}s <span className="faint">{entities.filter((e) => e.type === t).length}</span>
              </span>
            ))}
          </div>
          <div className="card">
            {list.map((e) => (
              <div className="row click" key={e.id} onClick={() => { setOpenNew(false); setOpenId(e.id); }}>
                <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
                {e.aliases.length > 0 && <span className="note">"{e.aliases.join('", "')}"</span>}
                <span className="faint">→</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
