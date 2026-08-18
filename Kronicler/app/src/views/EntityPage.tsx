import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getEntityStream, getEntityChapters, getEntities, getRelationshipTypes,
  createRelationshipType, updateRelationshipType, appendPairwiseState, appendGroupState, updateEntity, softDeleteEntity, getBands,
  updateStateType, softDeleteRelationship, swapParticipant,
  relationshipIdForState, setConnectionRoles,
  getNotes, createNote, updateNote, softDeleteNote,
} from "../lib/api";
import type { Entity, EntityType, StreamRow, RelationshipType, Valence, Note, Chapter, Band } from "../lib/types";
import type { EntityChapter } from "../lib/api";
import { VALENCE_COLOR, VALENCE_LABEL } from "../lib/valence";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE, buildTypeSwatches } from "../lib/entityTypes";
import { isDirectional, suggestInverse } from "../lib/direction";
import { Mention } from "../components/Mention";
import { isBelief } from "../lib/knowledge";
import { ArcSparkline } from "./ArcSparkline";
import { Icon } from "../components/icons";
import { confirmDialog } from "../components/confirm";
import { NotePad } from "../components/NotePad";

// The direction picker shared by the add-form and the edit-panel: "both ways"
// (symmetric) vs "directional", with an optional other-side word. When the
// names are known it shows a live plain-English preview of BOTH readings, so a
// writer can see at a glance which way round it points (and catch a backwards one).
function DirectionPicker({ forward, mode, inverse, selfName, otherName, onMode, onInverse, onInverseCommit }: {
  forward: string;
  mode: "mutual" | "directed";
  inverse: string;
  selfName?: string;
  otherName?: string;
  onMode: (m: "mutual" | "directed") => void;
  onInverse: (s: string) => void;
  onInverseCommit?: (s: string) => void;
}) {
  const suggestion = suggestInverse(forward);
  const a = selfName || "this one", b = otherName || "the other";
  const rev = inverse.trim();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="seg" style={{ fontSize: 11 }}>
          <span className={mode === "mutual" ? "on" : ""} onClick={() => onMode("mutual")}>↔ both ways</span>
          <span className={mode === "directed" ? "on" : ""} onClick={() => onMode("directed")}>→ one direction</span>
        </span>
        {mode === "directed" && (
          <>
            <span className="muted">reversed, it reads:</span>
            <input value={inverse} onChange={(e) => onInverse(e.target.value)}
              onBlur={(e) => onInverseCommit?.(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onInverseCommit?.((e.target as HTMLInputElement).value); }}
              placeholder={suggestion ? suggestion : "blank = one-way"} style={{ width: 130 }} />
            {suggestion && !rev && <span className="faint" style={{ fontSize: 11 }}>suggested: {suggestion}</span>}
          </>
        )}
      </div>
      {/* live preview of how each page will read it */}
      {selfName && otherName && (
        mode === "mutual" ? (
          <span className="faint" style={{ fontSize: 11.5 }}>
            reads the same both ways: <b>{a}</b> {forward || "…"} <b>{b}</b>, and <b>{b}</b> {forward || "…"} <b>{a}</b>.
          </span>
        ) : (
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
            On <b>{a}</b>’s page: {forward || "…"} <b>{b}</b>.<br />
            On <b>{b}</b>’s page: {rev ? <>{rev} <b>{a}</b></> : <span style={{ fontStyle: "italic" }}>nothing (one-way — the reverse isn’t stated)</span>}.
          </span>
        )
      )}
    </div>
  );
}

