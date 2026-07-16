import { useEffect, useMemo, useState } from "react";
import { getEntities, getChapters, getStream } from "../lib/api";
import type { Entity, Chapter, StreamRow } from "../lib/types";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";

// Universal content search (§9.5, the "Find" verb): full-text over entity docs +
// aliases, chapter prose, and state notes. Output is a results page grouped by
// scope; the verb is always navigate. State-note results are a category no
// competitor can return.
export function SearchResults({ worldId, query, go }: { worldId: string; query: string; go: (n: Nav) => void }) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stream, setStream] = useState<StreamRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getEntities(worldId), getChapters(worldId), getStream(worldId)])
      .then(([e, c, s]) => { if (!alive) return; setEntities(e); setChapters(c); setStream(s); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const q = query.trim().toLowerCase();
  const eHits = useMemo(() => entities.filter((e) => (e.title + " " + e.aliases.join(" ") + " " + e.body).toLowerCase().includes(q)), [entities, q]);
  const cHits = useMemo(() => chapters.filter((c) => (c.title + " " + c.body).toLowerCase().includes(q)), [chapters, q]);
  const sHits = useMemo(() => stream.filter((s) => (s.note ?? "").toLowerCase().includes(q)), [stream, q]);
  const total = eHits.length + cHits.length + sHits.length;

  if (err) return <p className="err">{err}</p>;

  return (
    <div className="fi">
      <p style={{ fontSize: 13, color: "var(--sub)", marginTop: 0 }}>
        {total} result{total !== 1 ? "s" : ""} for <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--ink)" }}>"{query}"</span>
      </p>

      {eHits.length > 0 && (
        <>
          <div className="label">Entities · {eHits.length}</div>
          <div className="card">
            {eHits.map((e) => (
              <div className="row click" key={e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
                <span className="title-serif">{e.title}</span>
                <span className="chip">{e.type}</span>
                <span className="spacer" />
                <span className="faint">→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {cHits.length > 0 && (
        <>
          <div className="label">Chapters · {cHits.length}</div>
          <div className="card">
            {cHits.map((c) => (
              <div className="row click" key={c.id} onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                <span style={{ fontWeight: 550 }}>Ch. {c.manuscript_order} — {c.title}</span>
                <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body.slice(0, 90)}</span>
                <span className="faint">→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {sHits.length > 0 && (
        <>
          <div className="label">State notes · {sHits.length} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 450 }}>— the result category no other tool can return</span></div>
          <div className="card">
            {sHits.map((s) => (
              <div className="row click" key={s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
                <span style={{ fontWeight: 550, fontSize: 12.5 }}>
                  {s.participants.map((p) => p.title).join(" · ")} · {s.type_label}
                </span>
                <span className="note" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.note}</span>
                <span className="faint">→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {total === 0 && (
        <p className="muted">Nothing matches. Search covers entity docs, aliases, chapter prose, and state notes.</p>
      )}
    </div>
  );
}
