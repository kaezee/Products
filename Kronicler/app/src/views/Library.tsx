import { useEffect, useMemo, useState } from "react";
import { getEntities, createEntity, softDeleteEntity } from "../lib/api";
import type { Entity } from "../lib/types";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE, plural } from "../lib/entityTypes";
import { EntityPage } from "./EntityPage";

export function Library({ worldId, focusEntityId }: { worldId: string; focusEntityId?: string }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusEntityId ?? null);
  const [openNew, setOpenNew] = useState(false);

  // new-entity form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [formType, setFormType] = useState<string>("Character");
  const [customType, setCustomType] = useState("");

  async function reload() {
    try { setEntities(await getEntities(worldId)); } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  // Sections = the types actually in use, canonical ones first (in canonical
  // order), then any custom types alphabetically. Empty sections simply don't
  // appear — delete a type's last entity and its shelf goes away on its own.
  const types = useMemo(() => {
    if (!entities) return [];
    const present = new Set(entities.map((e) => e.type));
    const canon = CANONICAL_ENTITY_TYPES.filter((t) => present.has(t));
    const custom = [...present].filter((t) => !CANONICAL_ENTITY_TYPES.includes(t as never)).sort();
    return [...canon, ...custom];
  }, [entities]);

  const currentType = (activeType && types.includes(activeType)) ? activeType : (types[0] ?? "Character");

  function beginAdd() {
    setFormType(currentType && CANONICAL_ENTITY_TYPES.includes(currentType as never) ? currentType : "Character");
    setCustomType(currentType && !CANONICAL_ENTITY_TYPES.includes(currentType as never) ? currentType : "");
    if (currentType && !CANONICAL_ENTITY_TYPES.includes(currentType as never)) setFormType(CUSTOM_TYPE);
    setNewName("");
    setAdding(true);
  }

  async function create() {
    const name = newName.trim();
    const type = (formType === CUSTOM_TYPE ? customType.trim() : formType) || "Character";
    if (!name) return;
    try {
      const e = await createEntity(worldId, type, name);
      setAdding(false);
      setActiveType(type);
      await reload();
      setOpenId(e.id);
      setOpenNew(true);
    } catch (x) { setErr(String(x)); }
  }

  async function del(e: Entity, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirm(`Delete "${e.title}"? It's soft-deleted — recoverable, nothing is truly lost.`)) return;
    try { await softDeleteEntity(e.id); await reload(); } catch (x) { setErr(String(x)); }
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

  // The type <select> offers every canonical type, any custom type already in
  // use, and a deliberate "＋ Custom type…" — you can never mistype into a new
  // section by accident.
  const customInUse = [...new Set(entities.map((e) => e.type))].filter((t) => !CANONICAL_ENTITY_TYPES.includes(t as never));
  const typeOptions = [...CANONICAL_ENTITY_TYPES, ...customInUse];

  const list = entities.filter((e) => e.type === currentType);

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 14 }}>
        <h2 className="scope-title">Library</h2>
        <span className="spacer" />
      </div>

      {entities.length > 0 && (
        <div className="tabs">
          {types.map((t) => (
            <span key={t} className={"tab" + (t === currentType ? " on" : "")} onClick={() => setActiveType(t)}>
              {plural(t)} <span className="faint">{entities.filter((e) => e.type === t).length}</span>
            </span>
          ))}
        </div>
      )}

      {/* per-section list + its own add button underneath */}
      {entities.length > 0 && (
        <div className="card">
          {list.map((e) => (
            <div className="row click" key={e.id} onClick={() => { setOpenNew(false); setOpenId(e.id); }}>
              <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
              {e.aliases.length > 0 && <span className="note">"{e.aliases.join('", "')}"</span>}
              <span className="del" title={`Delete ${e.title}`} onClick={(ev) => del(e, ev)}
                style={{ color: "var(--faint)", cursor: "pointer", padding: "0 4px", fontSize: 13 }}>✕</span>
            </div>
          ))}
          {list.length === 0 && (
            <div className="row"><span className="muted">No {plural(currentType).toLowerCase()} yet.</span></div>
          )}
        </div>
      )}

      {!adding ? (
        <button style={{ marginTop: 12 }} onClick={beginAdd}>
          + New {entities.length > 0 ? currentType : "entity"}
        </button>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newName} placeholder="Name" style={{ width: 220 }}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAdding(false); }} />
          <select className="sel" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={CUSTOM_TYPE}>＋ Custom type…</option>
          </select>
          {formType === CUSTOM_TYPE && (
            <input autoFocus value={customType} placeholder="New type (e.g. Deity)" style={{ width: 150 }}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          )}
          <button className="primary" onClick={create}>Create</button>
          <button onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}

      {entities.length === 0 && !adding && (
        <p className="muted" style={{ marginTop: 10 }}>Pick a type and add your first character, place, or faction.</p>
      )}
    </div>
  );
}
