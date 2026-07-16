import { useMemo, useState } from "react";
import type { Entity, StreamRow } from "../lib/types";
import type { Nav } from "../App";
import { computeLayout } from "../lib/layout";
import { VALENCE_COLOR } from "../lib/valence";

const W = 720, H = 420;

interface Edge { a: string; b: string; row: StreamRow }

// The relational canvas (§9.3). Ego view default; managed camera auto-frames;
// selection is a floating peek, never a docked panel; controls are the shared
// lenses (in Relationships), never physics sliders.
export function Graph({ entities, latest, ego, setEgo, go }: {
  entities: Entity[];
  latest: StreamRow[];       // one current state per relationship, already filtered
  ego: string | null;
  setEgo: (id: string | null) => void;
  go: (n: Nav) => void;
}) {
  const entById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const [sel, setSel] = useState<string | null>(null);

  const allEdges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    for (const r of latest) {
      const ids = r.participants.map((p) => p.entity_id);
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) out.push({ a: ids[i], b: ids[j], row: r });
    }
    return out;
  }, [latest]);

  const { nodes, edges } = useMemo(() => {
    const e = ego ? allEdges.filter((x) => x.a === ego || x.b === ego) : allEdges;
    const set = new Set<string>();
    e.forEach((x) => { set.add(x.a); set.add(x.b); });
    if (ego) set.add(ego);
    return { nodes: [...set], edges: e };
  }, [allEdges, ego]);

  const pos = useMemo(() => computeLayout(nodes, edges.map((e) => [e.a, e.b] as [string, string])), [nodes, edges]);

  // managed camera: fit the visible nodes to the viewport with margin
  const cam = useMemo(() => {
    const pts = nodes.map((id) => pos.get(id)!).filter(Boolean);
    if (pts.length === 0) return { k: 1, tx: W / 2, ty: H / 2 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 0.4;
    const spanX = (x1 - x0) + pad * 2 || 1, spanY = (y1 - y0) + pad * 2 || 1;
    const k = Math.min(W / spanX, H / spanY, 220);
    return { k, tx: W / 2 - k * (x0 + x1) / 2, ty: H / 2 - k * (y0 + y1) / 2 };
  }, [pos, nodes]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    edges.forEach((e) => { d.set(e.a, (d.get(e.a) ?? 0) + 1); d.set(e.b, (d.get(e.b) ?? 0) + 1); });
    return d;
  }, [edges]);

  const selEntity = sel ? entById.get(sel) : null;
  const selStates = sel ? latest.filter((r) => r.participants.some((p) => p.entity_id === sel)) : [];

  if (latest.length === 0) {
    return <div className="card"><div className="row"><span className="muted">No relationships match these lenses at this point in the story.</span></div></div>;
  }

  return (
    <div className="card" style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: "#fcfbf7" }} onClick={() => setSel(null)}>
        <g style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`, transition: "transform .5s cubic-bezier(.4,0,.2,1)" }}>
          {edges.map((e, i) => {
            const p = pos.get(e.a), q = pos.get(e.b);
            if (!p || !q) return null;
            const concealed = (e.row.known_by?.concealed_from?.length ?? 0) > 0;
            return (
              <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke={VALENCE_COLOR[e.row.valence]}
                strokeWidth={(e.row.valence === "hostile" ? 2.2 : 1.5) / cam.k}
                opacity={e.row.is_ambient ? 0.4 : 0.8}
                strokeDasharray={concealed ? `${4 / cam.k} ${4 / cam.k}` : undefined} />
            );
          })}
          {nodes.map((id) => {
            const p = pos.get(id); if (!p) return null;
            const ent = entById.get(id);
            const deg = degree.get(id) ?? 0;
            const r = (8 + Math.min(deg * 2.2, 12)) / cam.k;
            const isSel = sel === id;
            return (
              <g key={id} style={{ cursor: "pointer" }}
                onClick={(ev) => { ev.stopPropagation(); setSel(id); }}
                onDoubleClick={(ev) => { ev.stopPropagation(); setEgo(ego === id ? null : id); setSel(null); }}>
                <circle cx={p.x} cy={p.y} r={r} fill={isSel ? "var(--bondBg)" : "#edeae0"}
                  stroke={isSel ? "var(--bond)" : "var(--lineStrong)"} strokeWidth={(isSel ? 2.5 : 1.4) / cam.k} />
                <text x={p.x} y={p.y + r + 13 / cam.k} fontSize={11 / cam.k} textAnchor="middle"
                  fill={isSel ? "var(--bond)" : "var(--sub)"} fontWeight={isSel || deg >= 3 ? 600 : 450} fontFamily="var(--sans)">
                  {ent?.title.startsWith("The ") ? ent.title.split(" ").slice(0, 2).join(" ") : ent?.title.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div style={{ position: "absolute", top: 10, left: 12, fontSize: 10.5, color: "var(--muted)", background: "rgba(252,251,247,.92)", padding: "4px 9px", borderRadius: 6, border: "1px solid var(--line)" }}>
        click to peek · double-click for ego view · the camera frames every change
      </div>
      {ego && (
        <div style={{ position: "absolute", top: 10, right: 12 }}>
          <span className="chip on click" onClick={() => setEgo(null)}>ego · {entById.get(ego)?.title.split(" ")[0]} ✕</span>
        </div>
      )}

      {selEntity && (
        <div className="pop" style={{ position: "absolute", bottom: 14, right: 14, width: 240, background: "var(--surface)", border: "1px solid var(--lineStrong)", borderRadius: 13, padding: "13px 15px", boxShadow: "var(--pop)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span className="title-serif" style={{ fontSize: 15.5, flex: 1 }}>{selEntity.title}</span>
            <span onClick={() => setSel(null)} style={{ color: "var(--muted)", cursor: "pointer" }}>✕</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)", display: "flex", flexDirection: "column", gap: 5, marginBottom: 11 }}>
            {selStates.slice(0, 4).map((s) => {
              const other = s.participants.find((p) => p.entity_id !== sel);
              return (
                <div key={s.state_id}>
                  <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 650 }}>{s.type_label}</span>
                  {" · "}{other?.title.split(" ")[0]} <span className="faint">ch. {s.manuscript_order ?? "—"}</span>
                </div>
              );
            })}
            {selStates.length === 0 && <div style={{ color: "var(--obligation)" }}>no relationships at this point</div>}
          </div>
          <button onClick={() => go({ scope: "library", entityId: selEntity.id })} style={{ width: "100%", fontSize: 12 }}>Open page</button>
        </div>
      )}
    </div>
  );
}
