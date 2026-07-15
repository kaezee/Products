import { useEffect, useState } from "react";
import { getStream } from "../lib/api";
import type { StreamRow } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";

// The Relationships Stream — the signature query, on screen. Ordered by
// manuscript position; each row is one relationship_state.
export function Stream({ worldId }: { worldId: string }) {
  const [rows, setRows] = useState<StreamRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getStream(worldId)
      .then((r) => alive && setRows(r))
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Loading the stream…</p>;
  if (rows.length === 0) return <p className="muted">No relationship states recorded yet.</p>;

  return (
    <div className="card">
      {rows.map((s) => {
        const who = s.participants.map((p) => p.title).join(" · ");
        const concealed = s.known_by?.concealed_from?.length ?? 0;
        return (
          <div className="row" key={s.state_id}>
            <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
            <span className="title-serif">{who}</span>
            <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 650, fontSize: 12.5 }}>
              {s.type_label}
            </span>
            <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.note}
            </span>
            {concealed > 0 && (
              <span style={{ color: "var(--hostile)", fontSize: 11 }}>concealed ×{concealed}</span>
            )}
            <span className="muted" style={{ whiteSpace: "nowrap" }}>
              {s.chapter_title ? `ch. ${s.manuscript_order}` : "unplaced"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
