import { useEffect, useMemo, useState } from "react";
import { getEntityStream, getEntityChapters } from "../lib/api";
import type { Entity, StreamRow } from "../lib/types";
import type { EntityChapter } from "../lib/api";
import { VALENCE_COLOR } from "../lib/valence";

// Entity Document view (PRD §9.2): the body, with typed connections woven in —
// grouped by relationship, latest state shown, full history expandable, each
// carrying its chapter + concealment context. Plus where the entity appears.
export function EntityPage({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [appears, setAppears] = useState<EntityChapter[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEntityStream(entity.id).then((r) => alive && setRows(r)).catch((x) => alive && setErr(String(x)));
    getEntityChapters(entity.id).then((c) => alive && setAppears(c)).catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [entity.id]);

  // group stream rows by relationship, keep history ordered
  const groups = useMemo(() => {
    const m = new Map<string, StreamRow[]>();
    for (const r of rows ?? []) {
      const arr = m.get(r.relationship_id) ?? [];
      arr.push(r);
      m.set(r.relationship_id, arr);
    }
    return [...m.entries()].map(([relId, history]) => {
      const latest = history[history.length - 1];
      const others = latest.participants.filter((p) => p.entity_id !== entity.id).map((p) => p.title).join(" · ");
      return { relId, history, latest, others };
    });
  }, [rows, entity.id]);

  return (
    <div>
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8 }}>
        <span className="tab" onClick={onBack} style={{ paddingLeft: 0 }}>← Library</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>{entity.title}</h2>
        <span className="chip">{entity.type}</span>
        {entity.aliases.length > 0 && <span className="note">also "{entity.aliases.join('", "')}"</span>}
      </div>

      {entity.body && (
        <p style={{ fontFamily: "var(--serif)", fontSize: 16, lineHeight: 1.7, maxWidth: 620, margin: "12px 0 8px" }}>
          {entity.body}
        </p>
      )}

      {err && <p className="err">{err}</p>}

      <div className="label">Connections</div>
      <div className="card" style={{ maxWidth: 720 }}>
        {!rows && <div className="row"><span className="muted">Loading connections…</span></div>}
        {rows && groups.length === 0 && (
          <div className="row"><span className="muted">No typed relationships yet — record the first from any chapter draft.</span></div>
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
