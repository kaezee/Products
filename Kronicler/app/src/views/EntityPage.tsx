import { useEffect, useMemo, useRef, useState } from "react";
import {
  getEntityStream, getEntityChapters, getEntities, getRelationshipTypes,
  createRelationshipType, appendPairwiseState, appendGroupState, updateEntity, softDeleteEntity,
  updateStateType, softDeleteRelationship, swapParticipant,
  relationshipIdForState, setConnectionRoles,
} from "../lib/api";
import type { Entity, StreamRow, RelationshipType, Valence } from "../lib/types";
import type { EntityChapter } from "../lib/api";
import { VALENCE_COLOR } from "../lib/valence";
import { CANONICAL_ENTITY_TYPES, CUSTOM_TYPE } from "../lib/entityTypes";
import { sideLabel, suggestInverse } from "../lib/direction";
import { isBelief } from "../lib/knowledge";
import { ArcSparkline } from "./ArcSparkline";

// The direction picker shared by the add-form and the edit-panel: "both ways"
// (symmetric) vs "directional", with an optional other-side word.
function DirectionPicker({ forward, mode, inverse, onMode, onInverse, onInverseCommit }: {
  forward: string;
  mode: "mutual" | "directed";
  inverse: string;
  onMode: (m: "mutual" | "directed") => void;
  onInverse: (s: string) => void;
  onInverseCommit?: (s: string) => void;
}) {
  const suggestion = suggestInverse(forward);
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
      <span className="seg" style={{ fontSize: 11 }}>
        <span className={mode === "mutual" ? "on" : ""} onClick={() => onMode("mutual")}>↔ both ways</span>
        <span className={mode === "directed" ? "on" : ""} onClick={() => onMode("directed")}>→ directional</span>
      </span>
      {mode === "directed" && (
        <>
          <span className="muted">other side reads:</span>
          <input value={inverse} onChange={(e) => onInverse(e.target.value)}
            onBlur={(e) => onInverseCommit?.(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onInverseCommit?.((e.target as HTMLInputElement).value); }}
            placeholder={suggestion ? suggestion : "blank = one-way"} style={{ width: 130 }} />
          {!inverse.trim() && <span className="faint" style={{ fontSize: 11 }}>one-way — not shown in reverse</span>}
        </>
      )}
    </div>
  );
}

