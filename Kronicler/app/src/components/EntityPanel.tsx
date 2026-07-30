import { useEffect, useMemo } from "react";
import type { Entity } from "../lib/types";
import type { RelArc } from "../lib/relArc";
import { familyOf, type NodeFamily } from "../lib/entityTypes";
import { RelRow } from "./RelRow";
import { Icon } from "./icons";

// An entity's own page over the relationship web, docked as a right-side panel
// (not an overlay) so the graph stays visible and interactive beside it — the
// Figma two-panel idea: canvas in the middle, an inspector on the right.
// Clicking another node just updates this panel. Every connection the entity
// holds, as of the current chapter, grouped by what the counterpart IS and read
// in anchored form (only the other name). Reuses the same RelRow as the List.
const GROUP_ORDER: NodeFamily[] = ["being", "group", "place", "object", "moment"];
const GROUP_LABEL: Record<NodeFamily, string> = {
  being: "People", group: "Groups", place: "Places", object: "Things", moment: "Moments",
};

export function EntityPanel({ entity, arcs, entById, typeSwatch, maxCh, asOf, onClose, onOpenEntity, onOpenPage, onShowWorld, onMarkMoment }: {
  entity: Entity;
  arcs: RelArc[];               // this entity's arcs (current standing), unfiltered by the controls
  entById: Map<string, Entity>;
  typeSwatch: Map<string, string>;
  maxCh: number;
  asOf: number;
  onClose: () => void;
  onOpenEntity: (id: string) => void;
  onOpenPage: () => void;
  onShowWorld: () => void;
  onMarkMoment: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const groups = useMemo(() => {
    const m = new Map<NodeFamily, RelArc[]>();
    for (const a of arcs) {
      const other = a.participants.find((p) => p.entity_id !== entity.id) ?? a.participants[0];
      const fam = familyOf(entById.get(other.entity_id)?.type ?? "object");
      (m.get(fam) ?? m.set(fam, []).get(fam)!).push(a);
    }
    return GROUP_ORDER.filter((f) => m.has(f)).map((f) => [f, m.get(f)!] as [NodeFamily, RelArc[]]);
  }, [arcs, entity.id, entById]);

  return (
    <aside className="entpanel" role="complementary" aria-label={`${entity.title} — connections`}>
      <div className="entpanel-head">
        <span className="title-serif entpanel-name">{entity.title}</span>
        <span className="entpanel-type">{entity.type}</span>
        <span className="spacer" />
        <span className="entpanel-x" role="button" tabIndex={0} title="Close (Esc)" onClick={onClose}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClose(); } }}><Icon name="close" size={16} /></span>
      </div>
      <div className="entpanel-meta">
        {arcs.length} {arcs.length === 1 ? "connection" : "connections"} · as the story stands at chapter {asOf}
      </div>

      <div className="entpanel-body">
        {arcs.length === 0 ? (
          <div className="entpanel-empty">
            <p>No connections yet — {entity.title.split(" ")[0]} appears in your prose, but you haven’t said how they relate to anything.</p>
            <button className="primary" onClick={onMarkMoment}>Mark a moment</button>
          </div>
        ) : (
          groups.map(([fam, list]) => (
            <section key={fam} className="entpanel-group">
              <div className="entpanel-group-head">
                <h4>{GROUP_LABEL[fam]}</h4><span className="entpanel-group-count">{list.length}</span>
              </div>
              <div className="entpanel-rows">
                {list.map((a) => (
                  <RelRow key={a.relationshipId} arc={a} entById={entById} typeSwatch={typeSwatch}
                    maxCh={maxCh} asOf={asOf} anchor={entity.id} compact onOpenEntity={onOpenEntity} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="entpanel-foot">
        <button onClick={onOpenPage}>Open page <Icon name="arrow" size={13} /></button>
        <span className="spacer" />
        <button onClick={onShowWorld}>Show whole world</button>
      </div>
    </aside>
  );
}
