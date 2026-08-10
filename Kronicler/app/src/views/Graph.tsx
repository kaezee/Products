import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Entity, StreamRow } from "../lib/types";
import { computeLayout } from "../lib/layout";
import { VALENCE_COLOR, VALENCE_LABEL, VALENCE_ORDER } from "../lib/valence";
import { familyOf, FAMILY_LABEL, type NodeFamily } from "../lib/entityTypes";
import { shapeGeom } from "../lib/nodeShape";

// A swatch name ("azure") → the two entity colour tokens. Full strength for
// stroke, tint for fill; both are theme-aware.
const swStroke = (sw: string | undefined) => (sw ? `var(--k-entity-${sw})` : "var(--lineStrong)");
const swFill = (sw: string | undefined) => (sw ? `var(--k-entity-${sw}-tint)` : "var(--wash)");

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Render a node's shape from its pure geometry, without a per-tag JSX branch.
function shapeEl(geom: ReturnType<typeof shapeGeom>, extra: Record<string, unknown>) {
  return createElement(geom.tag, { ...geom.attrs, strokeLinejoin: "round", ...extra });
}

const FAMILY_ORDER: NodeFamily[] = ["being", "place", "group", "object", "moment"];
const DIM = 0.28; // focus dim — context recedes but stays legible (was 0.12)

// Node labels: drop a leading honorific/article so a name doesn't read as its
// title ("Dr John Watson" → "John Watson", "Mrs Hudson" → "Hudson", "The Baker
// Street Irregulars" → "Baker Street"). Keeps at most the two leading words.
const HONORIFICS = new Set(["the", "a", "an", "mr", "mrs", "ms", "miss", "dr", "prof", "professor",
  "inspector", "sir", "lord", "lady", "detective", "sergeant", "sgt", "captain", "capt", "colonel",
  "major", "rev", "reverend", "madame", "madam", "count", "countess", "king", "queen", "st", "saint"]);
function shortLabel(title: string): string {
  const words = title.trim().split(/\s+/);
  let i = 0;
  while (i < words.length - 1 && HONORIFICS.has(words[i].toLowerCase().replace(/\.$/, ""))) i++;
  // Ellipsis when meaningful words are dropped, so a clipped label reads as
  // clipped ("221B Baker Street" → "221B Baker…") rather than as a wrong,
  // complete-looking name ("221B Baker").
  return words.slice(i, i + 2).join(" ") + (i + 2 < words.length ? "…" : "");
}

interface Edge { a: string; b: string; row: StreamRow }