// The edit panel for an existing connection: change its type, swap who it joins,
// and set how each side reads (direction).
function EditConnection({ latest, selfId, otherId, others, types, onChangeType, onSwap, onApplyDirection, onDone }: {
  latest: StreamRow;
  selfId: string;
  otherId: string | null;
  others: Entity[];
  types: RelationshipType[];
  onChangeType: (stateId: string, typeId: string) => void;
  onSwap: (relId: string, oldId: string | null, newId: string) => void;
  onApplyDirection: (relId: string, roles: { entityId: string; role: string | null }[]) => void;
  onDone: () => void;
}) {
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
      if (isBelief(r)) continue; // connections are the truth; beliefs live in the lens
      const arr = m.get(r.relationship_id) ?? [];
      arr.push(r);
      m.set(r.relationship_id, arr);
    }
    return [...m.entries()].map(([relId, history]) => {
      const latest = history[history.length - 1];
      const otherParts = latest.participants.filter((p) => p.entity_id !== ent.id);
      const others = otherParts.map((p) => p.title).join(" · ");
      const otherId = otherParts[0]?.entity_id ?? null;
      return { relId, history, latest, others, otherId };
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
          onClose={() => setAddingConn(false)}
          onAdded={() => {
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
        {groups.map(({ relId, history, latest, others: otherNames, otherId }) => {
          const isOpen = open === relId;
          const isEditing = editingRel === relId;
          const side = sideLabel(latest, ent.id);
          const toggle = () => setOpen(isOpen ? null : relId);
          return (
            <div key={relId} style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ borderBottom: "none" }} title="Double-click to edit"
                onDoubleClick={() => setEditingRel(relId)}>
                <span className="muted" style={{ width: 10, cursor: "pointer" }} onClick={toggle}>{isOpen ? "▾" : "▸"}</span>
                <span className="dot" style={{ background: VALENCE_COLOR[latest.valence] }} />
                {side.incoming ? (
                  // self is the object of a one-way link: read it passively (the other is the subject)
                  <span className="title-serif" style={{ flex: 1, cursor: "pointer" }} onClick={toggle}>
                    {otherNames} <span className="muted" style={{ fontStyle: "italic" }}>{side.label} ↩</span>
                  </span>
                ) : (
                  <>
                    <span style={{ color: VALENCE_COLOR[latest.valence], fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
                      onClick={toggle}>{side.label}</span>
                    <span className="title-serif" style={{ flex: 1, cursor: "pointer" }} onClick={toggle}>{otherNames}</span>
                  </>
                )}
                {history.length > 1 && <ArcSparkline history={history} />}
                <span className="muted">{latest.manuscript_order != null ? `ch. ${latest.manuscript_order}` : "standing"}</span>
                <span className="rowact" title="Edit this connection" onClick={() => setEditingRel(isEditing ? null : relId)}
                  style={{ cursor: "pointer", color: isEditing ? "var(--bond)" : "var(--muted)", fontSize: 12, padding: "0 2px" }}>edit</span>
                <span className="rowact" title="Remove connection" onClick={() => removeConnection(relId, latest.type_label)}
                  style={{ cursor: "pointer", color: "var(--faint)", fontSize: 13, padding: "0 2px" }}>✕</span>
              </div>

              {isEditing && (
                <EditConnection latest={latest} selfId={ent.id} otherId={otherId} others={others} types={types}
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
function AddConnection({ worldId, selfId, selfTitle, others, types, onAdded, onClose }: {
  worldId: string;
  selfId: string;
  selfTitle: string;
  others: Entity[];
  types: RelationshipType[];
  onAdded: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(others[0] ? [others[0].id] : []);
  const [tq, setTq] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [valence, setValence] = useState<Valence>("bond");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [mode, setMode] = useState<"mutual" | "directed">("mutual");
  const [inverse, setInverse] = useState("");
  const [dirTouched, setDirTouched] = useState(false);
  const typeRef = useRef<HTMLInputElement>(null);

  const isGroup = picked.length >= 2; // 3+ participants incl. self → one group relationship
  const remaining = others.filter((e) => !picked.includes(e.id));

  const q = tq.trim().toLowerCase();
  const matches = types.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 5);
  const exact = types.find((t) => t.label.toLowerCase() === q);
  const chosen = typeId ? types.find((t) => t.id === typeId) ?? null : exact ?? null;
  const canMint = !chosen && q.length > 0;
  const forward = chosen?.label ?? tq.trim();

  // Auto-detect direction from the word — "wife"→two-way, "is a"→one-way — until
  // the writer overrides it. Keeps simple relations one-click while offering
  // sensible directional defaults.
  useEffect(() => {
    if (dirTouched) return;
    const sug = suggestInverse(forward);
    if (sug === null) { setMode("mutual"); setInverse(""); }
    else { setMode("directed"); setInverse(sug); }
  }, [forward, dirTouched]);

  // Rapid entry: add and keep the form open, so several connections in a row
  // take one click each, not a full re-open.
  async function commit() {
    if (picked.length === 0) { setErr("Pick at least one person to connect."); return; }
    setBusy(true);
    setErr(null);
    try {
      let tid = chosen?.id ?? null;
      if (!tid && canMint) {
        const t = await createRelationshipType(worldId, tq.trim(), valence);
        tid = t.id;
      }
      if (!tid) { setErr("Choose or name a relationship type."); setBusy(false); return; }
      if (isGroup) {
        // one relationship spanning everyone — a party, a faction, a pact
        await appendGroupState({ worldId, entityIds: [selfId, ...picked], typeId: tid });
      } else {
        const stateId = await appendPairwiseState({ worldId, entityA: selfId, entityB: picked[0], typeId: tid });
        if (mode === "directed") {
          const relId = await relationshipIdForState(stateId);
          await setConnectionRoles(relId, [
            { entityId: selfId, role: forward },
            { entityId: picked[0], role: inverse.trim() || null },
          ]);
        }
      }
      onAdded();
      setAdded((n) => n + 1);
      setTq(""); setTypeId(null); setDirTouched(false);
      setPicked(remaining[0] ? [remaining[0].id] : []);
      setBusy(false);
      typeRef.current?.focus();
    } catch (x) { setErr(String(x)); setBusy(false); }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, maxWidth: 720, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="title-serif">{selfTitle}</span>
        <div style={{ position: "relative" }}>
          <input
            ref={typeRef}
            autoFocus
            value={chosen ? chosen.label : tq}
            onChange={(e) => { setTq(e.target.value); setTypeId(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (chosen || canMint)) commit(); if (e.key === "Escape") onClose(); }}
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
        {picked.map((id) => {
          const e = others.find((o) => o.id === id);
          return (
            <span key={id} className="chip on" style={{ cursor: "pointer" }} onClick={() => setPicked((p) => p.filter((x) => x !== id))}>
              {e?.title ?? "?"} ✕
            </span>
          );
        })}
        {remaining.length > 0 && (
          <select value="" className="sel" style={{ width: 130 }}
            onChange={(e) => { if (e.target.value) setPicked((p) => [...p, e.target.value]); }}>
            <option value="">{picked.length ? "+ add person…" : "pick a person…"}</option>
            {remaining.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        )}
        <button className="primary" onClick={commit} disabled={busy}>{busy ? "…" : "Add"}</button>
        <button onClick={onClose}>Done{added > 0 ? ` (${added})` : ""}</button>
      </div>
      {!isGroup && forward.length > 0 && (
        <DirectionPicker forward={forward} mode={mode} inverse={inverse}
          onMode={(m) => { setDirTouched(true); setMode(m); }}
          onInverse={(s) => { setDirTouched(true); setInverse(s); }} />
      )}
      {isGroup && <span className="faint" style={{ fontSize: 11 }}>👥 group — one shared relationship among {selfTitle} + {picked.length} others, reads the same for everyone</span>}
      {err && <span className="err">{err}</span>}
      <span className="muted">
        {added > 0 ? `✓ ${added} added — keep going, or Done.  ` : ""}
        one person = a bond (e.g. "wife" · "ally"); add more for a group (a party, a faction) — Enter to add
      </span>
    </div>
  );
}
