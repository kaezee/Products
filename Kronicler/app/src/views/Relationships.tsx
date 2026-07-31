import { useEffect, useMemo, useRef, useState } from "react";
import { getStream, getEntities, getRelationshipTypes, getEntityTypes } from "../lib/api";
import type { StreamRow, Entity, RelationshipType, EntityType, Valence } from "../lib/types";
import type { Nav } from "../App";
import { visibleUnderLens, latestTruthByRel, latestByRel, isBelief } from "../lib/knowledge";
import { buildTypeSwatches } from "../lib/entityTypes";
import { buildArcs, type RelArc } from "../lib/relArc";
import { Graph } from "./Graph";
import { TypeDictionary } from "./TypeDictionary";
import { RelRow } from "../components/RelRow";
import { EntityPanel } from "../components/EntityPanel";
import { RelChipBar, type OrderBy } from "../components/RelChipBar";
import { Icon } from "../components/icons";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";

// entity adjacency + BFS reach, for "how far out"
function adjacency(latest: StreamRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b); };
  for (const r of latest) {
    const ids = r.participants.map((p) => p.entity_id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { link(ids[i], ids[j]); link(ids[j], ids[i]); }
  }
  return m;
}
function bfsReach(latest: StreamRow[], centre: string, depth: number): Set<string> {
  const adj = adjacency(latest);
  const seen = new Set<string>([centre]);
  let frontier = [centre];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const u of frontier) for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); next.push(v); }
    frontier = next;
  }
  return seen;
}

const TONE_GROUP: Valence[] = ["hostile", "obligation", "neutral", "bond"];

