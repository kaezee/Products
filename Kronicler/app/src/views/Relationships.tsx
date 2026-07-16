import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes } from "../lib/api";
import type { StreamRow, Entity, RelationshipType } from "../lib/types";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";
import { Graph } from "./Graph";
import { TypeDictionary } from "./TypeDictionary";

// Relationships (§9.2): two lenses — Stream + Graph — over one persistent filter
// set (type, knowledge viewer, as-of scrub). Filters survive lens switches.
export function Relationships({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [lens, setLens] = useState<"stream" | "graph" | "types">("stream");
  const [typeId, setTypeId] = useState("all");
  const [viewer, setViewer] = useState("all"); // knowledge lens: 'all' (writer) or an entity id
  const [asOf, setAsOf] = useState<number | null>(null);
  const [ego, setEgo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId)])
      .then(([s, e, t]) => { if (!alive) return; setRows(s); setEntities(e); setTypes(t); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const maxCh = useMemo(() => (rows ?? []).reduce((m, r) => Math.max(m, r.manuscript_order ?? 0), 0), [rows]);
  const asOfVal = asOf ?? maxCh;
  const characters = useMemo(() => entities.filter((e) => e.type === "Character"), [entities]);

  // shared filter: as-of scrub, knowledge lens, type
  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (r.manuscript_order != null && r.manuscript_order > asOfVal) return false;
      if (typeId !== "all" && r.type_id !== typeId) return false;
      if (viewer !== "all" && (r.known_by?.concealed_from ?? []).includes(viewer)) return false;
      return true;
    });
  }, [rows, asOfVal, typeId, viewer]);

  // Graph wants one current state per relationship (as of the scrub)
  const latest = useMemo(() => {
    const m = new Map<string, StreamRow>();
    for (const r of filtered) {
      const cur = m.get(r.relationship_id);
      if (!cur || (r.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) m.set(r.relationship_id, r);
    }
    return [...m.values()];
  }, [filtered]);

  const streamRows = useMemo(
    () => [...filtered].sort((a, b) => (a.manuscript_order ?? 1e9) - (b.manuscript_order ?? 1e9)),
    [filtered],
  );

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Loading…</p>;

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 12 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Relationships</h2>
        <div className="seg">
          <span className={lens === "stream" ? "on" : ""} onClick={() => setLens("stream")}>Stream</span>
          <span className={lens === "graph" ? "on" : ""} onClick={() => setLens("graph")}>Graph</span>
        </div>
        {lens !== "types" && <span className="faint" style={{ fontSize: 11 }}>filters persist across lenses</span>}
        <span className="spacer" />
        <button className={lens === "types" ? "primary" : ""}
          onClick={() => setLens(lens === "types" ? "stream" : "types")}>
          {lens === "types" ? "← Back to lenses" : "Manage types"}
        </button>
      </div>

      {lens === "types" ? (
        <TypeDictionary worldId={worldId} />
      ) : (
      <>
      {/* shared filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)}
          className={"chip click" + (typeId !== "all" ? " on" : "")} style={{ padding: "5px 10px" }}>
          <option value="all">Type: all</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={viewer} onChange={(e) => setViewer(e.target.value)}
          className={"chip click" + (viewer !== "all" ? " on" : "")} style={{ padding: "5px 10px" }}>
          <option value="all">Knowledge: writer view (everything)</option>
          {characters.map((e) => <option key={e.id} value={e.id}>As {e.title.split(" ")[0]} believes</option>)}
        </select>
        {viewer !== "all" && <span style={{ fontSize: 11.5, color: "var(--hostile)" }}>concealed states vanish — the world as they believe it</span>}
        {ego && <span className="chip on click" onClick={() => setEgo(null)}>ego · {entities.find((e) => e.id === ego)?.title.split(" ")[0]} ✕</span>}
      </div>

      {lens === "stream" ? (
        streamRows.length === 0 ? (
          <div className="card"><div className="row"><span className="muted">Nothing matches these lenses at this point in the story.</span></div></div>
        ) : (
          <div className="card">
            {streamRows.map((s) => {
              const concealed = s.known_by?.concealed_from?.length ?? 0;
              return (
                <div className="row" key={s.state_id}>
                  <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
                  <span className="title-serif">{s.participants.map((p) => p.title).join(" · ")}</span>
                  <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 650, fontSize: 12.5 }}>{s.type_label}</span>
                  <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</span>
                  {concealed > 0 && <span style={{ color: "var(--hostile)", fontSize: 11 }}>concealed ×{concealed}</span>}
                  <span className="muted" style={{ whiteSpace: "nowrap" }}>{s.manuscript_order != null ? `ch. ${s.manuscript_order}` : "unplaced"}</span>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <Graph entities={entities} latest={latest} ego={ego} setEgo={setEgo} go={go} />
      )}

      {/* as-of scrub */}
      {maxCh > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, fontSize: 12, color: "var(--sub)" }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>As of</span>
          <input type="range" min={1} max={maxCh} value={asOfVal} onChange={(e) => setAsOf(+e.target.value)} style={{ flex: 1, accentColor: "var(--bond)" }} />
          <span style={{ fontWeight: 650, color: "var(--ink)", whiteSpace: "nowrap" }}>ch. {asOfVal}</span>
          <span className="faint" style={{ whiteSpace: "nowrap" }}>scrub the world back to any chapter</span>
        </div>
      )}
      </>
      )}
    </div>
  );
}
