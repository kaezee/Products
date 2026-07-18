import type { Brief } from "../lib/brief";
import type { StreamRow } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";
import { ArcSparkline } from "./ArcSparkline";

// Renders a computed chapter Brief. Read-only, derived — see computeBrief.
export function BriefPanel(props: {
  brief: Brief;
  chapterOrder: number;
  nameOf: (id: string) => string;
  compact?: boolean;
}) {
  const { brief, chapterOrder, nameOf } = props;
  const who = (r: StreamRow) => r.participants.map((p) => p.title).join(" · ");

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
                {who(r)} <span style={{ color: VALENCE_COLOR[r.valence], fontWeight: 600 }}>{r.type_label}</span>
              </span>
              {arc.length > 1 && <ArcSparkline history={arc} />}
              <span className="muted" style={{ fontSize: 10.5 }}>ch. {r.manuscript_order}</span>
            </div>
          );
        })}
      </div>

      <div className="label">Knowledge lines</div>
      <div className="card" style={{ borderColor: brief.secrets.length ? "var(--hostile)" : undefined }}>
        {brief.secrets.length === 0 && (
          <div className="row"><span className="muted">No concealments active among this cast.</span></div>
        )}
        {brief.secrets.map((r) => {
          const concealed = (r.known_by?.concealed_from ?? []).map(nameOf).join(", ");
          return (
            <div className="row" key={r.state_id} style={{ padding: "8px 12px" }}>
              <span style={{ fontSize: 12.5 }}>
                <span style={{ color: "var(--hostile)", fontWeight: 650 }}>{concealed} must not reference:</span>{" "}
                <span className="note" style={{ fontStyle: "italic" }}>{r.note}</span>
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
                <span style={{ fontSize: 12.5 }}>{who(r)} · {r.type_label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
