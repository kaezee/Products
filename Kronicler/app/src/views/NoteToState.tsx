import { useState } from "react";
import { appendPairwiseState, createRelationshipType } from "../lib/api";
import type { Entity, RelationshipType, Chapter, Note, Valence } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";

const VALENCES: Valence[] = ["bond", "hostile", "obligation", "neutral"];

// The bridge: turn a planning note (usually a 🔒 secret) into a real concealed
// relationship state that the "As X believes" lens enforces. Pre-filled from
// the note's tagged entities and its body. Reuses appendPairwiseState.
export function NoteToState({ worldId, note, entities, types, chapters, onClose, onDone, onTypesChanged }: {
  worldId: string;
  note: Note;
  entities: Entity[];
  types: RelationshipType[];
  chapters: Chapter[];
  onClose: () => void;
  onDone: () => void;
  onTypesChanged: () => void;
}) {
  const tagged = note.entity_ids;
  const firstOther = entities.find((e) => e.id !== (tagged[0] ?? entities[0]?.id));
  const [a, setA] = useState(tagged[0] ?? entities[0]?.id ?? "");
  const [b, setB] = useState(tagged[1] ?? firstOther?.id ?? "");
  const [tq, setTq] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [valence, setValence] = useState<Valence>("bond");
  const [concealed, setConcealed] = useState<string[]>([]);
  const [chapterId, setChapterId] = useState<string>(""); // "" = standing (no chapter)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const q = tq.trim().toLowerCase();
  const matches = types.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 5);
  const exact = types.find((t) => t.label.toLowerCase() === q);
  const chosen = typeId ? types.find((t) => t.id === typeId) ?? null : exact ?? null;
  const canMint = !chosen && q.length > 0;

  const opts = (exclude: string) => entities.filter((e) => e.id !== exclude).map((e) => <option key={e.id} value={e.id}>{e.title}</option>);
  const concealCandidates = entities.filter((e) => e.type === "Character" && e.id !== a && e.id !== b);

  async function commit() {
    if (!a || !b || a === b) { setErr("Pick two different entities."); return; }
    setBusy(true); setErr(null);
    try {
      let tid = chosen?.id ?? null;
      if (!tid && canMint) { const t = await createRelationshipType(worldId, tq.trim(), valence); tid = t.id; onTypesChanged(); }
      if (!tid) { setErr("Choose or name the nature of the secret (a relationship type)."); setBusy(false); return; }
      await appendPairwiseState({
        worldId, entityA: a, entityB: b, typeId: tid,
        manuscriptRef: chapterId || null, note: note.body, concealedFrom: concealed,
      });
      setDone(true);
      onDone();
    } catch (x) { setErr(String(x)); setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="composer" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 10 }}>
          <span className="label" style={{ margin: 0 }}>Turn note into a concealed state</span>
          <span className="spacer" />
          <span style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose}>✕</span>
        </div>

        <p className="note" style={{ borderLeft: "2px solid var(--line)", paddingLeft: 10, margin: "0 0 14px", fontStyle: "italic" }}>
          "{note.body.length > 200 ? note.body.slice(0, 200) + "…" : note.body || "(empty note)"}"
        </p>

        {done ? (
          <div>
            <p style={{ fontFamily: "var(--serif)", fontSize: 15.5 }}>Recorded as a concealed state. 🔒 The “As … believes” lens now hides it from whoever you kept in the dark.</p>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <select value={a} onChange={(e) => setA(e.target.value)} className="sel">{opts(b)}</select>
              <div style={{ position: "relative" }}>
                <input autoFocus value={chosen ? chosen.label : tq}
                  onChange={(e) => { setTq(e.target.value); setTypeId(null); }}
                  placeholder="the secret is…"
                  style={{ width: 150, borderColor: chosen ? VALENCE_COLOR[chosen.valence] : undefined }} />
                {q.length > 0 && !typeId && (
                  <div className="typeahead">
                    {matches.map((t) => (
                      <div key={t.id} className="ta-row" onClick={() => { setTypeId(t.id); setTq(""); }}>
                        <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />{t.label}
                      </div>
                    ))}
                    {canMint && (
                      <div className="ta-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                        <span className="muted">mint “{tq.trim()}” — pick a family:</span>
                        <span style={{ display: "flex", gap: 6 }}>
                          {VALENCES.map((v) => (
                            <span key={v} title={v} onClick={() => setValence(v)}
                              style={{ width: 16, height: 16, borderRadius: "50%", background: VALENCE_COLOR[v], cursor: "pointer",
                                outline: valence === v ? "2px solid var(--ink)" : "none", outlineOffset: 1 }} />
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <select value={b} onChange={(e) => setB(e.target.value)} className="sel">{opts(a)}</select>
            </div>

            <div className="label" style={{ marginTop: 0 }}>Kept in the dark</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              {concealCandidates.length === 0 && <span className="muted">No other characters to conceal from.</span>}
              {concealCandidates.map((e) => (
                <span key={e.id} className={"chip click" + (concealed.includes(e.id) ? " on" : "")}
                  onClick={() => setConcealed((c) => c.includes(e.id) ? c.filter((x) => x !== e.id) : [...c, e.id])}>
                  {concealed.includes(e.id) ? "🔒 " : ""}{e.title.split(" ")[0]}
                </span>
              ))}
            </div>

            <div className="label" style={{ marginTop: 0 }}>When</div>
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="sel" style={{ marginBottom: 12 }}>
              <option value="">Standing — no chapter</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>ch. {c.manuscript_order} — {c.title}</option>)}
            </select>

            {err && <p className="err">{err}</p>}
            <div className="row" style={{ borderBottom: "none", padding: 0, gap: 10 }}>
              <button className="primary" onClick={commit} disabled={busy}>{busy ? "…" : "Create concealed state"}</button>
              <span className="muted">the note stays; this adds the real, lens-enforced secret</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