// The on-canvas key. The shape block keys by the writer's OWN type names — the
// Collection section names, each in its own colour and shape — not an abstract
// family word: shape only groups (Character and Creature both read as a circle),
// but the label you read is your vocabulary. The tone block keys the valences.
// Both list only what the visible web actually uses.
function Legend({ nodes, entById, edges, typeSwatch }: {
  nodes: string[]; entById: Map<string, Entity>; edges: Edge[]; typeSwatch: Map<string, string>;
}) {
  const kinds = useMemo(() => {
    const m = new Map<string, { name: string; fam: NodeFamily; sw: string | undefined }>();
    nodes.forEach((id) => {
      const e = entById.get(id);
      if (e && !m.has(e.type)) m.set(e.type, { name: e.type, fam: familyOf(e.type), sw: typeSwatch.get(e.type.toLowerCase()) });
    });
    return [...m.values()].sort((a, b) => FAMILY_ORDER.indexOf(a.fam) - FAMILY_ORDER.indexOf(b.fam) || a.name.localeCompare(b.name));
  }, [nodes, entById, typeSwatch]);
  const tones = useMemo(() => {
    const present = new Set(edges.map((e) => e.row.valence));
    return VALENCE_ORDER.filter((v) => present.has(v));
  }, [edges]);
  if (kinds.length === 0 && tones.length === 0) return null;
  return (
    <div className="g-legend">
      {kinds.length > 0 && (
        <div className="g-legend-block">
          {kinds.map((k) => (
            <span key={k.name} className="g-legend-row" title={`${k.name} — ${FAMILY_LABEL[k.fam]}`}>
              <svg width={15} height={15} viewBox="0 0 15 15">
                {shapeEl(shapeGeom(k.fam, 7.5, 7.5, 5), { fill: swFill(k.sw), stroke: swStroke(k.sw), strokeWidth: 1.4 })}
              </svg>
              {k.name}
            </span>
          ))}
        </div>
      )}
      {tones.length > 0 && (
        <div className="g-legend-block">
          {tones.map((v) => (
            <span key={v} className="g-legend-row">
              <span className="g-legend-dot" style={{ background: VALENCE_COLOR[v] }} />
              {VALENCE_LABEL[v]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// The relational canvas (§9.3). Click a node to focus it and its neighbours
// (Obsidian-style — the rest dims). Double-click for ego view. Zoom with the
// buttons or the wheel; drag the background to pan.
export function Graph({ entities, latest, selected, onOpenEntity, onBackground, onIsolate, typeSwatch, legendOpen }: {
  entities: Entity[];
  latest: StreamRow[];
  selected: string | null;             // the parent-owned selection (drives focus)
  onOpenEntity: (id: string) => void;  // click a node → open its page in the panel
  onBackground: () => void;            // click empty canvas → clear the selection
  onIsolate: (id: string) => void;     // double-click → centre the web here
  typeSwatch: Map<string, string>;     // entity type name (lowercased) → swatch
  legendOpen?: boolean;                // legend is toggled from the header
}) {
  const entById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const sel = selected;
  const [hov, setHov] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // The canvas coordinate space tracks the SVG's real pixel size, so the graph
  // fills its pane like the Notes board — no fixed viewBox, no letterboxing.
  const [box, setBox] = useState({ w: 960, h: 560 });
  const W = box.w, H = box.h;
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setBox((p) => (Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : { w: r.width, h: r.height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    const set = new Set<string>();
    allEdges.forEach((x) => { set.add(x.a); set.add(x.b); });
    return { nodes: [...set], edges: allEdges };
  }, [allEdges]);

  const pos = useMemo(() => computeLayout(nodes, edges.map((e) => [e.a, e.b] as [string, string])), [nodes, edges]);

  // Fit the visible web to fill the pane, with pixel insets that keep nodes
  // (and their labels) clear of the on-canvas chrome — legend top-right, hint
  // top-left, zoom controls / detail card bottom. The old code capped at k=240
  // absolutely, so the fit almost never won and the graph sat as a small blob
  // in a fifth of its canvas. Now the fill wins; the cap only stops a 1–2 node
  // graph from flying apart. Recomputes on every box/nodes change, so it refits
  // on resize and on the right panel collapsing (both change W/H).
  const cam = useMemo(() => {
    const pts = nodes.map((id) => pos.get(id)!).filter(Boolean);
    if (pts.length === 0) return { k: 1, tx: W / 2, ty: H / 2, insetTop: 0 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const insetX = 76, insetTop = 60, insetBottom = 60;
    const availW = Math.max(80, W - insetX * 2);
    const availH = Math.max(80, H - insetTop - insetBottom);
    const pad = 0.22; // world-unit breathing room so edge shapes aren't clipped
    const spanX = (x1 - x0) + pad * 2 || 1, spanY = (y1 - y0) + pad * 2 || 1;
    const k = Math.min(availW / spanX, availH / spanY, 300); // cap: no ballooning
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { k, tx: insetX + availW / 2 - k * cx, ty: insetTop + availH / 2 - k * cy, insetTop };
  }, [pos, nodes, W, H]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    edges.forEach((e) => { d.set(e.a, (d.get(e.a) ?? 0) + 1); d.set(e.b, (d.get(e.b) ?? 0) + 1); });
    return d;
  }, [edges]);

  // focus: the selected node plus everything one hop away
  const focusSet = useMemo(() => {
    if (!sel) return null;
    const s = new Set<string>([sel]);
    edges.forEach((e) => { if (e.a === sel) s.add(e.b); if (e.b === sel) s.add(e.a); });
    return s;
  }, [sel, edges]);

  // wheel zoom (non-passive so we can prevent the page scrolling)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 6)); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  function onMove(e: React.MouseEvent) {
    const d = drag.current;
    if (!d) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const f = W / rect.width;
    // Compute the delta NOW, before advancing the drag anchor. The old code read
    // drag.current inside the setPan updater, which React runs after this handler
    // has already reset the anchor to the current point → delta always 0 → no pan.
    const dx = (e.clientX - d.x) * f, dy = (e.clientY - d.y) * f;
    d.x = e.clientX; d.y = e.clientY; d.moved = true;
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  if (latest.length === 0) {
    return <div className="card"><div className="row"><span className="muted">No relationships match these lenses at this point in the story.</span></div></div>;
  }

  return (
    <div className="card graph-card">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "100%", background: "var(--k-bg-surface)", cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; }}
        onMouseMove={onMove}
        onMouseUp={() => { const moved = drag.current?.moved; drag.current = null; if (!moved) onBackground(); }}
        onMouseLeave={() => { drag.current = null; }}>
        {/* One transform, via the SVG attribute (not a CSS transform on a <g>,
            which Safari/Firefox position differently): pan/zoom composed with the
            auto-fit camera. Keeps content on-screen and pan/zoom reliable. */}
        <g transform={`translate(${pan.x} ${pan.y}) translate(${W / 2} ${H / 2}) scale(${zoom}) translate(${-W / 2} ${-H / 2}) translate(${cam.tx} ${cam.ty}) scale(${cam.k})`}>
            {edges.map((e, i) => {
              const p = pos.get(e.a), q = pos.get(e.b);
              if (!p || !q) return null;
              const concealed = (e.row.known_by?.concealed_from?.length ?? 0) > 0;
              const lit = !focusSet || e.a === sel || e.b === sel;
              return (
                <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                  stroke={VALENCE_COLOR[e.row.valence]}
                  strokeWidth={(e.row.valence === "hostile" ? 2.2 : 1.5) / cam.k}
                  opacity={(e.row.is_ambient ? 0.4 : 0.8) * (lit ? 1 : DIM)}
                  strokeDasharray={concealed ? `${4 / cam.k} ${4 / cam.k}` : undefined} />
              );
            })}
            {/* Edge type labels only for the edges touching the selected or
                hovered node (RELATIONSHIPSBUILD.md §6) — labelling every edge at
                once produces overlapping text; the labels you want are the ones
                for the thing you're looking at. */}
            {(sel || hov) && edges.map((e, i) => {
              const active = e.a === sel || e.b === sel || e.a === hov || e.b === hov;
              if (!active) return null;
              const p = pos.get(e.a), q = pos.get(e.b);
              if (!p || !q) return null;
              const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
              return (
                <text key={"el" + i} x={mx} y={my} fontSize={9.5 / (cam.k * zoom)} textAnchor="middle"
                  dominantBaseline="central" fontFamily="var(--sans)" fontWeight={550}
                  fill={VALENCE_COLOR[e.row.valence]} stroke="var(--k-bg-surface)"
                  strokeWidth={3 / (cam.k * zoom)} paintOrder="stroke"
                  style={{ pointerEvents: "none" }}>
                  {e.row.type_label}
                </text>
              );
            })}
            {nodes.map((id) => {
              const p = pos.get(id); if (!p) return null;
              const ent = entById.get(id);
              const deg = degree.get(id) ?? 0;
              const r = (8 + Math.min(deg * 2.2, 12)) / cam.k;
              const isSel = sel === id;
              const lit = !focusSet || focusSet.has(id);
              const fam = familyOf(ent?.type ?? "");
              const sw = ent ? typeSwatch.get(ent.type.toLowerCase()) : undefined;
              const geom = shapeGeom(fam, p.x, p.y, r);
              return (
                <g key={id} style={{ cursor: "pointer", opacity: lit ? 1 : DIM, transition: "opacity .25s" }}
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onMouseEnter={() => setHov(id)} onMouseLeave={() => setHov((h) => (h === id ? null : h))}
                  onClick={(ev) => { ev.stopPropagation(); onOpenEntity(id); }}
                  onDoubleClick={(ev) => { ev.stopPropagation(); onIsolate(id); }}>
                  {ent && <title>{ent.title}</title>}{/* full name on hover — labels are clipped */}
                  {/* selection ring — an outer copy of the same shape, so the
                      node keeps its type colour instead of turning blue */}
                  {isSel && shapeEl(shapeGeom(fam, p.x, p.y, r + 4 / cam.k), {
                    key: "ring", fill: "none", stroke: "var(--bond)", strokeWidth: 2.4 / cam.k,
                  })}
                  {shapeEl(geom, {
                    fill: swFill(sw), stroke: swStroke(sw), strokeWidth: (isSel ? 2 : 1.4) / cam.k,
                  })}
                  <text x={p.x} y={p.y + r * 1.5 + 12 / cam.k} fontSize={11 / cam.k} textAnchor="middle"
                    fill={isSel ? "var(--bond)" : "var(--sub)"} fontWeight={isSel || deg >= 3 ? 600 : 450} fontFamily="var(--sans)">
                    {ent ? shortLabel(ent.title) : ""}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>

      {/* Legend — the key to shapes (what a node IS) and tones (how a link
          feels). Only families and tones actually present are shown, so it
          never lists shapes the world doesn't use. */}
      {legendOpen && <Legend nodes={nodes} entById={entById} edges={edges} typeSwatch={typeSwatch} />}


      {/* zoom controls */}
      <div style={{ position: "absolute", bottom: 14, left: 12, display: "flex", flexDirection: "column", gap: 4 }}>
        <button style={{ padding: "4px 9px", fontSize: 14, lineHeight: 1 }} title="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.25, 0.4, 6))}>+</button>
        <button style={{ padding: "4px 9px", fontSize: 14, lineHeight: 1 }} title="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.25, 0.4, 6))}>−</button>
        <button style={{ padding: "4px 9px", fontSize: 11, lineHeight: 1 }} title="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>⟳</button>
      </div>

    </div>
  );
}