// Relationships (§9 + RELATIONSHIPSBUILD.md). The control set lives in a chip
// bar over the canvas, not a right panel; the right side is reserved for the
// selection panel. The engine (stream view, knowledge/direction libs) is
// unchanged — this is the presentation layer over it.
export function Relationships({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [lens, setLens] = useState<"graph" | "list">("graph");
  const [typesOpen, setTypesOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);       // the selected entity (panel)

  const [centre, setCentre] = useState<string | null>(null);
  const [depth, setDepth] = useState<1 | 2 | 3>(2);
  const [tones, setTones] = useState<Set<Valence>>(new Set());
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState("all");                   // point of view: "all" | entity id
  const [order, setOrder] = useState<OrderBy>("recent");
  const [recentPov, setRecentPov] = useState<string[]>([]);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [scrubView, setScrubView] = useState<number | null>(null); // instant label during drag

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId), getEntityTypes(worldId)])
      .then(([s, e, t, et]) => { if (!alive) return; setRows(s); setEntities(e); setTypes(t); setEntityTypes(et); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  useEffect(() => {
    if (!typesOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setTypesOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [typesOpen]);

  const maxCh = useMemo(() => (rows ?? []).reduce((m, r) => Math.max(m, r.manuscript_order ?? 0), 0), [rows]);
  const asOfVal = asOf ?? maxCh;
  const entById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const typeSwatch = useMemo(
    () => buildTypeSwatches(entityTypes.map((t) => ({ name: t.name, swatch: t.swatch })), entities.map((e) => e.type)),
    [entityTypes, entities],
  );
  const hasSecrets = useMemo(
    () => (rows ?? []).some((r) => (r.manuscript_order == null || r.manuscript_order <= asOfVal) && ((r.known_by?.concealed_from?.length ?? 0) > 0 || isBelief(r))),
    [rows, asOfVal],
  );

  // ── derivation ──────────────────────────────────────────────────────────
  const byAsOf = useMemo(() => (rows ?? []).filter((r) => r.manuscript_order == null || r.manuscript_order <= asOfVal), [rows, asOfVal]);
  const filterKT = (sub: StreamRow[]) => sub.filter((r) => (!kinds.size || kinds.has(r.type_id)) && (!tones.size || tones.has(r.valence)));
  const latestPerRel = (sub: StreamRow[], pov: string): StreamRow[] =>
    pov === "all" ? [...latestTruthByRel(sub).values()] : latestByRel(visibleUnderLens(sub, pov));

  const edgesNoCentre = useMemo(() => latestPerRel(filterKT(byAsOf), viewer), [byAsOf, kinds, tones, viewer]);
  const reachAt = useMemo(() => {
    const f: number[] = [1];
    if (centre) for (let d = 1; d <= 3; d++) f[d] = bfsReach(edgesNoCentre, centre, d).size;
    return f;
  }, [edgesNoCentre, centre]);
  const liveMax = useMemo(() => { let m = 1; for (let d = 2; d <= 3; d++) if (reachAt[d] > reachAt[d - 1]) m = d; return m; }, [reachAt]);
  const effDepth = Math.min(depth, liveMax) as 1 | 2 | 3;
  const reach = useMemo(() => (centre ? bfsReach(edgesNoCentre, centre, effDepth) : null), [edgesNoCentre, centre, effDepth]);
  const inReach = (r: { participants: { entity_id: string }[] }) => !reach || r.participants.every((p) => reach.has(p.entity_id));
  const visLatest = useMemo(() => edgesNoCentre.filter(inReach), [edgesNoCentre, reach]);

  // arcs for the List (kinds via buildArcs, then tone + reach)
  const arcs = useMemo(() => buildArcs(rows ?? [], viewer, asOfVal, kinds), [rows, viewer, asOfVal, kinds]);
  const visArcs = useMemo(
    () => arcs.filter((a) => a.current != null && (!tones.size || tones.has(a.current.valence)) && inReach(a)),
    [arcs, tones, reach],
  );
  // selection panel shows ALL of an entity's connections (ignoring the chips)
  const allArcs = useMemo(() => buildArcs(rows ?? [], viewer, asOfVal, new Set<string>()), [rows, viewer, asOfVal]);
  const selArcs = useMemo(() => (selId ? allArcs.filter((a) => a.current != null && a.participants.some((p) => p.entity_id === selId)) : []), [allArcs, selId]);

  // ── chip data (counts on the truth set, ignoring the chips' own filters) ──
  const baseRels = useMemo(() => [...latestTruthByRel(byAsOf).values()], [byAsOf]);
  const kindSeen = useMemo(() => { const m = new Map<string, number>(); for (const r of baseRels) m.set(r.type_id, (m.get(r.type_id) ?? 0) + 1); return m; }, [baseRels]);
  const toneCount = useMemo(() => { const m = new Map<Valence, number>(); for (const r of baseRels) m.set(r.valence, (m.get(r.valence) ?? 0) + 1); return m; }, [baseRels]);
  const deg = useMemo(() => { const m = new Map<string, number>(); for (const e of edgesNoCentre) for (const p of e.participants) m.set(p.entity_id, (m.get(p.entity_id) ?? 0) + 1); return m; }, [edgesNoCentre]);
  const povPeople = useMemo(
    () => entities.filter((e) => e.type === "Character").map((e) => ({ id: e.id, name: e.title.split(" ")[0], deg: deg.get(e.id) ?? 0 })),
    [entities, deg],
  );
  const kindDict = useMemo(() => types.map((t) => ({ id: t.id, label: t.label, valence: t.valence })), [types]);
  const centreName = centre ? entById.get(centre)?.title.split(" ")[0] ?? null : null;

  // centring on someone = selecting them (§3.1 — same gesture)
  const centreOn = (id: string) => { setCentre(id); setDepth(1); setSelId(id); };

  // rAF-throttled scrub (§8.2): label updates now, the heavy redraw once a frame
  const raf = useRef<number | null>(null);
  const target = useRef(asOfVal);
  function onScrub(v: number) {
    target.current = v; setScrubView(v);
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = null; setAsOf(target.current); setScrubView(null); });
  }
  const shownCh = scrubView ?? asOfVal;

  const chipData = {
    variant: lens, hasSecrets,
    centre, centreName, depth, reachAt, effDepth,
    onClearCentre: () => setCentre(null), setDepth,
    tones, toneCount, setTones,
    kinds, kindDict, kindSeen, total: baseRels.length, setKinds,
    pov: viewer, povPeople, recentPov,
    setPov: (id: string) => { setViewer(id); if (id !== "all") setRecentPov((r) => [id, ...r.filter((x) => x !== id)].slice(0, 3)); },
    order, setOrder,
  };

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <SkeletonRows rows={6} />;
  if (rows.length === 0) {
    return (
      <div className="fi">
        <h2 className="scope-title" style={{ marginBottom: 12 }}>Relationships</h2>
        <EmptyState icon="relationships" title="No relationships yet"
          desc="Relationships grow out of your prose. Open a chapter, select a line where two characters connect, and record what passes between them — it appears here as a living web you can filter and rewind."
          steps={["Add your cast", "Mark a moment in a chapter", "See the web"]}
          action={{ label: "Open the Manuscript", onClick: () => go({ scope: "manuscript" }) }} />
      </div>
    );
  }

  // group + sort the List arcs
  const cmp = (a: RelArc, b: RelArc) => order === "changed" ? (b.changes - a.changes || b.lastChangeOrder - a.lastChangeOrder) : (b.lastChangeOrder - a.lastChangeOrder);
  const listGroups: [string, RelArc[]][] = (() => {
    if (order === "tone") return TONE_GROUP.map((v) => [VALENCE_LABEL_LOCAL[v], visArcs.filter((a) => a.current!.valence === v).sort(cmp)] as [string, RelArc[]]).filter(([, l]) => l.length);
    if (order === "kind") { const m = new Map<string, RelArc[]>(); for (const a of visArcs) (m.get(a.current!.typeLabel) ?? m.set(a.current!.typeLabel, []).get(a.current!.typeLabel)!).push(a); return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([k, l]) => [k, l.sort(cmp)] as [string, RelArc[]]); }
    return [[order === "changed" ? "Changed most often" : "Changed most recently", [...visArcs].sort(cmp)]];
  })();

  const relRowEl = (a: RelArc) => (
    <RelRow key={a.relationshipId} arc={a} entById={entById} typeSwatch={typeSwatch} maxCh={maxCh} asOf={asOfVal} onOpenEntity={setSelId} />
  );

  return (
    <div className="fi rel-shell">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 12 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Relationships</h2>
        <div className="seg">
          <span className={lens === "graph" ? "on" : ""} onClick={() => setLens("graph")}>Graph</span>
          <span className={lens === "list" ? "on" : ""} onClick={() => setLens("list")}>List</span>
        </div>
        <span className="spacer" />
        {lens === "graph" && (
          <button className={"iconbtn" + (legendOpen ? " on" : "")} title="What the shapes mean"
            aria-pressed={legendOpen} onClick={() => setLegendOpen((v) => !v)}><Icon name="help" size={15} /></button>
        )}
        <button onClick={() => setTypesOpen(true)}>Manage kinds</button>
      </div>

      {lens === "list" && <RelChipBar {...chipData} />}

      <div className="rel-main">
        <div className="rel-centre">
          {lens === "graph" ? (
            <div className="rel-stage">
              <div className="graph-wrap">
                <Graph entities={entities} latest={visLatest} selected={selId}
                  onOpenEntity={setSelId} onBackground={() => setSelId(null)}
                  onIsolate={centreOn} typeSwatch={typeSwatch} legendOpen={legendOpen} />
                <RelChipBar {...chipData} />
                {maxCh > 0 && (
                  <div className="rel-scrub">
                    <span className="rel-scrub-lab">World at</span>
                    <input type="range" min={1} max={maxCh} value={shownCh} onChange={(e) => onScrub(+e.target.value)} />
                    <span className="rel-scrub-ch">chapter {shownCh}{shownCh >= maxCh ? "" : ` · ${maxCh - shownCh} ahead`}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            visArcs.length === 0 ? (
              <div className="card"><div className="row"><span className="muted">Nothing matches these controls at this point in the story.</span></div></div>
            ) : (
              <div className="rel-list">
                {listGroups.map(([header, list]) => (
                  <section key={header} className="rel-group">
                    <div className="rel-group-head"><h3 className="rel-group-title">{header}</h3><span className="rel-group-count">{list.length}</span></div>
                    <div className="card rel-list-card">{list.map(relRowEl)}</div>
                  </section>
                ))}
                {maxCh > 0 && (
                  <div className="rel-scrub static">
                    <span className="rel-scrub-lab">World at</span>
                    <input type="range" min={1} max={maxCh} value={shownCh} onChange={(e) => onScrub(+e.target.value)} />
                    <span className="rel-scrub-ch">chapter {shownCh}{shownCh >= maxCh ? "" : ` · ${maxCh - shownCh} ahead`}</span>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {selId && entById.get(selId) && (
          <EntityPanel entity={entById.get(selId)!} arcs={selArcs} entById={entById} typeSwatch={typeSwatch}
            maxCh={maxCh} asOf={asOfVal}
            onClose={() => setSelId(null)}
            onOpenEntity={setSelId}
            onOpenPage={() => go({ scope: "library", entityId: selId! })}
            onCentreHere={() => centreOn(selId!)}
            onMarkMoment={() => go({ scope: "manuscript" })} />
        )}
      </div>

      {typesOpen && (
        <div className="overlay" onClick={() => setTypesOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 6 }}>
              <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>Manage kinds</h3>
              <span className="muted" style={{ marginLeft: 10 }}>the relationship dictionary for this world</span>
              <span className="spacer" />
              <span onClick={() => setTypesOpen(false)} title="Close (Esc)" style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name="close" size={16} /></span>
            </div>
            <TypeDictionary worldId={worldId} />
          </div>
        </div>
      )}
    </div>
  );
}

// tone group labels (kept local so this file owns its List headers)
const VALENCE_LABEL_LOCAL: Record<Valence, string> = { bond: "Allied", obligation: "Duty", neutral: "Neutral", hostile: "Hostile" };
