import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes } from "../lib/api";
import type { StreamRow, Entity, RelationshipType } from "../lib/types";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";

const DORMANT_GAP = 5;

// Overview (§9.2): read-only orientation. Owns nothing, links everywhere.
export function Overview({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [stream, setStream] = useState<StreamRow[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId)])
      .then(([s, e, t]) => { if (!alive) return; setStream(s); setEntities(e); setTypes(t); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const recent = useMemo(
    () => [...(stream ?? [])].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 6),
    [stream],
  );

  const orphans = useMemo(() => {
    if (!stream) return [];
    const seen = new Set<string>();
    stream.forEach((s) => s.participants.forEach((p) => seen.add(p.entity_id)));
    return entities.filter((e) => !seen.has(e.id));
  }, [stream, entities]);

  const dormant = useMemo(() => {
    if (!stream) return [];
    const now = stream.reduce((m, s) => Math.max(m, s.manuscript_order ?? 0), 0);
    const latest = new Map<string, StreamRow>();
    for (const s of stream) {
      const cur = latest.get(s.relationship_id);
      if (!cur || (s.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) latest.set(s.relationship_id, s);
    }
    return [...latest.values()].filter((s) => {
      const t = typesById.get(s.type_id);
      if (t?.is_ambient || t?.is_terminal) return false;
      return s.manuscript_order != null && now - s.manuscript_order >= DORMANT_GAP;
    });
  }, [stream, typesById]);

  if (err) return <p className="err">{err}</p>;
  if (!stream) return <p className="muted">Loading…</p>;

  const who = (s: StreamRow) => s.participants.map((p) => p.title).join(" · ");

  return (
    <div className="fi">
      <h2 className="scope-title">Overview</h2>
      <p className="scope-sub">What changed and what needs attention. Everything here lives somewhere else.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }}>
        <div>
          <div className="label" style={{ marginTop: 0 }}>Recent state changes</div>
          <div className="card">
            {recent.length === 0 && <div className="row"><span className="muted">No states recorded yet.</span></div>}
            {recent.map((s) => (
              <div className="row click" key={s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
                <span style={{ fontWeight: 500 }}>
                  {who(s)} <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 600 }}>{s.type_label}</span>
                </span>
                <span className="spacer" />
                <span className="muted">{s.manuscript_order != null ? `ch. ${s.manuscript_order}` : "—"}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="label" style={{ marginTop: 0 }}>Needs attention</div>
          <div className="card">
            {dormant.length === 0 && orphans.length === 0 && (
              <div className="row"><span className="muted">Nothing flagged — every thread is live and every entity connected.</span></div>
            )}
            {dormant.map((s) => (
              <div className="row click" key={"d" + s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span className="chip warn">dormant</span>
                <span style={{ fontSize: 12.5 }}>{who(s)} · {s.type_label}</span>
              </div>
            ))}
            {orphans.map((e) => (
              <div className="row click" key={e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
                <span className="chip warn">orphaned</span>
                <span style={{ fontSize: 12.5 }}>{e.title}</span>
                <span className="spacer" />
                <span className="muted">no relationships yet</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