// The edit panel for an existing connection: change its type, swap who it joins,
// and set how each side reads (direction).
function EditConnection({ latest, selfId, selfName, otherId, others, types, onChangeType, onSwap, onApplyDirection, onDone }: {
  latest: StreamRow;
  selfId: string;
  selfName: string;
  otherId: string | null;
  others: Entity[];
  types: RelationshipType[];
  onChangeType: (stateId: string, typeId: string) => void;
  onSwap: (relId: string, oldId: string | null, newId: string) => void;
  onApplyDirection: (relId: string, roles: { entityId: string; role: string | null }[]) => void;
  onDone: () => void;
}) {
  const otherName = otherId ? others.find((o) => o.id === otherId)?.title
    ?? latest.participants.find((p) => p.entity_id === otherId)?.title : undefined;
  const otherRole = otherId ? latest.participants.find((p) => p.entity_id === otherId)?.role ?? null : null;
  const startDirectional = latest.participants.some((p) => !!p.role);
  const [mode, setMode] = useState<"mutual" | "directed">(startDirectional ? "directed" : "mutual");
  const [inverse, setInverse] = useState(otherRole ?? "");

  function apply(nextMode: "mutual" | "directed", nextInverse: string) {
    if (!otherId) return;
    const roles = nextMode === "mutual"
      ? [{ entityId: selfId, role: null }, { entityId: otherId, role: null }]
      : [{ entityId: selfId, role: latest.type_label }, { entityId: otherId, role: nextInverse.trim() || null }];
    onApplyDirection(latest.relationship_id, roles);
  }

  return (
    <div style={{ margin: "0 0 10px 24px", display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px", background: "var(--inset)", borderRadius: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select className="sel" value={latest.type_id} style={{ padding: "4px 8px", fontSize: 12.5 }}
          onChange={(e) => onChangeType(latest.state_id, e.target.value)}>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <span className="muted">with</span>
        <select className="sel" value={otherId ?? ""} style={{ padding: "4px 8px", fontSize: 12.5 }}
          onChange={(e) => onSwap(latest.relationship_id, otherId, e.target.value)}>
          {others.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={onDone}>Done</button>
      </div>
      {latest.participants.length === 2 ? (
        <>
          <DirectionPicker forward={latest.type_label} mode={mode} inverse={inverse}
            selfName={selfName} otherName={otherName}
            onMode={(m) => { setMode(m); apply(m, inverse); }}
            onInverse={setInverse}
            onInverseCommit={(s) => apply("directed", s)} />
          <span className="faint" style={{ fontSize: 11 }}>
            type / who it links to update in place · direction sets how each side reads (e.g. {latest.type_label} ↔ its opposite)
          </span>
        </>
      ) : (
        <span className="faint" style={{ fontSize: 11 }}>👥 group of {latest.participants.length} — reads the same for everyone (direction applies to one-to-one bonds)</span>
      )}
    </div>
  );
}

const isCanonical = (t: string) => (CANONICAL_ENTITY_TYPES as readonly string[]).includes(t);

const VALENCES: Valence[] = ["bond", "obligation", "neutral", "hostile"];

// Entity Document view (PRD §9.2): the body, with typed connections woven in —
// grouped by relationship, latest state shown, full history expandable. Also
// editable: title, type, aliases, body. Connections can be declared directly
// here (a standing fact like "wife/father"), not only from chapter prose.
export function EntityPage({ entity, onBack, onChanged, startEditing, onOpenEntity, entityTypes, chapters }: {
  entity: Entity;
  onBack: () => void;
  onChanged?: () => void;
  startEditing?: boolean;
  onOpenEntity?: (id: string) => void;
  entityTypes?: EntityType[];
  chapters?: Chapter[];
}) {
  const [bands, setBands] = useState<Band[]>([]);
  const [ent, setEnt] = useState<Entity>(entity);
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [appears, setAppears] = useState<EntityChapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);       // notes pinned to this entity (entity_ids ∋ id)
  const [openNote, setOpenNote] = useState<Note | "new" | null>(null);
  const [others, setOthers] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [addingConn, setAddingConn] = useState(false);
  const [editingRel, setEditingRel] = useState<string | null>(null);

  // edit state
  const [editing, setEditing] = useState(!!startEditing);
  const [title, setTitle] = useState(entity.title);
  const [type, setType] = useState(entity.type);
  const [aliases, setAliases] = useState(entity.aliases.join(", "));
  const [body, setBody] = useState(entity.body);
  const [busy, setBusy] = useState(false);

  function loadConnections() {
    getEntityStream(ent.id).then(setRows).catch((x) => setErr(String(x)));
  }
  const pinnedOf = (ns: Note[]) => ns.filter((n) => (n.entity_ids ?? []).includes(ent.id));
  function reloadNotes() {
    getNotes(ent.world_id).then((ns) => setNotes(pinnedOf(ns))).catch((x) => setErr(String(x)));
  }

  useEffect(() => {
    let alive = true;
    getEntityStream(ent.id).then((r) => alive && setRows(r)).catch((x) => alive && setErr(String(x)));
    getEntityChapters(ent.id).then((c) => alive && setAppears(c)).catch((x) => alive && setErr(String(x)));
    getRelationshipTypes(ent.world_id).then((t) => alive && setTypes(t)).catch((x) => alive && setErr(String(x)));
    getNotes(ent.world_id).then((ns) => alive && setNotes(pinnedOf(ns))).catch((x) => alive && setErr(String(x)));
    getBands(ent.world_id).then((b) => alive && setBands(b)).catch(() => {});
    getEntities(ent.world_id)
      .then((es) => alive && setOthers(es.filter((e) => e.id !== ent.id)))
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ent.id, ent.world_id]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  // Entity swatches for the mention treatment on connection names.
  const swatchMap = useMemo(
    () => buildTypeSwatches(entityTypes ?? [], others.map((e) => e.type)),
    [entityTypes, others],
  );
  const swatchFor = (entityId: string | null) => {
    const t = entityId ? others.find((o) => o.id === entityId)?.type : undefined;
    return t ? swatchMap.get(t.toLowerCase()) : undefined;
  };

  type Shape = "outbound" | "inbound-converse" | "inbound-noconverse" | "group";
  const groups = useMemo(() => {
    const m = new Map<string, StreamRow[]>();
    for (const r of rows ?? []) {
      if (isBelief(r)) continue; // connections are the truth; beliefs live in the lens
      const arr = m.get(r.relationship_id) ?? [];
      arr.push(r);
      m.set(r.relationship_id, arr);
    }
    return [...m.entries()].map(([relId, history]) => {
      const latest = history[history.length - 1];
      const parts = latest.participants;
      const otherParts = parts.filter((p) => p.entity_id !== ent.id);
      const others = otherParts.map((p) => p.title).join(" · ");
      const otherId = otherParts[0]?.entity_id ?? null;
      const kind = typeById.get(latest.type_id);
      // Direction from the KIND (the new model); fall back to the record's roles
      // for a kind whose flag isn't set yet. §2.3 three row shapes.
      const directed = kind?.directed ?? isDirectional(latest);
      const converse = kind?.converse ?? null;
      let shape: Shape = "outbound";
      let verb = latest.type_label;
      if (parts.length > 2) {
        shape = "group";
      } else if (directed) {
        // subject = owns the forward reading (role == label), else whoever holds
        // a role, else the first participant.
        const subj = parts.find((p) => p.role && p.role.toLowerCase() === latest.type_label.toLowerCase())
          ?? parts.find((p) => p.role) ?? parts[0];
        if (subj?.entity_id !== ent.id) {
          if (converse) { shape = "inbound-converse"; verb = converse; }
          else shape = "inbound-noconverse";
        }
      }
      return { relId, history, latest, others, otherId, otherParts, shape, verb, kind };
    });
  }, [rows, ent.id, typeById]);

  // Inbound rows with no converse group by kind (§2.4): one row per kind, up to
  // three names then +N. Everything else renders individually.
  const individualGroups = useMemo(() => groups.filter((g) => g.shape !== "inbound-noconverse"), [groups]);
  const noConverseByKind = useMemo(() => {
    const m = new Map<string, { kind: RelationshipType | undefined; typeLabel: string; typeId: string; valence: Valence; entries: typeof groups }>();
    for (const g of groups) {
      if (g.shape !== "inbound-noconverse") continue;
      const key = g.latest.type_id;
      const bucket = m.get(key) ?? { kind: g.kind, typeLabel: g.latest.type_label, typeId: key, valence: g.latest.valence, entries: [] as typeof groups };
      bucket.entries.push(g);
      m.set(key, bucket);
    }
    return [...m.values()];
  }, [groups]);

  // §2.5 the converse upgrade: capture a reverse word for a directed kind that
  // has none. Writes to the KIND, so every inbound row using it re-renders
  // verb-first at once (we patch local `types` to reflect it immediately).
  const [converseFor, setConverseFor] = useState<string | null>(null);
  const [converseDraft, setConverseDraft] = useState("");
  async function saveConverse(typeId: string) {
    const word = converseDraft.trim();
    if (!word) { setConverseFor(null); return; }
    try {
      await updateRelationshipType(typeId, { directed: true, converse: word });
      setTypes((ts) => ts.map((t) => (t.id === typeId ? { ...t, directed: true, converse: word } : t)));
      setConverseFor(null); setConverseDraft("");
    } catch (x) { setErr(String(x)); }
  }

  // §4 presence grid — binary shade (present vs absent), grouped by book, reusing
  // the Overview manuscript cells. Presence comes from mention detection (appears).
  const presence = useMemo(() => {
    const chs = chapters ?? [];
    if (chs.length === 0) return null;
    const present = new Set(appears.map((a) => a.chapter_id));
    const ordered = [...chs].sort((a, b) => a.manuscript_order - b.manuscript_order);
    const bandName = new Map(bands.map((b) => [b.id, b.name]));
    const bandOrder = new Map(bands.map((b) => [b.id, b.band_order]));
    const byBand = new Map<string, { name: string; order: number; chapters: Chapter[] }>();
    for (const c of ordered) {
      const key = c.band_id ?? "__none";
      if (!byBand.has(key)) byBand.set(key, {
        name: c.band_id ? (bandName.get(c.band_id) ?? "Book") : "Unfiled",
        order: c.band_id ? (bandOrder.get(c.band_id) ?? 998) : 999,
        chapters: [],
      });
      byBand.get(key)!.chapters.push(c);
    }
    const books = [...byBand.values()].sort((a, b) => a.order - b.order);
    const orders = ordered.filter((c) => present.has(c.id)).map((c) => c.manuscript_order).sort((a, b) => a - b);
    const ranges: string[] = [];
    for (let i = 0; i < orders.length; i++) {
      let j = i;
      while (j + 1 < orders.length && orders[j + 1] === orders[j] + 1) j++;
      ranges.push(i === j ? `${orders[i]}` : `${orders[i]}–${orders[j]}`);
      i = j;
    }
    return { books, present, presentCount: orders.length, total: ordered.length, ranges: ranges.join(", ") };
  }, [chapters, appears, bands]);
  const shade = (on: boolean) => `color-mix(in srgb, var(--k-action-fill) ${on ? 55 : 8}%, var(--surface))`;

  async function save() {
    setBusy(true);
    setErr(null);
    const patch = {
      title: title.trim() || ent.title,
      type: type.trim() || ent.type,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
      body,
    };
    try {
      await updateEntity(ent.id, patch);
      setEnt({ ...ent, ...patch });
      setEditing(false);
      onChanged?.();
    } catch (x) { setErr(String(x)); } finally { setBusy(false); }
  }

  async function del() {
    if (!(await confirmDialog({ title: "Delete entity", message: `Delete "${ent.title}"? It moves to the Trash — recoverable from Settings → Trash.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try { await softDeleteEntity(ent.id); onChanged?.(); onBack(); } catch (x) { setErr(String(x)); }
  }

  async function changeType(stateId: string, typeId: string) {
    try { await updateStateType(stateId, typeId); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  async function swapPerson(relId: string, oldId: string | null, newId: string) {
    if (!oldId || oldId === newId) return;
    try { await swapParticipant(relId, oldId, newId); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  async function applyDirection(relId: string, roles: { entityId: string; role: string | null }[]) {
    try { await setConnectionRoles(relId, roles); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  async function removeConnection(relId: string, label: string) {
    if (!(await confirmDialog({ title: "Remove connection", message: `Remove the "${label}" connection? Its recorded moments stop showing; you can connect them again later.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await softDeleteRelationship(relId); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  return (
    <div className="fi ent-page">
      {err && <p className="err">{err}</p>}

      {/* §1 identity card — name · type · description, with Edit/Delete inside it. */}
      {editing ? (
        <div className="card ent-card ent-edit">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name"
              style={{ fontFamily: "var(--serif)", fontSize: 18, flex: 1, minWidth: 200 }} />
            <select className="sel" value={isCanonical(type) ? type : CUSTOM_TYPE} style={{ width: 140 }}
              onChange={(e) => setType(e.target.value === CUSTOM_TYPE ? (isCanonical(type) ? "" : type) : e.target.value)}>
              {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={CUSTOM_TYPE}>+ Custom type…</option>
            </select>
            {!isCanonical(type) && (
              <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Custom type" style={{ width: 130 }} />
            )}
          </div>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Aliases, comma separated (e.g. The Warden, Warden)" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe this entity…"
            style={{ minHeight: 160, fontSize: 15, lineHeight: 1.7, padding: 12 }} />
          <span className="muted">Aliases matter — they're how the mention scan and ⌘K recognize this entity by its nicknames.</span>
          <div className="rel-actions">
            <button className="primary" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
            <button onClick={() => { setTitle(ent.title); setType(ent.type); setAliases(ent.aliases.join(", ")); setBody(ent.body); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card ent-card ent-identity">
          <div className="ent-identity-head">
            <div className="ent-identity-name">
              <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>{ent.title}</h2>
              <span className="chip">{ent.type}</span>
              {ent.aliases.length > 0 && <span className="note">also "{ent.aliases.join('", "')}"</span>}
            </div>
            <span className="spacer" />
            <button onClick={() => setEditing(true)}>Edit</button>
            <button className="ent-del" onClick={del}>Delete</button>
          </div>
          {ent.body
            ? <p style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.7, margin: "10px 0 0" }}>{ent.body}</p>
            : <p className="muted" style={{ margin: "10px 0 0" }}>No description yet — hit Edit to add one.</p>}
        </div>
      )}

      <div className="ent-sec-head">
        <div className="label" style={{ margin: 0 }}>Connections</div>
        <span className="spacer" />
        {!addingConn && others.length > 0 &&
          <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setAddingConn(true)}>+ Add connection</button>}
      </div>

      {addingConn && (
        <AddConnection
          worldId={ent.world_id}
          selfId={ent.id}
          selfTitle={ent.title}
          others={others}
          types={types}
          chapters={chapters}
          swatchFor={swatchFor}
          onClose={() => setAddingConn(false)}
          onAdded={() => {
            getRelationshipTypes(ent.world_id).then(setTypes).catch(() => {});
            loadConnections();
          }}
        />
      )}

      <div className="card">
        {!rows && <div className="row"><span className="muted">Loading connections…</span></div>}
        {rows && groups.length === 0 && (
          <div className="row"><span className="muted">No connections yet — add one above, or record one from a chapter draft.</span></div>
        )}
        {/* Outbound · inbound-with-converse · group — each renders verb-first,
            §2.3. Names carry the mention treatment and navigate. */}
        {individualGroups.map(({ relId, history, latest, otherParts, verb }) => {
          const isOpen = open === relId;
          const isEditing = editingRel === relId;
          const toggle = () => setOpen(isOpen ? null : relId);
          return (
            <div key={relId} style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ borderBottom: "none" }} title="Double-click to edit"
                onDoubleClick={() => setEditingRel(relId)}>
                <span className="muted" style={{ width: 10, cursor: "pointer" }} onClick={toggle}><Icon name={isOpen ? "chevron-down" : "chevron"} size={13} /></span>
                <span className="dot" style={{ background: VALENCE_COLOR[latest.valence] }} />
                <span style={{ color: VALENCE_COLOR[latest.valence], fontWeight: 600, fontSize: 12.5 }}>{verb}</span>
                <span style={{ flex: 1 }}>
                  {otherParts.map((p, i) => (
                    <span key={p.entity_id}>
                      {i > 0 && <span className="muted">, </span>}
                      <span className={onOpenEntity ? "conn-name click" : "conn-name"}
                        onClick={() => onOpenEntity?.(p.entity_id)}><Mention name={p.title} swatch={swatchFor(p.entity_id)} /></span>
                    </span>
                  ))}
                </span>
                {history.length > 1 && <ArcSparkline history={history} />}
                <span className="muted" title="Not tied to a specific chapter — a standing fact, true throughout">{latest.manuscript_order != null ? `ch. ${latest.manuscript_order}` : "no chapter"}</span>
                <span className="rowact" title="Edit this connection" onClick={() => setEditingRel(isEditing ? null : relId)}
                  style={{ cursor: "pointer", color: isEditing ? "var(--bond)" : "var(--muted)", fontSize: 12, padding: "0 2px" }}>edit</span>
                <span className="rowact" title="Remove connection" onClick={() => removeConnection(relId, latest.type_label)}
                  style={{ cursor: "pointer", color: "var(--faint)", padding: "0 2px", display: "inline-flex" }}><Icon name="close" size={13} /></span>
              </div>

              {isEditing && (
                <EditConnection latest={latest} selfId={ent.id} selfName={ent.title} otherId={otherParts[0]?.entity_id ?? null} others={others} types={types}
                  onChangeType={changeType} onSwap={swapPerson} onApplyDirection={applyDirection}
                  onDone={() => setEditingRel(null)} />
              )}

              {isOpen && (
                <div style={{ margin: "0 0 10px 42px", borderLeft: "2px solid var(--line)", paddingLeft: 14 }}>
                  {history.map((h) => {
                    const concealed = h.known_by?.concealed_from?.length ?? 0;
                    return (
                      <div key={h.state_id} style={{ marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ color: VALENCE_COLOR[h.valence], fontWeight: 600 }}>{h.type_label}</span>
                        <span className="muted" title="Not tied to a specific chapter"> · {h.manuscript_order != null ? `ch. ${h.manuscript_order}` : "no chapter"}</span>
                        {concealed > 0 && <span style={{ color: "var(--hostile)", fontSize: 11 }}> · secret ×{concealed}</span>}
                        {h.note && <span className="note"> — {h.note}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Inbound, no converse — grouped by kind (§2.4): ↳ names +N  kind, with
            the §2.5 affordance to give this direction a word. */}
        {noConverseByKind.map((b) => {
          const names = b.entries.map((g) => ({ id: g.otherId, title: g.otherParts[0]?.title ?? "?" }));
          const shown = names.slice(0, 3);
          const extra = names.length - shown.length;
          const capturing = converseFor === b.typeId;
          return (
            <div key={b.typeId} style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ borderBottom: "none", alignItems: "baseline" }}>
                <span style={{ width: 10, color: "var(--faint)" }}>↳</span>
                <span className="dot" style={{ background: VALENCE_COLOR[b.valence] }} />
                <span style={{ flex: 1 }}>
                  {shown.map((n, i) => (
                    <span key={n.id ?? i}>
                      {i > 0 && <span className="muted">, </span>}
                      <span className={onOpenEntity && n.id ? "conn-name click" : "conn-name"}
                        onClick={() => n.id && onOpenEntity?.(n.id)}><Mention name={n.title} swatch={swatchFor(n.id)} /></span>
                    </span>
                  ))}
                  {extra > 0 && <span className="muted"> +{extra}</span>}{" "}
                  <span style={{ color: VALENCE_COLOR[b.valence], fontWeight: 600 }}>{b.typeLabel}</span>
                </span>
                {!capturing && (
                  <span className="rowact" style={{ cursor: "pointer", color: "var(--k-action-text, var(--bond))", fontSize: 12 }}
                    onClick={() => { setConverseFor(b.typeId); setConverseDraft(""); }}>add a word for this direction</span>
                )}
              </div>
              {capturing && (
                <div style={{ margin: "0 0 10px 24px", padding: "8px 10px", background: "var(--inset)", borderRadius: 8, fontSize: 12.5 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>If someone <b>{b.typeLabel}</b> {ent.title}, what are they to {ent.title}?</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input autoFocus value={converseDraft} placeholder={`e.g. is ${b.typeLabel} by`} style={{ width: 200 }}
                      onChange={(e) => setConverseDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveConverse(b.typeId); if (e.key === "Escape") setConverseFor(null); }} />
                    <button className="primary" onClick={() => saveConverse(b.typeId)}>Save</button>
                    <button onClick={() => setConverseFor(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ent-sec-head"><div className="label" style={{ margin: 0 }}>Appears in</div></div>
      <div className="card ent-body">
        {!presence || presence.presentCount === 0 ? (
          <span className="muted">Not yet placed in any chapter.</span>
        ) : (
          <>
            <div className="ms-grid-stat" style={{ marginBottom: 14 }}>Chapters <b>{presence.ranges}</b> · {presence.presentCount} of {presence.total}</div>
            {presence.books.map((bk, i) => (
              <div className="ms-book" key={i}>
                {(presence.books.length > 1 || bk.name !== "Unfiled") && <div className="ms-book-lab"><b>{bk.name}</b></div>}
                <div className="ms-cells">
                  {bk.chapters.map((c) => (
                    <div key={c.id} className="ms-cell" style={{ "--sh": shade(presence.present.has(c.id)), cursor: "default" } as CSSProperties}
                      title={`Ch. ${c.manuscript_order} · ${c.title}${presence.present.has(c.id) ? " — appears" : ""}`} />
                  ))}
                </div>
              </div>
            ))}
            <div className="ms-legend" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7 }}>
              <span className="ms-cell" style={{ width: 14, height: 14, "--sh": shade(true), cursor: "default" } as CSSProperties} />
              <span className="muted" style={{ fontSize: 11.5 }}>shaded where {ent.title} appears</span>
            </div>
          </>
        )}
      </div>

      {/* Notes pinned to this character — the same notes that live on the planning
          board, surfaced where you'd look for them. Click one to read/edit. */}
      <div className="ent-sec-head">
        <div className="label" style={{ margin: 0 }}>Notes</div>
        <span className="spacer" />
        <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setOpenNote("new")}>+ Note</button>
      </div>
      <div className="card ent-body">
        {notes.length === 0
          ? <span className="muted">No notes pinned to {ent.title} yet. A note you pin here also shows on the planning board.</span>
          : (
            <div className="ent-notes">
              {notes.map((n) => (
                <button className="ent-note" key={n.id} onClick={() => setOpenNote(n)}>
                  {n.is_secret && <span className="ent-note-secret">secret</span>}
                  <span className="ent-note-body">{n.body}</span>
                </button>
              ))}
            </div>
          )}
      </div>

      {openNote && (
        <NotePad
          title={openNote === "new" ? "New note" : "Note"}
          helper={openNote === "new" ? `Pinned to ${ent.title} — also appears on the planning board.` : undefined}
          initial={openNote === "new" ? "" : openNote.body}
          saveLabel="Save"
          onClose={() => setOpenNote(null)}
          onSave={async (bodyText) => {
            if (openNote === "new") {
              const created = await createNote(ent.world_id, 80 + notes.length * 18, 80 + notes.length * 18, false, "app", bodyText);
              await updateNote(created.id, { entity_ids: [ent.id] });
            } else {
              await updateNote(openNote.id, { body: bodyText });
            }
            reloadNotes();
          }}
          onDelete={openNote === "new" ? undefined : async () => {
            const ok = await confirmDialog({ title: "Delete note", message: "Delete this note? It's removed from the character and the planning board. Recoverable from Trash.", confirmLabel: "Delete", tone: "danger" });
            if (ok) { await softDeleteNote(openNote.id); reloadNotes(); }
            return ok;
          }}
        />
      )}
    </div>
  );
}

// Declare a standing connection from this character to another — no chapter.
// Reuses the composer's type pattern: pick an existing relationship type, or
// name a new one and choose its valence family.
// The composer (§3): closed by default, revealed by "+ Add connection". Two
// type-to-search fields (kind · with), a mint well when naming a new kind, a
// direction well with Swap, then Add / Cancel. Nothing pre-filled or suggested.
function AddConnection({ worldId, selfId, selfTitle, others, types, chapters, swatchFor, onAdded, onClose }: {
  worldId: string;
  selfId: string;
  selfTitle: string;
  others: Entity[];
  types: RelationshipType[];
  chapters?: Chapter[];
  swatchFor: (id: string | null) => string | undefined;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [fromChapter, setFromChapter] = useState("");   // §3.4 optional, defaults to none
  const [kindQ, setKindQ] = useState("");
  const [kindId, setKindId] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);          // chose "+ create x"
  const [standing, setStanding] = useState<Valence | null>(null);   // §3.2 q1
  const [bothWays, setBothWays] = useState<boolean | null>(null);   // §3.2 q2
  const [picked, setPicked] = useState<string[]>([]);
  const [withQ, setWithQ] = useState("");
  const [subjectIsSelf, setSubjectIsSelf] = useState(true);         // §3.3 swap
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const kindRef = useRef<HTMLInputElement>(null);
  const withRef = useRef<HTMLInputElement>(null);

  const chosenKind = kindId ? types.find((t) => t.id === kindId) ?? null : null;
  const kq = kindQ.trim().toLowerCase();
  const kindMatches = useMemo(() => (kq ? types.filter((t) => t.label.toLowerCase().includes(kq)).slice(0, 6) : []), [types, kq]);
  const kindExact = types.find((t) => t.label.toLowerCase() === kq);
  const wq = withQ.trim().toLowerCase();
  const entityMatches = useMemo(
    () => (wq ? others.filter((e) => !picked.includes(e.id) && (e.title + " " + e.aliases.join(" ")).toLowerCase().includes(wq)).slice(0, 8) : []),
    [others, picked, wq],
  );

  const isGroup = picked.length >= 2;
  const isDirected = chosenKind ? chosenKind.directed : (minting ? bothWays === false : false);
  const kindLabel = chosenKind?.label ?? kindQ.trim();
  const standingColor = VALENCE_COLOR[chosenKind?.valence ?? standing ?? "neutral"];
  const showDirection = isDirected && picked.length === 1;
  const mintReady = !minting || (kindQ.trim().length > 0 && standing != null && bothWays != null);
  const canAdd = picked.length >= 1 && (chosenKind != null || (minting && kindQ.trim().length > 0)) && mintReady;

  const otherTitle = picked[0] ? others.find((o) => o.id === picked[0])?.title ?? "…" : "…";
  const subjTitle = subjectIsSelf ? selfTitle : otherTitle;
  const objTitle = subjectIsSelf ? otherTitle : selfTitle;
  const subjId = subjectIsSelf ? selfId : (picked[0] ?? null);
  const objId = subjectIsSelf ? (picked[0] ?? null) : selfId;

  async function commit() {
    if (!canAdd) return;
    setBusy(true); setErr(null);
    try {
      let tid = chosenKind?.id ?? null;
      if (!tid && minting) {
        const t = await createRelationshipType(worldId, kindQ.trim(), standing ?? "neutral", bothWays === false);
        tid = t.id;
      }
      if (!tid) { setErr("Choose or name a kind."); setBusy(false); return; }
      const manuscriptRef = fromChapter || null;
      if (isGroup) {
        await appendGroupState({ worldId, entityIds: [selfId, ...picked], typeId: tid, manuscriptRef });
      } else {
        const subject = subjectIsSelf ? selfId : picked[0];
        const object = subjectIsSelf ? picked[0] : selfId;
        const stateId = await appendPairwiseState({ worldId, entityA: subject, entityB: object, typeId: tid, manuscriptRef });
        if (isDirected) {
          const relId = await relationshipIdForState(stateId);
          // subject owns the forward reading (role == the kind label) so §2.3
          // renders it outbound on their page and inbound on the object's.
          await setConnectionRoles(relId, [{ entityId: subject, role: kindLabel }, { entityId: object, role: null }]);
        }
      }
      onAdded();
      onClose();   // §3.4 adding closes the composer
    } catch (x) { setErr(String(x)); setBusy(false); }
  }

  return (
    <div className="card rel-composer">
      <div className="rel-comp-head">New connection for <span className="title-serif">{selfTitle}</span></div>

      {/* §3.1 two search fields */}
      <div className="rel-comp-fields">
        <div className="rel-field2" style={{ flex: 1 }}>
          <span className="rel-lab">What kind</span>
          <div className="rel-search">
            {chosenKind || minting ? (
              <span className="chip on" style={{ cursor: "pointer" }}
                onClick={() => { setKindId(null); setMinting(false); setKindQ(""); setStanding(null); setBothWays(null); setTimeout(() => kindRef.current?.focus(), 0); }}>
                {chosenKind && <span className="dot" style={{ background: VALENCE_COLOR[chosenKind.valence] }} />}
                {chosenKind?.label ?? kindQ.trim()} <Icon name="close" size={12} />
              </span>
            ) : (
              <>
                <input ref={kindRef} autoFocus className="rel-search-input" value={kindQ}
                  placeholder="search or type a new kind…"
                  onChange={(e) => { setKindQ(e.target.value); setKindId(null); }}
                  onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
                {kindQ.trim() && (
                  <div className="typeahead rel-drop">
                    {kindMatches.map((t) => (
                      <div key={t.id} className="ta-row" onClick={() => { setKindId(t.id); setKindQ(t.label); }}>
                        <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />
                        <span style={{ flex: 1 }}>{t.label}</span>
                        <span className="muted" style={{ fontSize: 11 }}>{t.directed ? (t.converse ? `↔ ${t.converse}` : "one way") : "same both ways"}</span>
                      </div>
                    ))}
                    {!kindExact && (
                      <div className="ta-row" onClick={() => { setMinting(true); setKindId(null); }}>
                        <span style={{ color: "var(--k-action-text, var(--bond))" }}>＋ create “{kindQ.trim()}”</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="rel-field2" style={{ flex: 1.3 }}>
          <span className="rel-lab">With</span>
          <div className="rel-search">
            <div className="rel-chips">
              {picked.map((id) => {
                const e = others.find((o) => o.id === id);
                return (
                  <span key={id} className="chip on" style={{ cursor: "pointer" }} onClick={() => setPicked((p) => p.filter((x) => x !== id))}>
                    <Mention name={e?.title ?? "?"} swatch={swatchFor(id)} /> <Icon name="close" size={12} />
                  </span>
                );
              })}
              <input ref={withRef} className="rel-search-input" value={withQ}
                placeholder={picked.length ? "add another…" : "search your world — anyone, anywhere, anything…"}
                onChange={(e) => setWithQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
            </div>
            {entityMatches.length > 0 && (
              <div className="typeahead rel-drop">
                {entityMatches.map((e) => (
                  <div key={e.id} className="ta-row" onClick={() => { setPicked((p) => [...p, e.id]); setWithQ(""); withRef.current?.focus(); }}>
                    <span className="title-serif" style={{ flex: 1, fontSize: 14 }}>{e.title}</span>
                    <span style={{ fontSize: 11, color: "var(--k-text-tertiary, var(--faint))" }}>{e.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* §3.2 mint well */}
      {minting && kindQ.trim() && (
        <div className="rel-well">
          <div className="muted" style={{ marginBottom: 12 }}><b>“{kindQ.trim()}”</b> is a new kind — set it up once and every future connection reuses it.</div>
          <div className="rel-q">
            <span className="rel-lab">How do they stand?</span>
            <span className="seg rel-standing">
              {VALENCES.map((v) => (
                <span key={v} className={standing === v ? "on" : ""} onClick={() => setStanding(v)}>
                  <span className="rel-standing-dot" style={{ background: VALENCE_COLOR[v] }} />{VALENCE_LABEL[v]}
                </span>
              ))}
            </span>
          </div>
          <div className="rel-q">
            <span className="rel-lab">Does it read the same both ways?</span>
            <span className="seg">
              <span className={bothWays === true ? "on" : ""} onClick={() => setBothWays(true)}>Same both ways</span>
              <span className={bothWays === false ? "on" : ""} onClick={() => setBothWays(false)}>Different each way</span>
            </span>
          </div>
          <div className="faint" style={{ fontSize: 11 }}>“rival” reads the same from either side. “mother of” does not.</div>
        </div>
      )}

      {/* §3.3 direction well — one-to-one directed only */}
      {showDirection && (
        <div className="rel-well rel-dir">
          <span style={{ flex: 1, fontSize: 13 }}>
            <Mention name={subjTitle} swatch={swatchFor(subjId)} />{" "}
            <span style={{ color: standingColor, fontWeight: 600 }}>{kindLabel || "…"}</span>{" "}
            <Mention name={objTitle} swatch={swatchFor(objId)} />
          </span>
          <button onClick={() => setSubjectIsSelf((s) => !s)}>⇄ Swap who’s first</button>
        </div>
      )}
      {isGroup && <span className="faint" style={{ fontSize: 11 }}>👥 group — one shared relationship among {selfTitle} + {picked.length} others, reads the same for everyone.</span>}

      {/* §3.4 footer */}
      <div className="rel-actions">
        {(chapters ?? []).length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="rel-lab">From chapter — optional</span>
            <select className="sel" value={fromChapter} onChange={(e) => setFromChapter(e.target.value)}>
              <option value="">none</option>
              {[...(chapters ?? [])].sort((a, b) => a.manuscript_order - b.manuscript_order).map((c) => (
                <option key={c.id} value={c.id}>Ch. {c.manuscript_order} · {c.title}</option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        <button className="primary" onClick={commit} disabled={busy || !canAdd}>{busy ? "…" : "Add connection"}</button>
        <button onClick={onClose}>Cancel</button>
        {err && <span className="err">{err}</span>}
      </div>
    </div>
  );
}
