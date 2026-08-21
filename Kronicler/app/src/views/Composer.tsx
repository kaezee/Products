import { useMemo, useRef, useState } from "react";
import { appendPairwiseState, appendSelfState, createRelationshipType, setStateKnownBy, setStateAnchor } from "../lib/api";
import type { Anchor } from "../lib/anchor";
import type { Entity, RelationshipType, Valence } from "../lib/types";
import { VALENCE_COLOR, VALENCE_LABEL } from "../lib/valence";
import { familyOf } from "../lib/entityTypes";
import { Icon } from "../components/icons";
import { shortName } from "../lib/names";

// Relational standings (mint), in felt-spectrum order; inner charge is a
// three-stop reading of the same colours (a rising / flat / sinking feeling).
const VALENCES: Valence[] = ["bond", "obligation", "neutral", "hostile"];
const CHARGES: { label: string; valence: Valence }[] = [
  { label: "Lifts", valence: "bond" },
  { label: "Steady", valence: "neutral" },
  { label: "Weighs", valence: "hostile" },
];

// A single-select entity picker: a chip once chosen, a type-to-search over the
// whole world otherwise. Same treatment as the entity-page composer.
function EntityPick({ entities, valueId, onPick, placeholder, autoFocus }: {
  entities: Entity[];
  valueId: string;
  onPick: (id: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const chosen = valueId ? entities.find((e) => e.id === valueId) ?? null : null;
  const ql = q.trim().toLowerCase();
  const matches = useMemo(
    () => (ql ? entities.filter((e) => (e.title + " " + e.aliases.join(" ")).toLowerCase().includes(ql)).slice(0, 8) : []),
    [entities, ql],
  );
  return (
    <div className="rel-search">
      {chosen ? (
        <span className="chip on" style={{ cursor: "pointer" }} onClick={() => onPick("")}>
          {chosen.title} <Icon name="close" size={12} />
        </span>
      ) : (
        <>
          <input className="rel-search-input" value={q} autoFocus={autoFocus} placeholder={placeholder}
            style={{ width: "100%" }} onChange={(e) => setQ(e.target.value)} />
          {ql && (
            <div className="typeahead rel-drop">
              {matches.map((e) => (
                <div key={e.id} className="ta-row" onClick={() => { onPick(e.id); setQ(""); }}>
                  <span className="title-serif" style={{ flex: 1, fontSize: 14 }}>{e.title}</span>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{e.type}</span>
                </div>
              ))}
              {matches.length === 0 && <div className="ta-row"><span className="muted">no match</span></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Record a moment (§8): a moment is a change recorded in the prose. It can be
// BETWEEN two things (person↔person, or a person → a place/object), or INSIDE
// one character (an inner beat). Sentence-shaped, drawing from the same vocab as
// the entity-page composer; the selected prose is the note and the anchor.
export function Composer(props: {
  worldId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  entities: Entity[];
  types: RelationshipType[];
  castIds: string[];
  note: string;
  anchor: Anchor | null;
  onClose: () => void;
  onAppended: () => void;
  onTypesChanged: () => void;
}) {
  const { worldId, chapterId, chapterOrder, chapterTitle, entities, types, castIds, note, anchor, onClose, onAppended, onTypesChanged } = props;

  const ordered = useMemo(() => {
    const inCast = entities.filter((e) => castIds.includes(e.id));
    const rest = entities.filter((e) => !castIds.includes(e.id));
    return [...inCast, ...rest];
  }, [entities, castIds]);

  const [mode, setMode] = useState<"between" | "inside">("between");
  const [subject, setSubject] = useState(ordered[0]?.id ?? "");
  const [object, setObject] = useState(ordered[1]?.id ?? "");
  const [kindQuery, setKindQuery] = useState("");
  const [kindId, setKindId] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintCharge, setMintCharge] = useState<Valence | null>(null);
  const [showKnow, setShowKnow] = useState(false);
  const [intent, setIntent] = useState<"truth" | "belief">("truth");
  const [concealed, setConcealed] = useState<string[]>([]);
  const [believers, setBelievers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const kindRef = useRef<HTMLInputElement>(null);

  const inside = mode === "inside";
  const q = kindQuery.trim().toLowerCase();
  const kindMatches = useMemo(
    () => (q ? types.filter((t) => !!t.is_inner === inside && t.label.toLowerCase().includes(q)).slice(0, 6) : []),
    [types, q, inside],
  );
  const kindExact = types.find((t) => !!t.is_inner === inside && t.label.toLowerCase() === q);
  const chosenKind = kindId ? types.find((t) => t.id === kindId) ?? null : kindExact ?? null;
  const canMint = !chosenKind && q.length > 0;

  const subjEnt = subject ? entities.find((e) => e.id === subject) ?? null : null;
  const objEnt = object ? entities.find((e) => e.id === object) ?? null : null;
  const towardThing = !inside && !!objEnt && ["place", "object", "moment"].includes(familyOf(objEnt.type));
  const subjName = subjEnt ? shortName(subjEnt.title) : "they";

  const mintReady = !minting || (q.length > 0 && mintCharge != null);
  const canRecord =
    !!subject &&
    (inside || (!!object && object !== subject)) &&
    (chosenKind != null || canMint) &&
    mintReady &&
    !(showKnow && intent === "belief" && believers.length === 0);

  async function commit() {
    if (!canRecord) { setErr(inside ? "Pick who and what they feel." : "Pick two, and what happens."); return; }
    setBusy(true); setErr(null);
    try {
      let tid = chosenKind?.id ?? null;
      if (!tid && canMint) {
        const t = await createRelationshipType(worldId, kindQuery.trim(), mintCharge ?? "neutral", false, inside);
        tid = t.id; onTypesChanged();
      }
      if (!tid) { setErr("Choose or name a kind."); setBusy(false); return; }

      const useBelief = showKnow && intent === "belief";
      let stateId: string;
      if (inside) {
        stateId = await appendSelfState({ worldId, entityId: subject, typeId: tid, manuscriptRef: chapterId, note });
        if (useBelief) await setStateKnownBy(stateId, { believed_by: believers });
        else if (showKnow && concealed.length > 0) await setStateKnownBy(stateId, { concealed_from: concealed });
      } else {
        stateId = await appendPairwiseState({
          worldId, entityA: subject, entityB: object, typeId: tid, manuscriptRef: chapterId, note,
          concealedFrom: showKnow && !useBelief ? concealed : [],
        });
        if (useBelief) await setStateKnownBy(stateId, { believed_by: believers });
      }
      // anchor to the marked prose — best-effort; a failed anchor never blocks it.
      if (anchor) { try { await setStateAnchor(stateId, anchor); } catch { /* still a valid moment */ } }

      onAppended();
      setAdded((n) => n + 1);
      // rapid entry: keep who/mode, clear the beat itself for the next one
      setKindQuery(""); setKindId(null); setMinting(false); setMintCharge(null);
      setConcealed([]); setBelievers([]); setBusy(false);
      kindRef.current?.focus();
    } catch (x) { setErr(String(x)); setBusy(false); }
  }

  const knowSummary = intent === "belief"
    ? (believers.length ? `a belief of ${believers.length}` : "a belief")
    : (concealed.length ? `hidden from ${concealed.length}` : "everyone + the reader");
  const concealCandidates = entities.filter((e) => e.type === "Character" && e.id !== subject && e.id !== object);
  const characters = entities.filter((e) => e.type === "Character");

  const kindChip = chosenKind || (minting && q);
  const chargeSet = inside ? CHARGES : VALENCES.map((v) => ({ label: VALENCE_LABEL[v], valence: v }));
  const mintQuestion = inside
    ? `How does it sit in ${subjName}?`
    : towardThing ? `How does ${subjName} feel about it?` : "How do they stand?";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="composer" style={{ width: "32rem" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 2 }}>
          <span className="label" style={{ margin: 0 }}>Record a moment</span>
          <span className="spacer" />
          <span style={{ cursor: "pointer", color: "var(--muted)" }} onClick={onClose}><Icon name="close" size={15} /></span>
        </div>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
          Filed under <span style={{ color: "var(--ink)", fontWeight: 600 }}><Icon name="book" size={12} /> ch. {String(chapterOrder).padStart(2, "0")} · {chapterTitle}</span>
        </p>

        {/* mode: between two (or toward a thing) vs inside one character */}
        <span className="seg sm" style={{ marginBottom: 16 }}>
          <span className={!inside ? "on" : ""} onClick={() => setMode("between")}>↔ Between · toward</span>
          <span className={inside ? "on" : ""} onClick={() => { setMode("inside"); setKindId(null); setKindQuery(""); setMinting(false); }}>◐ Inside one character</span>
        </span>

        {/* who · feels·does */}
        <div className="rel-comp-fields">
          <div className="rel-field2" style={{ flex: 1 }}>
            <span className="rel-lab">Who</span>
            <EntityPick entities={ordered} valueId={subject} onPick={setSubject} placeholder="who…" />
          </div>
          <div className="rel-field2" style={{ flex: 1 }}>
            <span className="rel-lab">{inside ? "Feels" : "Feels · does"}</span>
            <div className="rel-search">
              {kindChip ? (
                <span className="chip on" style={{ cursor: "pointer" }}
                  onClick={() => { setKindId(null); setMinting(false); setKindQuery(""); setMintCharge(null); setTimeout(() => kindRef.current?.focus(), 0); }}>
                  {chosenKind && <span className="dot" style={{ background: VALENCE_COLOR[chosenKind.valence] }} />}
                  {chosenKind?.label ?? kindQuery.trim()} <Icon name="close" size={12} />
                </span>
              ) : (
                <>
                  <input ref={kindRef} autoFocus className="rel-search-input" value={kindQuery} style={{ width: "100%" }}
                    placeholder={inside ? "a feeling — hopeful, hollow…" : "did what… e.g. betrayed"}
                    onChange={(e) => { setKindQuery(e.target.value); setKindId(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && canRecord) commit(); if (e.key === "Escape") onClose(); }} />
                  {q.length > 0 && (
                    <div className="typeahead rel-drop">
                      {kindMatches.map((t) => (
                        <div key={t.id} className="ta-row" onClick={() => { setKindId(t.id); setKindQuery(t.label); }}>
                          <span className="dot" style={{ background: VALENCE_COLOR[t.valence] }} />
                          <span style={{ flex: 1 }}>{t.label}</span>
                        </div>
                      ))}
                      {canMint && (
                        <div className="ta-row" onClick={() => { setMinting(true); setKindId(null); }}>
                          <span style={{ color: "var(--k-action-text, var(--bond))" }}>＋ {inside ? "new feeling" : "new kind"} “{kindQuery.trim()}”</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* toward · with (between mode only) */}
        {!inside && (
          <div className="rel-field2" style={{ marginTop: 14 }}>
            <span className="rel-lab">Toward · with</span>
            <EntityPick entities={ordered.filter((e) => e.id !== subject)} valueId={object} onPick={setObject}
              placeholder="search your world — anyone, anywhere, anything…" />
          </div>
        )}

        {/* mint well — set the new kind's charge/standing once */}
        {minting && q.length > 0 && (
          <div className="rel-well" style={{ marginTop: 14 }}>
            <div className="rel-q">
              <span className="rel-lab">{mintQuestion}</span>
              <span className="seg rel-standing">
                {chargeSet.map((c) => (
                  <span key={c.valence} className={mintCharge === c.valence ? "on" : ""} onClick={() => setMintCharge(c.valence)}>
                    <span className="rel-standing-dot" style={{ background: VALENCE_COLOR[c.valence] }} />{c.label}
                  </span>
                ))}
              </span>
            </div>
            <div className="faint" style={{ fontSize: 11 }}>
              {inside ? "Lifts is a rising feeling, weighs a sinking one — it colours the arc."
                : "Sets the colour, and reads across every future use of this word."}
            </div>
          </div>
        )}

        {/* the trigger line */}
        {note.trim() && (
          <blockquote className="mom-quote" style={{ borderLeftColor: chosenKind ? VALENCE_COLOR[chosenKind.valence] : "var(--line)", margin: "14px 0 0" }}>
            {note.length > 200 ? note.slice(0, 200) + "…" : note}
          </blockquote>
        )}

        {/* who knows this — collapsed by default (the common case is plain truth) */}
        <div className="cmp-know">
          <button type="button" className="cmp-know-toggle" onClick={() => setShowKnow((s) => !s)}>
            <Icon name={showKnow ? "chevron-down" : "chevron"} size={13} />
            <span>Who knows this?</span>
            <span className="muted">{knowSummary}</span>
          </button>
          {showKnow && (
            <div className="cmp-know-body">
              <span className="seg sm">
                <span className={intent === "truth" ? "on" : ""} onClick={() => setIntent("truth")}>The truth</span>
                <span className={intent === "belief" ? "on" : ""} onClick={() => setIntent("belief")}>A belief</span>
              </span>
              {intent === "truth" ? (
                <div className="cmp-know-chips">
                  <span className="muted" style={{ fontSize: 12 }}>known by everyone — except</span>
                  {concealCandidates.map((e) => (
                    <span key={e.id} className={"chip" + (concealed.includes(e.id) ? " on" : "")}
                      onClick={() => setConcealed((c) => c.includes(e.id) ? c.filter((x) => x !== e.id) : [...c, e.id])}>
                      {shortName(e.title)}
                    </span>
                  ))}
                  {concealCandidates.length === 0 && <span className="faint" style={{ fontSize: 11 }}>no one to hide it from yet</span>}
                </div>
              ) : (
                <div className="cmp-know-chips">
                  <span className="muted" style={{ fontSize: 12 }}>believed by</span>
                  {characters.map((e) => (
                    <span key={e.id} className={"chip" + (believers.includes(e.id) ? " on" : "")}
                      onClick={() => setBelievers((c) => c.includes(e.id) ? c.filter((x) => x !== e.id) : [...c, e.id])}>
                      {shortName(e.title)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
        <div className="rel-actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={commit} disabled={busy || !canRecord}>{busy ? "…" : "Record moment"}</button>
          <button onClick={onClose}>Done{added > 0 ? ` (${added})` : ""}</button>
          <span className="spacer" style={{ flex: 1 }} />
          <span className="faint" style={{ fontSize: 11 }}>
            {added > 0 ? `✓ ${added} recorded  ·  ` : ""}Enter to record · nothing is overwritten
          </span>
        </div>
      </div>
    </div>
  );
}
