import { useMemo, useState } from "react";
import { appendPairwiseState, createRelationshipType } from "../lib/api";
import type { Entity, RelationshipType, Valence } from "../lib/types";
import { VALENCE_COLOR } from "../lib/valence";

const VALENCES: Valence[] = ["bond", "hostile", "obligation", "neutral"];

// The state composer (§8): sentence-shaped, not form-shaped. [A] [did what] [B],
// with the selected prose as the note, knowledge default = everyone, exceptions
// opt-in only. Rendered as a modal in phase 3; inline-anchored positioning is a
// design-phase refinement.
export function Composer(props: {
  worldId: string;
  chapterId: string;
  entities: Entity[];
  types: RelationshipType[];
  castIds: string[];
  note: string;
  onClose: () => void;
  onAppended: () => void;
  onTypesChanged: () => void;
}) {
  const { worldId, chapterId, entities, types, castIds, note, onClose, onAppended, onTypesChanged } = props;

  const ordered = useMemo(() => {
    // cast first, then everyone else — you usually mark the people on the page
    const inCast = entities.filter((e) => castIds.includes(e.id));
    const rest = entities.filter((e) => !castIds.includes(e.id));
    return [...inCast, ...rest];
  }, [entities, castIds]);

  const [a, setA] = useState(ordered[0]?.id ?? "");
  const [b, setB] = useState(ordered[1]?.id ?? "");
  const [typeQuery, setTypeQuery] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [mintValence, setMintValence] = useState<Valence>("neutral");
  const [concealed, setConcealed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const q = typeQuery.trim().toLowerCase();
  const matches = types.filter((t) => t.label.toLowerCase().includes(q)).slice(0, 5);
  const exact = types.find((t) => t.label.toLowerCase() === q);
  const chosenType = typeId ? types.find((t) => t.id === typeId) ?? null : exact ?? null;
  const canMint = !chosenType && q.length > 0;

  async function commit() {
    if (!a || !b || a === b) { setErr("Pick two different entities."); return; }
    setBusy(true);
    setErr(null);
    try {
      let tid = chosenType?.id ?? null;
      if (!tid && canMint) {
        const t = await createRelationshipType(worldId, typeQuery.trim(), mintValence);
        tid = t.id;
        onTypesChanged();
      }
      if (!tid) { setErr("Choose or name a relationship type."); setBusy(false); return; }
      await appendPairwiseState({
        worldId,
        entityA: a,
        entityB: b,
        typeId: tid,
        manuscriptRef: chapterId,
        note,
        concealedFrom: concealed,
      });
      onAppended();
      onClose();
    } catch (x) {
      setErr(String(x));
      setBusy(false);
    }
  }

  const entOptions = (exclude: string) =>
    ordered.filter((e) => e.id !== exclude).map((e) => <option key={e.id} value={e.id}>{e.title}</option>);

  const concealCandidates = entities.filter((e) => e.type === "Character" && e.id !== a && e.id !== b);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="composer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
          <span className="label" style={{ margin: 0 }}>New state · this chapter · auto</span>
          <span className="spacer" />
          <span style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose}>✕</span>
        </div>

        {/* the sentence */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <select value={a} onChange={(e) => setA(e.target.value)} className="sel">{entOptions(b)}</select>
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              value={chosenType ? chosenType.label : typeQuery}
              onChange={(e) => { setTypeQuery(e.target.value); setTypeId(null); }}
              placeholder="did what…"
              style={{ width: 150, borderColor: chosenType ? VALENCE_COLOR[chosenType.valence] : undefined }}
            />
            {q.length > 0 && !typeId && (
              <div className="typeahead">
                {matches.map((t) => (
                  <div key={t.id} className="ta-row" onClick={() => { setTypeId(t.id); setTypeQuery(""); }}>
                    <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />{t.label}
                  </div>
                ))}
                {canMint && (
                  <div className="ta-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                    <span className="muted">mint “{typeQuery.trim()}” as a new type — pick a family:</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      {VALENCES.map((v) => (
                        <span key={v} title={v} onClick={() => setMintValence(v)}
                          style={{ width: 16, height: 16, borderRadius: "50%", background: VALENCE_COLOR[v], cursor: "pointer",
                            outline: mintValence === v ? "2px solid var(--ink)" : "none", outlineOffset: 1 }} />
                      ))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <select value={b} onChange={(e) => setB(e.target.value)} className="sel">{entOptions(a)}</select>
        </div>

        {/* knowledge: everyone by default, exceptions opt-in */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span className="muted">known by everyone + the reader</span>
          {concealCandidates.map((e) => (
            <span key={e.id}
              className={"chip" + (concealed.includes(e.id) ? " on" : "")}
              onClick={() => setConcealed((c) => c.includes(e.id) ? c.filter((x) => x !== e.id) : [...c, e.id])}>
              {concealed.includes(e.id) ? "" : "…except "}{e.title.split(" ")[0]}
            </span>
          ))}
        </div>

        <p className="note" style={{ borderLeft: "2px solid var(--line)", paddingLeft: 10, margin: "0 0 12px" }}>
          "{note.length > 160 ? note.slice(0, 160) + "…" : note}"
        </p>

        {err && <p className="err">{err}</p>}
        <div className="row" style={{ borderBottom: "none", padding: 0, gap: 10 }}>
          <button className="primary" onClick={commit} disabled={busy}>
            {busy ? "…" : "Append state"}
          </button>
          <span className="muted">appends a row — history is never overwritten</span>
        </div>
      </div>
    </div>
  );
}
