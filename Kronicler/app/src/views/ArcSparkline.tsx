import type { StreamRow } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";

// A relationship's arc: one bar per state in story order, coloured by valence,
// fading in toward the present — you read a bond souring or mending at a glance.
export function ArcSparkline({ history }: { history: StreamRow[] }) {
  const items = history.slice(-14);
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }} title="Relationship arc — how it changed over the story">
      {items.map((h, i) => (
        <span key={h.state_id}
          title={`${h.type_label} · ${h.manuscript_order != null ? "ch. " + h.manuscript_order : "standing"}`}
          style={{ width: 5, height: 13, borderRadius: 2, background: VALENCE_COLOR[h.valence], opacity: 0.5 + 0.5 * (i / Math.max(1, items.length - 1)) }} />
      ))}
    </span>
  );
}
