import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes, softDeleteEntity } from "../lib/api";
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
  const [allOrphans, setAllOrphans] = useState(false);

  const ORPHAN_CAP = 8;

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

  // Continuity check: an entity in a TERMINAL state (dead/destroyed/gone) that
  // still takes part in a later state is a likely contradiction — the exact
  // slip a novelist needs caught. Computed from the stream + which types are
  // flagged terminal.
  const contradictions = useMemo(() => {
    if (!stream) return [];
    const terminalTypes = new Set(types.filter((t) => t.is_terminal).map((t) => t.id));
    if (terminalTypes.size === 0) return [];
    const terminalAt = new Map<string, number>(); // entity → earliest terminal chapter
    for (const s of stream) {
      if (s.is_correction || s.manuscript_order == null || !terminalTypes.has(s.type_id)) continue;
      for (const p of s.participants) {
        const cur = terminalAt.get(p.entity_id);
        if (cur == null || s.manuscript_order < cur) terminalAt.set(p.entity_id, s.manuscript_order);
      }
    }
    const out: { id: string; name: string; termCh: number; laterCh: number; laterLabel: string }[] = [];
    for (const [id, termCh] of terminalAt) {
      let later: { ch: number; label: string } | null = null;
      for (const s of stream) {
        if (s.is_correction || s.manuscript_order == null || s.manuscript_order <= termCh) continue;
        if (terminalTypes.has(s.type_id)) continue;
        if (s.participants.some((p) => p.entity_id === id) && (!later || s.manuscript_order > later.ch)) {
          later = { ch: s.manuscript_order, label: s.type_label };
        }
      }
      if (later) {
        const ent = entities.find((e) => e.id === id);
        out.push({ id, name: ent?.title ?? "someone", termCh, laterCh: later.ch, laterLabel: later.label });
      }
    }
    return out;
  }, [stream, types, entities]);

  async function delOrphan(e: Entity, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!confirm(`Delete "${e.title}"? It's soft-deleted — recoverable, nothing is truly lost.`)) return;
    try {
      await softDeleteEntity(e.id);
      setEntities((prev) => prev.filter((x) => x.id !== e.id));
    } catch (x) { setErr(String(x)); }
  }

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
            {dormant.length === 0 && orphans.length === 0 && contradictions.length === 0 && (
              <div className="row"><span className="muted">Nothing flagged — every thread is live and every entity connected.</span></div>
            )}
            {contradictions.map((c) => (
              <div className="row click" key={"c" + c.id} onClick={() => go({ scope: "library", entityId: c.id })}>
                <span className="chip" style={{ borderColor: "var(--hostile)", background: "var(--hostileBg)", color: "var(--hostile)" }}>contradiction</span>
                <span style={{ fontSize: 12.5 }}>
                  <b>{c.name}</b> — terminal in ch. {c.termCh}, but “{c.laterLabel}” in ch. {c.laterCh}
                </span>
              </div>
            ))}
            {dormant.map((s) => (
              <div className="row click" key={"d" + s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span className="chip warn">dormant</span>
                <span style={{ fontSize: 12.5 }}>{who(s)} · {s.type_label}</span>
              </div>
            ))}
            {(allOrphans ? orphans : orphans.slice(0, ORPHAN_CAP)).map((e) => (
              <div className="row click" key={e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
                <span className="chip warn">orphaned</span>
                <span style={{ fontSize: 12.5 }}>{e.title}</span>
                <span className="spacer" />
                <span className="muted">no relationships yet</span>
                <span title={`Delete ${e.title}`} onClick={(ev) => delOrphan(e, ev)}
                  style={{ color: "var(--faint)", cursor: "pointer", padding: "0 4px", fontSize: 13 }}>✕</span>
              </div>
            ))}
            {orphans.length > ORPHAN_CAP && (
              <div className="row click" onClick={() => setAllOrphans((v) => !v)}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {allOrphans ? "Show fewer" : `+${orphans.length - ORPHAN_CAP} more unconnected — show all`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
