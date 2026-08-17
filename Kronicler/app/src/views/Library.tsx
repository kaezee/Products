import { useEffect, useMemo, useState } from "react";
import { getEntities, getEntityTypes, createEntity, softDeleteEntity, renameEntityType, updateEntity, getStream, getRelationshipTypes, getChapters } from "../lib/api";
import type { Entity, EntityType, StreamRow, RelationshipType, Chapter } from "../lib/types";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE, plural, buildTypeSwatches } from "../lib/entityTypes";
import { isBelief } from "../lib/knowledge";
import { detectMentions } from "../lib/mentions";
import { EntityPage } from "./EntityPage";
import { ImportDocx } from "./ImportDocx";
import { TypeStyleEditor } from "./TypeStyleEditor";
import { Icon } from "../components/icons";
import { Explain } from "../components/Explain";
import { confirmDialog } from "../components/confirm";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import type { LeafCrumb } from "../App";

const DORMANT_GAP = 5; // chapters a thread can go untouched before it's "quiet"
const ABSENT_GAP = 3;  // chapters a cast member can be off-page before it's noted

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
  // For the "Gone quiet" section — the dormancy signals that moved off the
  // Overview (§7). Loaded alongside the cast.
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [quietHidden, setQuietHidden] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(`k.quiet.${worldId}`) || "[]")); } catch { return new Set<string>(); }
  });
  // Gone quiet is a nudge, not a headline — collapsed by default, remembers the
  // writer's last choice per world.
  const [quietOpen, setQuietOpen] = useState<boolean>(() => localStorage.getItem(`k.quietopen.${worldId}`) === "1");
  function toggleQuiet() {
    setQuietOpen((v) => { const n = !v; localStorage.setItem(`k.quietopen.${worldId}`, n ? "1" : "0"); return n; });
  }
  function dismissQuiet(id: string) {
    setQuietHidden((prev) => {
      const n = new Set(prev); n.add(id);
      localStorage.setItem(`k.quiet.${worldId}`, JSON.stringify([...n]));
      return n;
    });
  }
  async function reload() {
    try {
      const [ents, ets, st, rt, chs] = await Promise.all([getEntities(worldId), getEntityTypes(worldId), getStream(worldId), getRelationshipTypes(worldId), getChapters(worldId)]);
      setEntities(ents); setEntityTypes(ets); setStream(st); setRelTypes(rt); setChapters(chs);
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

  // Cast at a glance — "12 characters · 8 places · 3 factions", canonical
  // families first then anything custom by count (mirrors the old Overview
  // subtitle, now rehomed here per §7).
  const cast = useMemo(() => {
    if (!entities || entities.length === 0) return "";
    const counts = new Map<string, number>();
    for (const e of entities) { const t = (e.type || "").toLowerCase(); if (t) counts.set(t, (counts.get(t) ?? 0) + 1); }
    const ORDER = ["character", "place", "faction", "item"];
    return [...counts.entries()]
      .sort((a, b) => { const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]); return (ia !== ib ? (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) : b[1] - a[1] || a[0].localeCompare(b[0])); })
      .map(([t, n]) => `${n} ${n === 1 ? t : plural(t)}`).join(" · ");
  }, [entities]);

  // Threads that have gone quiet — the latest truth of each live relationship,
  // untouched for DORMANT_GAP chapters (ambient/terminal ones don't count).
  const dormant = useMemo(() => {
    if (!stream.length) return [];
    const now = stream.reduce((m, s) => Math.max(m, s.manuscript_order ?? 0), 0);
    const typesById = new Map(relTypes.map((t) => [t.id, t]));
    const latest = new Map<string, StreamRow>();
    for (const s of stream) {
      if (isBelief(s)) continue;
      const cur = latest.get(s.relationship_id);
      if (!cur || (s.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) latest.set(s.relationship_id, s);
    }
    return [...latest.values()].filter((s) => {
      const t = typesById.get(s.type_id);
      if (t?.is_ambient || t?.is_terminal) return false;
      return s.manuscript_order != null && now - s.manuscript_order >= DORMANT_GAP;
    });
  }, [stream, relTypes]);

  // Cast who have dropped off the page — last mentioned ABSENT_GAP+ chapters ago.
  const absent = useMemo(() => {
    const written = (chapters ?? []).filter((c) => !c.planned && (c.body || "").trim()).sort((a, b) => a.manuscript_order - b.manuscript_order);
    const lastSeen = new Map<string, number>();
    for (const c of written) for (const e of detectMentions(c.body, entities ?? [])) lastSeen.set(e.id, Math.max(lastSeen.get(e.id) ?? 0, c.manuscript_order));
    const maxOrder = written.length ? written[written.length - 1].manuscript_order : 0;
    return (entities ?? [])
      .filter((e) => lastSeen.has(e.id) && maxOrder - lastSeen.get(e.id)! >= ABSENT_GAP)
      .map((e) => ({ e, since: lastSeen.get(e.id)! }))
      .sort((a, b) => a.since - b.since);
  }, [chapters, entities]);

  const dormantList = dormant.filter((s) => !quietHidden.has("dor:" + s.state_id));
  const absentList = absent.filter(({ e }) => !quietHidden.has("abs:" + e.id));
  const quietCount = dormantList.length + absentList.length;

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
    if (!(await confirmDialog({ title: "Delete entity", message: `Delete "${e.title}"? It moves to the Trash — recoverable from Settings → Trash.`, confirmLabel: "Delete", tone: "danger" }))) return;
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
  // Seeded (registry) types are offered even before any entity uses them, so the
  // genre picked at creation actually pays off in the add-entity dropdown (§2.4).
  const registryExtra = entityTypes.map((r) => r.name).filter((n) => !isCanon(n) && !customInUse.includes(n));
  const typeOptions = [...CANONICAL_ENTITY_TYPES, ...registryExtra, ...customInUse];

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
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: cast ? 4 : 12 }}>
        <h2 className="scope-title">World</h2>
        <span className="spacer" />
        <button onClick={() => setImporting(true)}>Import .docx</button>
        {addMode !== "full" && <button onClick={openFull}>+ New</button>}
      </div>
      {/* The cast at a glance (redesign §7): the type breakdown that used to sit
          in the Overview subtitle now lives where the cast does. */}
      {cast && <p className="scope-sub" style={{ marginBottom: 14 }}>{cast}</p>}

      {/* Gone quiet (§7): threads and cast that have dropped out of the recent
          chapters — the dormancy signals rehomed from the Overview. Not errors,
          just a nudge; dismissable per item. Hidden while searching. */}
      {!query && quietCount > 0 && (
        <div className={"quiet" + (quietOpen ? " open" : "")}>
          <div className="quiet-head" onClick={toggleQuiet}>
            <span className="quiet-chev"><Icon name="chevron" size={14} /></span>
            <span className="quiet-lab">Gone quiet</span>
            <span className="quiet-count">{quietCount}</span>
            <span onClick={(ev) => ev.stopPropagation()} style={{ display: "inline-flex" }}>
              <Explain term="Gone quiet">Threads and cast that have dropped out of your recent chapters. Not errors — just a nudge, in case you meant to keep them alive.</Explain>
            </span>
            <span className="quiet-hint">{quietOpen ? "hide" : "show"}</span>
          </div>
          {quietOpen && (
            <div className="quiet-body">
              {dormantList.slice(0, 6).map((s) => (
                <div className="quiet-item" key={"dor" + s.state_id} onClick={() => s.participants[0]?.entity_id && setOpenId(s.participants[0].entity_id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>{s.participants.map((p) => p.title).join(" · ")} · {s.type_label} — untouched for a while.</span>
                  <button className="quiet-x" title="Got it — hide this" onClick={(ev) => { ev.stopPropagation(); dismissQuiet("dor:" + s.state_id); }}>×</button>
                </div>
              ))}
              {absentList.slice(0, Math.max(0, 6 - dormantList.slice(0, 6).length)).map(({ e, since }) => (
                <div className="quiet-item" key={"abs" + e.id} onClick={() => setOpenId(e.id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>{e.title} hasn't appeared since chapter {since}.</span>
                  <button className="quiet-x" title="Got it — hide this" onClick={(ev) => { ev.stopPropagation(); dismissQuiet("abs:" + e.id); }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        <EmptyState icon="nav-world" title="Nobody in the world yet"
          desc="Everyone and everything your story is made of — characters, places, factions, objects. Each one is an entity: add them here, and they light up in your prose as you write."
          steps={["Add someone, somewhere, or something", "Write them into a chapter", "Watch the web form"]}
          action={{ label: "Add your first character", onClick: openFull }}
          secondary={<button onClick={() => setImporting(true)}>Import from .docx</button>} />
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
