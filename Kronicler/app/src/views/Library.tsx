import { useEffect, useMemo, useState } from "react";
import { getEntities, getEntityTypes, createEntity, softDeleteEntity, renameEntityType, updateEntity } from "../lib/api";
import type { Entity, EntityType } from "../lib/types";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE, plural, buildTypeSwatches } from "../lib/entityTypes";
import { EntityPage } from "./EntityPage";
import { ImportDocx } from "./ImportDocx";
import { TypeStyleEditor } from "./TypeStyleEditor";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import type { LeafCrumb } from "../App";

export function Library({ worldId, focusEntityId, onLeaf }: { worldId: string; focusEntityId?: string; onLeaf?: (l: LeafCrumb | null) => void }) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusEntityId ?? null);
  const [openNew, setOpenNew] = useState(false);

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"az" | "recent">("az");
  // Which type groups are collapsed — persisted per world for the session (§8).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("k.wgroups." + worldId) || "[]")); } catch { return new Set(); }
  });
  function toggleGroup(t: string) {
    setCollapsed((prev) => {
      const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t);
      try { localStorage.setItem("k.wgroups." + worldId, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });
  }
  const [renamingType, setRenamingType] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  // Two ways to add. "full" (top-right) lets you choose the type. "quick"
  // (under a section) is name-only and locked to that section's type.
  const [addMode, setAddMode] = useState<null | "full" | "quick">(null);
  const [newName, setNewName] = useState("");
  const [formType, setFormType] = useState<string>("Character");
  const [customType, setCustomType] = useState("");
  const [importing, setImporting] = useState(false);

  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  async function reload() {
    try {
      const [ents, ets] = await Promise.all([getEntities(worldId), getEntityTypes(worldId)]);
      setEntities(ents); setEntityTypes(ets);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  // Report the open entity up to the breadcrumb (and clear it on unmount).
  useEffect(() => {
    const oe = openId && entities ? entities.find((e) => e.id === openId) : null;
    onLeaf?.(oe ? { label: oe.title, onClear: () => { setOpenId(null); setOpenNew(false); void reload(); } } : null);
    // eslint-disable-next-line
  }, [openId, entities]);
  useEffect(() => () => onLeaf?.(null), []); // eslint-disable-line

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

  async function create() {
    const name = newName.trim();
    const type = addMode === "quick"
      ? currentType
      : (formType === CUSTOM_TYPE ? customType.trim() : formType) || "Character";
    if (!name || !type) return;
    try {
      const e = await createEntity(worldId, type, name);
      setActiveType(type);
      if (addMode === "quick") { setNewName(""); await reload(); }
      else { setAddMode(null); await reload(); setOpenId(e.id); setOpenNew(true); }
    } catch (x) { setErr(String(x)); }
  }

  async function del(e: Entity, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!(await confirmDialog({ title: "Delete entity", message: `Delete "${e.title}"? It's soft-deleted — recoverable, nothing is truly lost.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try { await softDeleteEntity(e.id); await reload(); } catch (x) { setErr(String(x)); }
  }

  async function commitEntityRename(id: string) {
    const to = nameDraft.trim();
    setRenameId(null);
    const cur = (entities ?? []).find((e) => e.id === id);
    if (!to || to === cur?.title) return;
    try { await updateEntity(id, { title: to }); await reload(); } catch (x) { setErr(String(x)); }
  }

  async function commitRenameType() {
    const from = renamingType;
    const to = typeDraft.trim();
    setRenamingType(null);
    if (!from || !to || to === from) return;
    try { await renameEntityType(worldId, from, to); setActiveType(to); await reload(); }
    catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!entities) return <SkeletonRows rows={6} />;

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

  const q = query.trim().toLowerCase();
  const results = q
    ? entities
        .filter((e) => (e.title + " " + e.aliases.join(" ") + " " + e.body).toLowerCase().includes(q))
        .sort((a, b) => a.title.localeCompare(b.title))
    : [];
  const entitiesOf = (t: string) => {
    const l = entities.filter((e) => e.type === t);
    return sortBy === "az" ? [...l].sort((a, b) => a.title.localeCompare(b.title)) : l;
  };

  const row = (e: Entity, showType: boolean) => (
    <div className="row click" key={e.id} onClick={() => { if (renameId !== e.id) { setOpenNew(false); setOpenId(e.id); } }}>
      {showType && <span className="chip">{e.type}</span>}
      {renameId === e.id ? (
        <input autoFocus value={nameDraft} onClick={(ev) => ev.stopPropagation()}
          onChange={(ev) => setNameDraft(ev.target.value)}
          onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === "Enter") commitEntityRename(e.id); if (ev.key === "Escape") setRenameId(null); }}
          onBlur={() => commitEntityRename(e.id)}
          style={{ flex: 1, fontFamily: "var(--serif)", fontSize: 15, padding: "4px 8px" }} />
      ) : (
        <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
      )}
      {renameId !== e.id && e.aliases.length > 0 && <span className="note">"{e.aliases.join('", "')}"</span>}
      <span className="rowact" title={`Rename ${e.title}`}
        onClick={(ev) => { ev.stopPropagation(); setRenameId(e.id); setNameDraft(e.title); }}
        style={{ color: "var(--muted)", cursor: "pointer", padding: "0 2px", display: "inline-flex" }}><Icon name="edit" size={13} /></span>
      <span title={`Delete ${e.title}`} onClick={(ev) => del(e, ev)}
        style={{ color: "var(--faint)", cursor: "pointer", padding: "0 4px", display: "inline-flex" }}><Icon name="close" size={13} /></span>
    </div>
  );

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
        <h2 className="scope-title">World</h2>
        <span className="spacer" />
        <button onClick={() => setImporting(true)}>Import .docx</button>
        {addMode !== "full" && <button onClick={openFull}>+ New</button>}
      </div>

      {importing && (
        <ImportDocx worldId={worldId} mode="entities" startOrder={1}
          onClose={() => setImporting(false)} onDone={() => reload()} />
      )}

      {addMode === "full" && (
        <div className="card" style={{ marginBottom: 14, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input autoFocus value={newName} placeholder="Name" style={{ width: 220 }}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAddMode(null); }} />
          <select className="sel" value={formType} onChange={(e) => setFormType(e.target.value)}>
            {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={CUSTOM_TYPE}>+ Custom type…</option>
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
        <EmptyState icon="library" title="Nobody in the world yet"
          desc="Everyone and everything your story is made of — characters, places, factions, objects. Each one is an entity: add them here, and they light up in your prose as you write."
          steps={["Add someone, somewhere, or something", "Write them into a chapter", "Watch the web form"]}
          action={{ label: "Add your first character", onClick: openFull }}
          secondary={<button style={{ marginTop: 10 }} onClick={() => setImporting(true)}>Import from .docx</button>} />
      ) : (
        <>
          {/* search + sort */}
          <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 8 }}>
            <div className="searchwrap" style={{ maxWidth: 380 }}>
              <span className="ic"><Icon name="search" size={14} /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your world — name, alias, description…" />
            </div>
            {query && <span className="tab" onClick={() => setQuery("")}>clear</span>}
            {!query && (
              <>
                <span className="spacer" />
                <span className="faint" style={{ fontSize: 11 }}>Sort</span>
                <div className="seg" style={{ fontSize: 11 }}>
                  <span className={sortBy === "az" ? "on" : ""} onClick={() => setSortBy("az")}>A–Z</span>
                  <span className={sortBy === "recent" ? "on" : ""} onClick={() => setSortBy("recent")}>Recent</span>
                </div>
              </>
            )}
          </div>

          {query ? (
            <div className="card">
              <div className="row" style={{ background: "var(--inset)" }}><span className="muted">{results.length} match{results.length === 1 ? "" : "es"} across all sections</span></div>
              {results.map((e) => row(e, true))}
            </div>
          ) : (
            <>
              {/* All types at once, each a collapsible group (§8) — no tab bar */}
              {types.map((t) => {
                const list = entitiesOf(t);
                const open = !collapsed.has(t);
                const swatch = buildTypeSwatches(entityTypes, entities.map((e) => e.type)).get(t.toLowerCase()) ?? "slate";
                return (
                  <section key={t} className={"wgroup" + (open ? " open" : "")}>
                    <div className="wgroup-head" onClick={() => toggleGroup(t)}>
                      <span className="wgroup-chev"><Icon name="chevron" size={14} /></span>
                      {renamingType === t ? (
                        <input autoFocus value={typeDraft} onClick={(e) => e.stopPropagation()} style={{ width: 150, fontSize: 13, padding: "3px 8px" }}
                          onChange={(e) => setTypeDraft(e.target.value)}
                          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRenameType(); if (e.key === "Escape") setRenamingType(null); }}
                          onBlur={commitRenameType} />
                      ) : (
                        <h3 className="wgroup-title" title="Double-click to rename this group"
                          onDoubleClick={(e) => { e.stopPropagation(); setRenamingType(t); setTypeDraft(t); }}>{plural(t)}</h3>
                      )}
                      <span className="wgroup-count">{list.length}</span>
                      <span className="spacer" />
                      <span className="wgroup-add" onClick={(e) => { e.stopPropagation(); setActiveType(t); setNewName(""); setAddMode("quick"); if (collapsed.has(t)) toggleGroup(t); }}>+ New {t}</span>
                    </div>
                    {open && (
                      <div className="wgroup-body">
                        <TypeStyleEditor worldId={worldId} typeName={t}
                          row={entityTypes.find((r) => r.name.toLowerCase() === t.toLowerCase()) ?? null}
                          swatch={swatch} onChanged={reload} />
                        <div className="card">
                          {list.map((e) => row(e, false))}
                          {list.length === 0 && <div className="row"><span className="muted">No {plural(t).toLowerCase()} yet.</span></div>}
                        </div>
                        {addMode === "quick" && currentType === t && (
                          <div className="card" style={{ marginTop: 8, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input autoFocus value={newName} placeholder={`New ${t.toLowerCase()} name`} style={{ width: 240 }}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setAddMode(null); }} />
                            <button className="primary" onClick={create}>Add</button>
                            <button onClick={() => setAddMode(null)}>Done</button>
                            <span className="muted">Enter to add another — stays here</span>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
