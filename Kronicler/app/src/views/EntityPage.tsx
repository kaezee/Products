import { useEffect, useMemo, useState } from "react";
import {
  getEntityStream, getEntityChapters, getEntities, getRelationshipTypes,
  createRelationshipType, appendPairwiseState, updateEntity, softDeleteEntity,
  updateStateType, softDeleteRelationship,
} from "../lib/api";
import type { Entity, StreamRow, RelationshipType, Valence } from "../lib/types";
import type { EntityChapter } from "../lib/api";
import { VALENCE_COLOR } from "../lib/valence";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";

const isCanonical = (t: string) => (CANONICAL_ENTITY_TYPES as readonly string[]).includes(t);

const VALENCES: Valence[] = ["bond", "hostile", "obligation", "neutral"];

// Entity Document view (PRD §9.2): the body, with typed connections woven in —
// grouped by relationship, latest state shown, full history expandable. Also
// editable: title, type, aliases, body. Connections can be declared directly
// here (a standing fact like "wife/father"), not only from chapter prose.
export function EntityPage({ entity, onBack, onChanged, startEditing }: {
  entity: Entity;
  onBack: () => void;
  onChanged?: () => void;
  startEditing?: boolean;
}) {
  const [ent, setEnt] = useState<Entity>(entity);
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [appears, setAppears] = useState<EntityChapter[]>([]);
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

  useEffect(() => {
    let alive = true;
    getEntityStream(ent.id).then((r) => alive && setRows(r)).catch((x) => alive && setErr(String(x)));
    getEntityChapters(ent.id).then((c) => alive && setAppears(c)).catch((x) => alive && setErr(String(x)));
    getRelationshipTypes(ent.world_id).then((t) => alive && setTypes(t)).catch((x) => alive && setErr(String(x)));
    getEntities(ent.world_id)
      .then((es) => alive && setOthers(es.filter((e) => e.id !== ent.id)))
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [ent.id, ent.world_id]);

  const groups = useMemo(() => {
    const m = new Map<string, StreamRow[]>();
    for (const r of rows ?? []) {
      const arr = m.get(r.relationship_id) ?? [];
      arr.push(r);
      m.set(r.relationship_id, arr);
    }
    return [...m.entries()].map(([relId, history]) => {
      const latest = history[history.length - 1];
      const others = latest.participants.filter((p) => p.entity_id !== ent.id).map((p) => p.title).join(" · ");
      return { relId, history, latest, others };
    });
  }, [rows, ent.id]);

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
    if (!confirm(`Delete "${ent.title}"? It's soft-deleted — recoverable, nothing is truly lost.`)) return;
    try { await softDeleteEntity(ent.id); onChanged?.(); onBack(); } catch (x) { setErr(String(x)); }
  }

  async function changeType(stateId: string, typeId: string) {
    setEditingRel(null);
    try { await updateStateType(stateId, typeId); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  async function removeConnection(relId: string, label: string) {
    if (!confirm(`Remove the "${label}" connection? It's soft-deleted — recoverable, nothing is truly lost.`)) return;
    try { await softDeleteRelationship(relId); loadConnections(); } catch (x) { setErr(String(x)); }
  }

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8 }}>
        <span className="tab" onClick={onBack} style={{ paddingLeft: 0 }}>← Library</span>
        <span className="spacer" />
        {!editing ? (
          <>
            <span className="tab" onClick={() => setEditing(true)}>Edit</span>
            <span className="tab" style={{ color: "var(--hostile)" }} onClick={del}>Delete</span>
          </>
        ) : (
          <>
            <button className="primary" onClick={save} disabled={busy}>{busy ? "…" : "Save"}</button>
            <button onClick={() => {
              setTitle(ent.title); setType(ent.type); setAliases(ent.aliases.join(", ")); setBody(ent.body); setEditing(false);
            }}>Cancel</button>
          </>
        )}
      </div>

      {err && <p className="err">{err}</p>}

      {editing ? (
        <div className="card" style={{ padding: 16, maxWidth: 720, display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name"
              style={{ fontFamily: "var(--serif)", fontSize: 18, flex: 1, minWidth: 200 }} />
            <select className="sel" value={isCanonical(type) ? type : CUSTOM_TYPE} style={{ width: 140 }}
              onChange={(e) => setType(e.target.value === CUSTOM_TYPE ? (isCanonical(type) ? "" : type) : e.target.value)}>
              {CANONICAL_ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={CUSTOM_TYPE}>＋ Custom type…</option>
            </select>
            {!isCanonical(type) && (
              <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Custom type" style={{ width: 130 }} />
            )}
          </div>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Aliases, comma separated (e.g. The Warden, Warden)" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe this entity…"
            style={{ minHeight: 160, fontSize: 15, lineHeight: 1.7, padding: 12 }} />
          <span className="muted">Aliases matter — they're how the mention scan and ⌘K recognize this entity by its nicknames.</span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>{ent.title}</h2>
            <span className="chip">{ent.type}</span>
            {ent.aliases.length > 0 && <span className="note">also "{ent.aliases.join('", "')}"</span>}
          </div>
          {ent.body
            ? <p style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.7, maxWidth: 620, margin: "12px 0 8px" }}>{ent.body}</p>
            : <p className="muted" style={{ margin: "8px 0" }}>No description yet — hit Edit to add one.</p>}
        </>
      )}

      <div className="row" style={{ borderBottom: "none", padding: 0, marginTop: 18, marginBottom: 6, alignItems: "baseline" }}>
        <div className="label" style={{ margin: 0 }}>Connections</div>
        <span className="spacer" />
        {!addingConn && others.length > 0 &&
          <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => setAddingConn(true)}>+ Connection</button>}
      </div>

      {addingConn && (
        <AddConnection
          worldId={ent.world_id}
          selfId={ent.id}
          selfTitle={ent.title}
          others={others}
          types={types}
          onCancel={() => setAddingConn(false)}
          onDone={() => {
            setAddingConn(false);
            getRelationshipTypes(ent.world_id).then(setTypes).catch(() => {});
            loadConnections();
          }}
        />
      )}

      <div className="card" style={{ maxWidth: 720 }}>
        {!rows && <div className="row"><span className="muted">Loading connections…</span></div>}
        {rows && groups.length === 0 && (
          <div className="row"><span className="muted">No connections yet — add one above, or record one from a chapter draft.</span></div>
        )}
        {groups.map(({ relId, history, latest, others: otherNames }) => {
          const isOpen = open === relId;
          const isEditing = editingRel === relId;
          return (
            <div key={relId} style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ borderBottom: "none" }}>
                <span className="muted" style={{ width: 10, cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : relId)}>{isOpen ? "▾" : "▸"}</span>
                <span className="dot" style={{ background: VALENCE_COLOR[latest.valence] }} />
                {isEditing ? (
                  <select className="sel" autoFocus defaultValue={latest.type_id} style={{ padding: "4px 8px", fontSize: 12.5 }}
                    onChange={(e) => changeType(latest.state_id, e.target.value)}
                    onBlur={() => setEditingRel(null)}>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                ) : (
                  <span style={{ color: VALENCE_COLOR[latest.valence], fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                    onClick={() => setOpen(isOpen ? null : relId)}>{latest.type_label}</span>
                )}
                <span className="title-serif" style={{ flex: 1, cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : relId)}>{otherNames}</span>
                <span className="muted">{latest.manuscript_order != null ? `ch. ${latest.manuscript_order}` : "standing"}</span>
                <span className="rowact" title="Change type" onClick={() => setEditingRel(isEditing ? null : relId)}
                  style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12, padding: "0 2px" }}>edit</span>
                <span className="rowact" title="Remove connection" onClick={() => removeConnection(relId, latest.type_label)}
                  style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13, padding: "0 2px" }}>✕</span>
              </div>
              {isOpen && (
                <div style={{ margin: "0 0 10px 42px", borderLeft: "2px solid var(--line)", paddingLeft: 14 }}>
                  {history.map((h) => {
                    const concealed = h.known_by?.concealed_from?.length ?? 0;
                    return (
                      <div key={h.state_id} style={{ marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ color: VALENCE_COLOR[h.valence], fontWeight: 600 }}>{h.type_label}</span>
                        <span className="muted"> · {h.manuscript_order != null ? `ch. ${h.manuscript_order}` : "standing"}</span>
                        {concealed > 0 && <span style={{ color: "var(--hostile)", fontSize: 11 }}> · concealed ×{concealed}</span>}
                        {h.note && <span className="note"> — {h.note}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="label">Appears in</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {appears.length === 0 && <span className="muted">Not yet placed in any chapter.</span>}
        {appears.map((c) => (
          <span className="chip" key={c.chapter_id}>ch. {c.manuscript_order} · {c.role}</span>
        ))}
      </div>
    </div>
  );
}

// Declare a standing connection from this character to another — no chapter.
// Reuses the composer's type pattern: pick an existing relationship type, or
// name a new one and choose its valence family.
function AddConnection({ worldId, selfId, selfTitle, others, types, onDone, onCancel }: {
  worldId: string;
  selfId: string;
  selfTitle: string;
  others: Entity[];
  types: RelationshipType[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [other, setOther] = useState(others[0]?.id ?? "");
  const [tq, setTq] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [valence, setValence] = useState<Valence>("bond");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const q = tq.trim().toLowerCase();
  const matches = types.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 5);
  const exact = types.find((t) => t.label.toLowerCase() === q);
  const chosen = typeId ? types.find((t) => t.id === typeId) ?? null : exact ?? null;
  const canMint = !chosen && q.length > 0;

  async function commit() {
    if (!other) { setErr("Pick who this connects to."); return; }
    setBusy(true);
    setErr(null);
    try {
      let tid = chosen?.id ?? null;
      if (!tid && canMint) {
        const t = await createRelationshipType(worldId, tq.trim(), valence);
        tid = t.id;
      }
      if (!tid) { setErr("Choose or name a relationship type."); setBusy(false); return; }
      await appendPairwiseState({ worldId, entityA: selfId, entityB: other, typeId: tid });
      onDone();
    } catch (x) { setErr(String(x)); setBusy(false); }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, maxWidth: 720, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="title-serif">{selfTitle}</span>
        <div style={{ position: "relative" }}>
          <input
            autoFocus
            value={chosen ? chosen.label : tq}
            onChange={(e) => { setTq(e.target.value); setTypeId(null); }}
            placeholder="is / has…"
            style={{ width: 150, borderColor: chosen ? VALENCE_COLOR[chosen.valence] : undefined }}
          />
          {q.length > 0 && !typeId && (
            <div className="typeahead">
              {matches.map((t) => (
                <div key={t.id} className="ta-row" onClick={() => { setTypeId(t.id); setTq(""); }}>
                  <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />{t.label}
                </div>
              ))}
              {canMint && (
                <div className="ta-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                  <span className="muted">mint "{tq.trim()}" as a new type — pick a family:</span>
                  <span style={{ display: "flex", gap: 6 }}>
                    {VALENCES.map((v) => (
                      <span key={v} title={v} onClick={() => setValence(v)}
                        style={{ width: 16, height: 16, borderRadius: "50%", background: VALENCE_COLOR[v], cursor: "pointer",
                          outline: valence === v ? "2px solid var(--ink)" : "none", outlineOffset: 1 }} />
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <select value={other} onChange={(e) => setOther(e.target.value)} className="sel">
          {others.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <button className="primary" onClick={commit} disabled={busy}>{busy ? "…" : "Add"}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {err && <span className="err">{err}</span>}
      <span className="muted">e.g. "wife" · "father" · "ally" — a standing connection, no chapter needed</span>
    </div>
  );
}
