import { useEffect, useMemo, useState } from "react";
import { getRelationshipTypes, getStream, updateRelationshipType, softDeleteRelationshipType } from "../lib/api";
import type { RelationshipType, StreamRow, Valence } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";

const VALENCES: Valence[] = ["bond", "hostile", "obligation", "neutral"];

// Settings (§9.2): the relationship dictionary. Destructive ops live here only.
export function Settings({ worldId }: { worldId: string }) {
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    try {
      const [t, s] = await Promise.all([getRelationshipTypes(worldId), getStream(worldId)]);
      setTypes(t);
      setStream(s);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    stream.forEach((s) => m.set(s.type_id, (m.get(s.type_id) ?? 0) + 1));
    return m;
  }, [stream]);

  async function patch(id: string, p: Partial<RelationshipType>) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
    try { await updateRelationshipType(id, p); } catch (x) { setErr(String(x)); void reload(); }
  }
  async function remove(id: string) {
    try { await softDeleteRelationshipType(id); setTypes((prev) => prev.filter((t) => t.id !== id)); }
    catch (x) { setErr(String(x)); }
  }

  return (
    <div className="fi">
      <h2 className="scope-title">Settings</h2>
      <p className="scope-sub" style={{ maxWidth: 620 }}>
        The relationship dictionary. Every label is yours — starter types are seed data, not system data.
        Valence drives colour everywhere; ambient types are excluded from dormant-thread detection.
      </p>
      {err && <p className="err">{err}</p>}

      <div className="label" style={{ marginTop: 0 }}>Relationship types · {types.length}</div>
      <div className="card" style={{ maxWidth: 680 }}>
        {types.map((t) => {
          const uses = usage.get(t.id) ?? 0;
          return (
            <div className="row" key={t.id}>
              <input
                defaultValue={t.label}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.label) patch(t.id, { label: v }); }}
                style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 500, border: "none", background: "transparent", width: 160, padding: "2px 0" }}
              />
              <span style={{ display: "flex", gap: 5 }}>
                {VALENCES.map((v) => (
                  <span key={v} title={v} onClick={() => patch(t.id, { valence: v })}
                    style={{ width: 15, height: 15, borderRadius: "50%", background: VALENCE_COLOR[v], cursor: "pointer",
                      opacity: t.valence === v ? 1 : 0.25, outline: t.valence === v ? "2px solid var(--surface)" : "none",
                      boxShadow: t.valence === v ? `0 0 0 1.5px ${VALENCE_COLOR[v]}` : "none" }} />
                ))}
              </span>
              <span className={"chip click" + (t.is_ambient ? " on" : "")} onClick={() => patch(t.id, { is_ambient: !t.is_ambient })}
                title="Ambient types don't count as dormant threads">
                {t.is_ambient ? "ambient" : "· ambient"}
              </span>
              <span className="spacer" />
              <span className="muted">{uses ? `${uses} state${uses > 1 ? "s" : ""}` : "unused"}</span>
              <span
                onClick={() => { if (!uses) remove(t.id); }}
                title={uses ? "In use — merge before deleting (later)" : "Delete"}
                style={{ color: uses ? "var(--faint)" : "var(--hostile)", cursor: uses ? "not-allowed" : "pointer", fontSize: 13 }}
              >✕</span>
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ marginTop: 10, maxWidth: 640 }}>
        Rename inline. Click a dot to change valence — stream, threads, and graph recolour instantly.
        Types in use can't be deleted here yet (that needs merge-with-reassignment). New types are minted where you write.
      </p>
    </div>
  );
}
