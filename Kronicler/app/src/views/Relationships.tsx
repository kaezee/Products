import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes, getEntityTypes, softDeleteRelationship } from "../lib/api";
import type { StreamRow, Entity, RelationshipType, EntityType } from "../lib/types";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";
import { streamPhrase } from "../lib/direction";
import { visibleUnderLens, latestTruthByRel, latestByRel, isBelief, believersOf, ironyLabel } from "../lib/knowledge";
import { buildTypeSwatches } from "../lib/entityTypes";
import { Graph } from "./Graph";
import { TypeDictionary } from "./TypeDictionary";
import { Icon } from "../components/icons";
import { SidePanel, Disclosure } from "../components/SidePanel";
import { confirmDialog } from "../components/confirm";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";

// Undirected adjacency between entities, from one-state-per-relationship edges.
function adjacency(latest: StreamRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b); };
  for (const r of latest) {
    const ids = r.participants.map((p) => p.entity_id);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) { link(ids[i], ids[j]); link(ids[j], ids[i]); }
  }
  return m;
}
// The set of entities within `depth` steps of a centre (centre included).
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

// Relationships (§9). One control set in the right panel drives the lens; the
// engine (stream view, knowledge/direction libs) is unchanged — this is the
// presentation layer over it.
export function Relationships({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [lens, setLens] = useState<"graph" | "list">("graph");
  const [typesOpen, setTypesOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem("k.relpanel") !== "0");

  // the control set
  const [centre, setCentre] = useState<string | null>(null);   // "centre on" (was ego)
  const [depth, setDepth] = useState<1 | 2 | 3>(2);             // "how far out"
  const [kinds, setKinds] = useState<Set<string>>(new Set());   // type ids; empty = all
  const [prevKinds, setPrevKinds] = useState<Set<string>>(new Set()); // for name-click isolate
  const [viewer, setViewer] = useState("all");                  // "point of view": all | entity id
  const [asOf, setAsOf] = useState<number | null>(null);        // chapter position

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

  function togglePanel() {
    setPanelOpen((v) => { localStorage.setItem("k.relpanel", v ? "0" : "1"); return !v; });
  }

  const maxCh = useMemo(() => (rows ?? []).reduce((m, r) => Math.max(m, r.manuscript_order ?? 0), 0), [rows]);
  const asOfVal = asOf ?? maxCh;
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.title.split(" ")[0] ?? "someone";
  const typeSwatch = useMemo(
    () => buildTypeSwatches(entityTypes.map((t) => ({ name: t.name, swatch: t.swatch })), entities.map((e) => e.type)),
    [entityTypes, entities],
  );
  // Point of view only appears once the world holds a secret or a belief.
  const hasSecrets = useMemo(
    () => (rows ?? []).some((r) => (r.known_by?.concealed_from?.length ?? 0) > 0 || isBelief(r)),
    [rows],
  );

  // ── derivation ────────────────────────────────────────────────────────────
  // Everything is a pure function of the control set over the event log.
  const byAsOf = useMemo(
    () => (rows ?? []).filter((r) => r.manuscript_order == null || r.manuscript_order <= asOfVal),
    [rows, asOfVal],
  );
  const kindsApplied = (sub: StreamRow[]) => (kinds.size ? sub.filter((r) => kinds.has(r.type_id)) : sub);
  // one current state per relationship under a point of view
  const latestPerRel = (sub: StreamRow[], pov: string): StreamRow[] =>
    pov === "all" ? [...latestTruthByRel(sub).values()] : latestByRel(visibleUnderLens(sub, pov));

  // edge set with kinds + pov applied but NOT the centre — the basis for the
  // centre list, the depth reach, and (once centred) the visible web.
  const edgesNoCentre = useMemo(() => latestPerRel(kindsApplied(byAsOf), viewer), [byAsOf, kinds, viewer]);

  // effective depth: never deeper than the web actually reaches from the centre
  const reachAt = useMemo(() => {
    const f: number[] = [1]; // reachAt(0) = just the centre
    if (centre) for (let d = 1; d <= 3; d++) f[d] = bfsReach(edgesNoCentre, centre, d).size;
    return f;
  }, [edgesNoCentre, centre]);
  const liveMax = useMemo(() => {
    let m = 1;
    for (let d = 2; d <= 3; d++) if (reachAt[d] > reachAt[d - 1]) m = d;
    return m;
  }, [reachAt]);
  const effDepth = Math.min(depth, liveMax);
  const reach = useMemo(
    () => (centre ? bfsReach(edgesNoCentre, centre, effDepth) : null),
    [edgesNoCentre, centre, effDepth],
  );

  // the visible web (graph) and stream (list)
  const inReach = (r: StreamRow) => !reach || r.participants.every((p) => reach.has(p.entity_id));
  const visLatest = useMemo(() => edgesNoCentre.filter(inReach), [edgesNoCentre, reach]);
  const truthByRel = useMemo(() => latestTruthByRel(kindsApplied(byAsOf)), [byAsOf, kinds]);
  const listRows = useMemo(
    () => visibleUnderLens(kindsApplied(byAsOf), viewer)
      .filter(inReach)
      .sort((a, b) => (a.manuscript_order ?? 1e9) - (b.manuscript_order ?? 1e9)),
    [byAsOf, kinds, viewer, reach],
  );

  // ── counts (cross-filtered: each reflects the OTHER controls, not its own) ──
  const connCount = (id: string) => edgesNoCentre.filter((r) => r.participants.some((p) => p.entity_id === id)).length;
  // kinds count: the pov+as-of world (ignoring the kind toggles), within reach
  const kindCount = useMemo(() => {
    const base = latestPerRel(byAsOf, viewer).filter(inReach);
    const m = new Map<string, number>();
    for (const r of base) m.set(r.type_id, (m.get(r.type_id) ?? 0) + 1);
    return m;
  }, [byAsOf, viewer, reach]);
  // characters that appear in any relationship (for the point-of-view list)
  const povPeople = useMemo(() => {
    const ids = new Set<string>();
    for (const r of latestPerRel(byAsOf, "all")) for (const p of r.participants) ids.add(p.entity_id);
    return entities.filter((e) => e.type === "Character" && ids.has(e.id));
  }, [byAsOf, entities]);

  // entities grouped by type for the centre list
  const centreGroups = useMemo(() => {
    const g = new Map<string, Entity[]>();
    for (const e of entities) (g.get(e.type) ?? g.set(e.type, []).get(e.type)!).push(e);
    for (const list of g.values()) list.sort((a, b) => b0(connCount, b) - b0(connCount, a) || a.title.localeCompare(b.title));
    return [...g.entries()];
  }, [entities, edgesNoCentre]);

  async function removeRelationship(relId: string, label: string) {
    if (!(await confirmDialog({ title: "Remove relationship", message: `Remove the "${label}" relationship and its whole history? It's soft-deleted — recoverable, nothing is truly lost.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      await softDeleteRelationship(relId);
      setRows((prev) => (prev ?? []).filter((r) => r.relationship_id !== relId));
    } catch (x) { setErr(String(x)); }
  }

  // click a kind's NAME (not its box) to isolate it; click again to restore
  function isolateKind(id: string) {
    setKinds((cur) => {
      if (cur.size === 1 && cur.has(id)) return new Set(prevKinds); // restore
      setPrevKinds(cur);
      return new Set([id]);
    });
  }
  function toggleKind(id: string) {
    setKinds((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <SkeletonRows rows={6} />;

  if (rows.length === 0) {
    return (
      <div className="fi">
        <h2 className="scope-title" style={{ marginBottom: 12 }}>Relationships</h2>
        <EmptyState icon="relationships"
          title="No relationships yet"
          desc="Relationships grow out of your prose. Open a chapter, select a line where two characters connect, and record what passes between them — it appears here as a living web you can filter and rewind."
          steps={["Add your cast", "Mark a moment in a chapter", "See the web"]}
          action={{ label: "Open the Manuscript", onClick: () => go({ scope: "manuscript" }) }} />
      </div>
    );
  }

  const centreName = centre ? entities.find((e) => e.id === centre)?.title.split(" ")[0] : null;
  const depthSteps: { v: 1 | 2 | 3; label: string }[] = [
    { v: 1, label: "direct" }, { v: 2, label: "2 steps" }, { v: 3, label: "3 steps" },
  ];

  return (
    <div className="fi rel-shell">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10, gap: 12 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Relationships</h2>
        <div className="seg">
          <span className={lens === "graph" ? "on" : ""} onClick={() => setLens("graph")}>Graph</span>
          <span className={lens === "list" ? "on" : ""} onClick={() => setLens("list")}>List</span>
        </div>
        <span className="spacer" />
        <button onClick={() => setTypesOpen(true)}>Manage kinds</button>
      </div>

      <div className="rel-main">
        <div className="rel-centre">
          {lens === "graph" ? (
            <div className="rel-stage">
              <Graph entities={entities} latest={visLatest} ego={null}
                setEgo={(id) => { if (id) { setCentre(id); setDepth(1); } }} go={go} typeSwatch={typeSwatch} />
            </div>
          ) : (
            listRows.length === 0 ? (
              <div className="card"><div className="row"><span className="muted">Nothing matches these controls at this point in the story.</span></div></div>
            ) : (
              <div className="card">
                {listRows.map((s) => {
                  const concealed = s.known_by?.concealed_from?.length ?? 0;
                  const belief = isBelief(s);
                  const believers = believersOf(s).map(nameOf).join(", ");
                  const irony = belief ? ironyLabel(s, truthByRel) : null;
                  const ph = streamPhrase(s);
                  const verb = { color: VALENCE_COLOR[s.valence], fontWeight: 650, fontSize: 12.5 } as const;
                  return (
                    <div className="row" key={s.state_id} style={belief ? { borderLeft: "2px solid var(--obligation)" } : undefined}>
                      <span className="dot" style={{ background: VALENCE_COLOR[s.valence], opacity: belief ? 0.55 : 1 }} />
                      {ph.subject ? (
                        <span className="title-serif">{ph.subject} <span style={verb}>{ph.verb}</span> {ph.object}</span>
                      ) : (
                        <>
                          <span className="title-serif">{ph.names}</span>
                          {ph.trailingVerb && <span style={verb}>{ph.trailingVerb}</span>}
                        </>
                      )}
                      {belief && (
                        <span style={{ fontSize: 11, color: "var(--obligation)", whiteSpace: "nowrap" }}
                          title="A belief held by these characters — may differ from the truth">
                          🧠 {believers} believe{believersOf(s).length === 1 ? "s" : ""}
                          {irony && <span style={{ color: "var(--hostile)" }}> — actually {irony}</span>}
                        </span>
                      )}
                      <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</span>
                      {concealed > 0 && <span style={{ color: "var(--hostile)", fontSize: 11 }}>hidden from {concealed}</span>}
                      <span className="muted" style={{ whiteSpace: "nowrap" }} title="Not tied to a specific chapter — a standing fact, true throughout">{s.manuscript_order != null ? `ch. ${s.manuscript_order}` : "no chapter"}</span>
                      <span className="rowact" title="Remove this relationship"
                        onClick={() => removeRelationship(s.relationship_id, s.type_label)}
                        style={{ cursor: "pointer", color: "var(--faint)", padding: "0 2px", display: "inline-flex" }}><Icon name="close" size={13} /></span>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <SidePanel open={panelOpen} onToggle={togglePanel}>
          {/* Centre on */}
          <Disclosure label="Centre on" count={centreName ?? undefined} defaultOpen>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select className="sel" value={centre ?? ""} onChange={(e) => { setCentre(e.target.value || null); }}>
                <option value="">— the whole world —</option>
                {centreGroups.map(([type, list]) => (
                  <optgroup key={type} label={type}>
                    {list.map((e) => {
                      const c = connCount(e.id);
                      return <option key={e.id} value={e.id} disabled={c === 0}>{e.title.split(" ")[0]} — {c} {c === 1 ? "connection" : "connections"}</option>;
                    })}
                  </optgroup>
                ))}
              </select>
              {centre && <button onClick={() => setCentre(null)}>Show the whole world</button>}
              <span className="rel-help">what the web draws itself around</span>
            </div>
          </Disclosure>

          {/* How far out */}
          <Disclosure label="How far out" count={centre ? `${reachAt[effDepth] - 1}` : undefined} defaultOpen>
            {!centre ? (
              <span className="rel-help">centre on something first</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="seg rel-seg">
                  {depthSteps.map((d) => {
                    const dead = d.v > 1 && reachAt[d.v] === reachAt[d.v - 1];
                    return (
                      <span key={d.v} className={(effDepth === d.v ? "on " : "") + (dead ? "off" : "")}
                        title={dead ? "reaches no one new" : undefined}
                        onClick={() => !dead && setDepth(d.v)}>{d.label}</span>
                    );
                  })}
                </div>
                <span className="rel-help">{reachAt[effDepth] - 1} within {effDepth === 1 ? "reach" : `${effDepth} steps`} of {centreName}</span>
              </div>
            )}
          </Disclosure>

          {/* Kinds of connection */}
          <Disclosure label="Kinds" count={kinds.size ? kinds.size : undefined} defaultOpen>
            <div className="rel-kinds">
              <label className="rel-kind">
                <input type="checkbox" checked={kinds.size === 0} onChange={() => setKinds(new Set())} />
                <span className="rel-kind-name">every kind</span>
              </label>
              {types.map((t) => {
                const c = kindCount.get(t.id) ?? 0;
                const on = kinds.has(t.id);
                return (
                  <label key={t.id} className={"rel-kind" + (c === 0 ? " off" : "")}>
                    <input type="checkbox" checked={on} disabled={c === 0} onChange={() => toggleKind(t.id)} />
                    <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />
                    <span className="rel-kind-name" title="Show only this kind"
                      onClick={(ev) => { ev.preventDefault(); if (c > 0) isolateKind(t.id); }}>{t.label}</span>
                    <span className="disc-count">{c}</span>
                  </label>
                );
              })}
            </div>
          </Disclosure>

          {/* Point of view */}
          {hasSecrets && (
            <Disclosure label="Point of view" count={viewer !== "all" ? "1" : undefined} defaultOpen>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select className="sel" value={viewer} onChange={(e) => setViewer(e.target.value)}>
                  <option value="all">you — you know everything</option>
                  {povPeople.map((e) => <option key={e.id} value={e.id}>as {e.title.split(" ")[0]} believes</option>)}
                </select>
                {viewer !== "all" && <span className="rel-help" style={{ color: "var(--hostile)" }}>their world — secrets they don’t know vanish, their own beliefs stand in</span>}
                <span className="rel-help">whose knowledge shapes what you see</span>
              </div>
            </Disclosure>
          )}
        </SidePanel>
      </div>

      {/* chapter position — spans centre + panel, drives both lenses and counts */}
      {maxCh > 0 && (
        <div className="rel-footer">
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Showing the world at</span>
          <input type="range" min={1} max={maxCh} value={asOfVal} onChange={(e) => setAsOf(+e.target.value)} style={{ flex: 1, accentColor: "var(--bond)" }} />
          <span style={{ fontWeight: 650, color: "var(--ink)", whiteSpace: "nowrap", fontFamily: "var(--k-font-mono)" }}>chapter {asOfVal}</span>
          <span className="faint" style={{ whiteSpace: "nowrap" }}>{asOfVal >= maxCh ? "everything so far" : `${maxCh - asOfVal} ${maxCh - asOfVal === 1 ? "chapter" : "chapters"} still ahead`}</span>
        </div>
      )}

      {typesOpen && (
        <div className="overlay" onClick={() => setTypesOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 6 }}>
              <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>Manage kinds</h3>
              <span className="muted" style={{ marginLeft: 10 }}>the relationship dictionary for this world</span>
              <span className="spacer" />
              <span onClick={() => setTypesOpen(false)} title="Close (Esc)"
                style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name="close" size={16} /></span>
            </div>
            <TypeDictionary worldId={worldId} />
          </div>
        </div>
      )}
    </div>
  );
}

// tiny helper: connection count via a passed fn, for sort comparators
function b0(fn: (id: string) => number, e: Entity): number { return fn(e.id); }
