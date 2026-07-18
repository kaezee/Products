import type { Brief } from "../lib/brief";
import type { StreamRow } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";
import { ArcSparkline } from "./ArcSparkline";

// Renders a computed chapter Brief. Read-only, derived — see computeBrief.
export function BriefPanel(props: {
  brief: Brief;
  chapterOrder: number;
  nameOf: (id: string) => string;
  onOpenEntity?: (id: string) => void;
  compact?: boolean;
}) {
  const { brief, chapterOrder, nameOf, onOpenEntity } = props;

  // participant names, each a jump link to that entity's page
  const people = (r: StreamRow) =>
    r.participants.map((p, i) => (
      <span key={p.entity_id}>
        {i > 0 && " · "}
        <span onClick={onOpenEntity ? () => onOpenEntity(p.entity_id) : undefined}
          style={onOpenEntity ? { cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--line)", textUnderlineOffset: 2 } : undefined}>
          {p.title}
        </span>
      </span>
    ));

  return (
    <div>
      <div className="label" style={{ marginTop: 0 }}>True entering ch. {chapterOrder}</div>
      <div className="card">
        {brief.entering.length === 0 && (
          <div className="row"><span className="muted">No prior states among this cast — a first meeting, relationally.</span></div>
        )}
        {brief.entering.map((r) => {
          const arc = brief.arcByRel.get(r.relationship_id) ?? [];
          return (
            <div className="row" key={r.state_id} style={{ padding: "8px 12px" }}>
              <span className="dot" style={{ background: VALENCE_COLOR[r.valence] }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>
                {people(r)} <span style={{ color: VALENCE_COLOR[r.valence], fontWeight: 600 }}>{r.type_label}</span>
              </span>
              {arc.length > 1 && <ArcSparkline history={arc} />}
              <span className="muted" style={{ fontSize: 10.5 }}>ch. {r.manuscript_order}</span>
            </div>
          );
        })}
      </div>

      <div className="label">Who's in the dark</div>
      <div className="card" style={{ borderColor: brief.secrets.length ? "var(--hostile)" : undefined }}>
        {brief.secrets.length === 0 && (
          <div className="row"><span className="muted">No secrets in play among this cast — everyone here knows what you know.</span></div>
        )}
        {brief.secrets.map((r) => {
          const inDark = (r.known_by?.concealed_from ?? []).map(nameOf).join(", ");
          return (
            <div className="row" key={r.state_id} style={{ padding: "8px 12px", alignItems: "flex-start", gap: 8 }}>
              <span style={{ fontSize: 13 }}>🤫</span>
              <span style={{ fontSize: 12.5 }}>
                <span style={{ color: "var(--hostile)", fontWeight: 650 }}>{inDark}</span>
                <span className="muted"> {(r.known_by?.concealed_from?.length ?? 0) > 1 ? "don't" : "doesn't"} know</span>
                {" — "}
                {r.note
                  ? <span className="note" style={{ fontStyle: "italic" }}>{r.note}</span>
                  : <span>{people(r)} <span style={{ color: VALENCE_COLOR[r.valence], fontWeight: 600 }}>{r.type_label}</span></span>}
              </span>
            </div>
          );
        })}
      </div>

      {brief.dormant.length > 0 && (
        <>
          <div className="label">Threads you could touch here</div>
          <div className="card">
            {brief.dormant.map((r) => (
              <div className="row" key={r.state_id} style={{ padding: "8px 12px" }}>
                <span className="chip" style={{ background: "var(--surface)", borderColor: "#e0c89a", color: "var(--obligation)" }}>
                  quiet {chapterOrder - (r.manuscript_order ?? 0)} ch.
                </span>
                <span style={{ fontSize: 12.5 }}>{people(r)} · {r.type_label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
