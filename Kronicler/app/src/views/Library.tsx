import { useEffect, useMemo, useState } from "react";
import { getEntities, createEntity, softDeleteEntity } from "../lib/api";
import type { Entity } from "../lib/types";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE, plural } from "../lib/entityTypes";
import { EntityPage } from "./EntityPage";
import { ImportDocx } from "./ImportDocx";

export function Library({ worldId, focusEntityId }: { worldId: string; focusEntityId?: string }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusEntityId ?? null);
  const [openNew, setOpenNew] = useState(false);

  // Two ways to add. "full" (top-right) lets you choose the type. "quick"
  // (under a section) is name-only and locked to that section's type — so you
  // don't re-pick the type for every character on the same shelf.
  const [addMode, setAddMode] = useState<null | "full" | "quick">(null);
  const [newName, setNewName] = useState("");
  const [formType, setFormType] = useState<string>("Character");
  const [customType, setCustomType] = useState("");
  const [importing, setImporting] = useState(false);

  async function reload() {
    try { setEntities(await getEntities(worldId)); } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  // Sections = types in use, canonical first (in canonical order), then custom
  // alphabetically. Empty sections drop off on their own.
  const types = useMemo(() => {
    if (!entities) return [];
    const present = new Set(entities.map((e) => e.type));
    const canon = CANONICAL_ENTITY_TYPES.filter((t) => present.has(t));
    const custom = [...present].filter((t) => !CANONICAL_ENTITY_TYPES.includes(t as never)).sort();
    return [...canon, ...custom];
  }, [entities]);

  const currentType = (activeType && types.includes(activeType)) ? activeType : (types[0] ?? "Character");
  const isCanon = (t: string) => CANONICAL_ENTITY_TYPES.includes(t as never);

  function openFull() {
    setFormType(isCanon(currentType) ? currentType : CUSTOM_TYPE);
    setCustomType(isCanon(currentType) ? "" : currentType);
    setNewName("");
    setAddMode("full");
  }
  function openQuick() {
    setNewName("");
    setAddMode("quick");
  }

  async function create() {
    const name = newName.trim();
    const type = addMode === "quick"
      ? currentType
      : (formType === CUSTOM_TYPE ? customType.trim() : formType) || "Character";
    if (!name || !type) return;
    try {
      const e = await createEntity(worldId, type, name);
      setActiveType(type);
      if (addMode === "quick") {
        // stay in rapid-entry mode: clear the name, keep the form open
        setNewName("");
        await reload();
      } else {
        setAddMode(null);
        await reload();
        setOpenId(e.id);
        setOpenNew(true);
      }
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

  const customInUse = [...new Set(entities.map((e) => e.type))].filter((t) => !isCanon(t));
  const typeOptions = [...CANONICAL_ENTITY_TYPES, ...customInUse];
  const list = entities.filter((e) => e.type === currentType);

  return (
    <div className="fi">
      {/* section-level control: add-anything lives up here, next to the title */}
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 14 }}>
        <h2 className="scope-title">Library</h2>
        <span className="spacer" />
        <button onClick={() => setImporting(true)}>Import .docx</button>
        {addMode !== "full" && <button onClick={openFull}>+ New</button>}
      </div>

      {importing && (
        <ImportDocx
          worldId={worldId}
          mode="entities"
          startOrder={1}
          onClose={() => setImporting(false)}
          onDone={() => reload()}
        />
      )}

      {addMode === "full" && (
        <div className="card" style={{ marginBottom: 14, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newName} placeholder="Name" style={{ width: 220 }}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAddMode(null); }} />
          <select className="sel" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={CUSTOM_TYPE}>＋ Custom type…</option>
          </select>
          {formType === CUSTOM_TYPE && (
            <input value={customType} placeholder="New type (e.g. Deity)" style={{ width: 150 }}
              onChange={(e) => setCustomType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
          )}
          <button className="primary" onClick={create}>Create</button>
          <button onClick={() => setAddMode(null)}>Cancel</button>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="card"><div className="row"><span className="muted">
          No entities yet — hit “+ New” to add your first character, place, or faction.
        </span></div></div>
      ) : (
        <>
          <div className="tabs">
            {types.map((t) => (
              <span key={t} className={"tab" + (t === currentType ? " on" : "")} onClick={() => { setActiveType(t); setAddMode(null); }}>
                {plural(t)} <span className="faint">{entities.filter((e) => e.type === t).length}</span>
              </span>
            ))}
          </div>

          <div className="card">
            {list.map((e) => (
              <div className="row click" key={e.id} onClick={() => { setOpenNew(false); setOpenId(e.id); }}>
                <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
                {e.aliases.length > 0 && <span className="note">"{e.aliases.join('", "')}"</span>}
                <span className="del" title={`Delete ${e.title}`} onClick={(ev) => del(e, ev)}
                  style={{ color: "var(--faint)", cursor: "pointer", padding: "0 4px", fontSize: 13 }}>✕</span>
              </div>
            ))}
            {list.length === 0 && <div className="row"><span className="muted">No {plural(currentType).toLowerCase()} yet.</span></div>}
          </div>

          {/* per-section quick add: name-only, type locked to this shelf */}
          {addMode === "quick" ? (
            <div className="card" style={{ marginTop: 10, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input autoFocus value={newName} placeholder={`New ${currentType.toLowerCase()} name`} style={{ width: 240 }}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAddMode(null); }} />
              <button className="primary" onClick={create}>Add</button>
              <button onClick={() => setAddMode(null)}>Done</button>
              <span className="muted">Enter to add another {currentType.toLowerCase()} — stays on this shelf</span>
            </div>
          ) : (
            <button style={{ marginTop: 10 }} onClick={openQuick}>+ New {currentType}</button>
          )}
        </>
      )}
    </div>
  );
}
