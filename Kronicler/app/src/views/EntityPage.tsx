import { useEffect, useMemo, useState } from "react";
import { getEntityStream, getEntityChapters, updateEntity, softDeleteEntity } from "../lib/api";
import type { Entity, StreamRow } from "../lib/types";
import type { EntityChapter } from "../lib/api";
import { VALENCE_COLOR } from "../lib/valence";

// Entity Document view (PRD §9.2): the body, with typed connections woven in —
// grouped by relationship, latest state shown, full history expandable. Also
// editable: title, type, aliases, body.
export function EntityPage({ entity, onBack, onChanged, startEditing }: {
  entity: Entity;
  onBack: () => void;
  onChanged?: () => void;
  startEditing?: boolean;
}) {
  const [ent, setEnt] = useState<Entity>(entity);
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [appears, setAppears] = useState<EntityChapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // edit state
  const [editing, setEditing] = useState(!!startEditing);
  const [title, setTitle] = useState(entity.title);
  const [type, setType] = useState(entity.type);
  const [aliases, setAliases] = useState(entity.aliases.join(", "));
  const [body, setBody] = useState(entity.body);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getEntityStream(ent.id).then((r) => alive && setRows(r)).catch((x) => alive && setErr(String(x)));
    getEntityChapters(ent.id).then((c) => alive && setAppears(c)).catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [ent.id]);

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
            <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Type" style={{ width: 140 }} />
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

      <div className="label">Connections</div>
      <div className="card" style={{ maxWidth: 720 }}>
        {!rows && <div className="row"><span className="muted">Loading connections…</span></div>}
        {rows && groups.length === 0 && (
          <div className="row"><span className="muted">No typed relationships yet — record the first from a chapter draft.</span></div>
        )}
        {groups.map(({ relId, history, latest, others }) => {
          const isOpen = open === relId;
          return (
            <div key={relId} style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ cursor: "pointer", borderBottom: "none" }} onClick={() => setOpen(isOpen ? null : relId)}>
                <span className="muted" style={{ width: 10 }}>{isOpen ? "▾" : "▸"}</span>
                <span className="dot" style={{ background: VALENCE_COLOR[latest.valence] }} />
                <span style={{ color: VALENCE_COLOR[latest.valence], fontWeight: 600, fontSize: 12.5 }}>{latest.type_label}</span>
                <span className="title-serif" style={{ flex: 1 }}>{others}</span>
                <span className="muted">ch. {latest.manuscript_order ?? "—"}</span>
              </div>
              {isOpen && (
                <div style={{ margin: "0 0 10px 42px", borderLeft: "2px solid var(--line)", paddingLeft: 14 }}>
                  {history.map((h) => {
                    const concealed = h.known_by?.concealed_from?.length ?? 0;
                    return (
                      <div key={h.state_id} style={{ marginBottom: 6, fontSize: 12.5 }}>
                        <span style={{ color: VALENCE_COLOR[h.valence], fontWeight: 600 }}>{h.type_label}</span>
                        <span className="muted"> · ch. {h.manuscript_order ?? "—"}</span>
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
