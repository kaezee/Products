import { useEffect, useMemo, useState } from "react";
import { getRelationshipTypes, getStream, updateRelationshipType, softDeleteRelationshipType } from "../lib/api";
import type { RelationshipType, StreamRow } from "../lib/types";
import { VALENCE_COLOR, VALENCE_ORDER, VALENCE_LABEL } from "../lib/valence";

// The relationship dictionary — every label the world uses, its valence family,
// and whether it's ambient. Lives under Relationships (it's relationship
// vocabulary, not an app setting). Destructive/vocabulary edits happen here.
export function TypeDictionary({ worldId }: { worldId: string }) {
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
    <div>
      {err && <p className="err">{err}</p>}

      {/* the spectrum legend — allied → hostile, so the colours read as a scale */}
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", margin: "4px 0 14px" }}>
        {VALENCE_ORDER.map((v) => (
          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span className="dot" style={{ background: VALENCE_COLOR[v] }} />
            <span style={{ color: VALENCE_COLOR[v], fontWeight: 600 }}>{VALENCE_LABEL[v]}</span>
          </span>
        ))}
        <span className="faint" style={{ fontSize: 11 }}>the valence spectrum — colour carries meaning everywhere</span>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        {types.length === 0 && <div className="row"><span className="muted">No relationship types yet.</span></div>}
        {types.map((t) => {
          const uses = usage.get(t.id) ?? 0;
          return (
            <div className="row" key={t.id}>
              <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />
              <input
                defaultValue={t.label}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.label) patch(t.id, { label: v }); }}
                style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 500, border: "none", background: "transparent", width: 150, padding: "2px 0" }}
              />
              <span style={{ display: "flex", gap: 5 }}>
                {VALENCE_ORDER.map((v) => (
                  <span key={v} title={VALENCE_LABEL[v]} onClick={() => patch(t.id, { valence: v })}
                    style={{ width: 15, height: 15, borderRadius: "50%", background: VALENCE_COLOR[v], cursor: "pointer",
                      opacity: t.valence === v ? 1 : 0.25, boxShadow: t.valence === v ? `0 0 0 1.5px ${VALENCE_COLOR[v]}` : "none" }} />
                ))}
              </span>
              <span className={"chip click" + (t.is_ambient ? " on" : "")} onClick={() => patch(t.id, { is_ambient: !t.is_ambient })}
                title="Ambient types (kinship, geography) don't count as dormant threads">
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
        Rename inline. Click a dot to move a type along the valence spectrum — stream, threads, and graph recolour instantly.
        Ambient types (kinship, geography) are excluded from dormant-thread detection. New types are minted where you write.
      </p>
    </div>
  );
}
