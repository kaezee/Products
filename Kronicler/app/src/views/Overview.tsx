import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes, getChapters, getNotes, getWorldComments } from "../lib/api";
import type { StreamRow, Entity, RelationshipType, Chapter, Note, Comment } from "../lib/types";
import { isBelief } from "../lib/knowledge";
import { findIssues } from "../lib/continuity";
import { findDuplicates } from "../lib/dedupe";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";
import { Icon, type IconName } from "../components/icons";
import { Skeleton } from "../components/Skeleton";

const DORMANT_GAP = 5;

const wordsOf = (body: string) => (body || "").replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
const fmt = (n: number) => n.toLocaleString();

// Overview — the world's home. Orients (a row of at-a-glance stats), launches
// (pick up where you left off), and flags what needs attention. Owns nothing,
// links everywhere.
export function Overview({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [stream, setStream] = useState<StreamRow[] | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [checklistOff, setChecklistOff] = useState(() => localStorage.getItem(`k.checklist.${worldId}`) === "1");

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId), getChapters(worldId), getNotes(worldId), getWorldComments(worldId)])
      .then(([s, e, t, c, n, cm]) => { if (!alive) return; setStream(s); setEntities(e); setTypes(t); setChapters(c); setNotes(n); setComments(cm); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const recent = useMemo(
    () => [...(stream ?? [])].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 6),
    [stream],
  );

  const dormant = useMemo(() => {
    if (!stream) return [];
    const now = stream.reduce((m, s) => Math.max(m, s.manuscript_order ?? 0), 0);
    const latest = new Map<string, StreamRow>();
    for (const s of stream) {
      if (isBelief(s)) continue; // truth only — beliefs aren't real threads
      const cur = latest.get(s.relationship_id);
      if (!cur || (s.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) latest.set(s.relationship_id, s);
    }
    return [...latest.values()].filter((s) => {
      const t = typesById.get(s.type_id);
      if (t?.is_ambient || t?.is_terminal) return false;
      return s.manuscript_order != null && now - s.manuscript_order >= DORMANT_GAP;
    });
  }, [stream, typesById]);

  // Continuity checks (lib/continuity, node-tested): reopened threads, states
  // concealed from someone who's in them, and beliefs that clash with the truth.
  const issues = useMemo(() => {
    if (!stream) return [];
    const nameOf = (id: string) => entities.find((e) => e.id === id)?.title ?? "someone";
    return findIssues(stream, types, nameOf);
  }, [stream, types, entities]);
  const contradictions = useMemo(() => issues.flatMap((i) => i.kind === "reopened" ? [i] : []), [issues]);
  const orphaned = useMemo(() => issues.flatMap((i) => i.kind === "orphaned-anchor" ? [i] : []), [issues]);
  const ironies = useMemo(() => issues.flatMap((i) => i.kind === "belief-clash" ? [i] : []), [issues]);
  const duplicates = useMemo(() => findDuplicates(entities), [entities]);

  // ── world shape (the at-a-glance stats) ──────────────────────────────────
  const stats = useMemo(() => {
    const byType = (t: string) => entities.filter((e) => e.type.toLowerCase() === t).length;
    const written = chapters.filter((c) => !c.planned).length;
    const words = chapters.reduce((n, c) => n + wordsOf(c.body), 0);
    const relCount = stream ? new Set(stream.map((s) => s.relationship_id)).size : 0;
    const dated = chapters.filter((c) => c.day_num_start != null).length;
    return { cast: byType("character"), places: byType("place"), entities: entities.length,
      written, total: chapters.length, planned: chapters.length - written, words, relCount, dated };
  }, [entities, chapters, stream]);

  // Pick up where you left off: the furthest-along written chapter.
  const continueCh = useMemo(() => {
    if (!chapters.length) return null;
    const byOrder = [...chapters].sort((a, b) => b.manuscript_order - a.manuscript_order);
    return byOrder.find((c) => !c.planned && (c.body || "").trim().length > 0) ?? byOrder.find((c) => !c.planned) ?? byOrder[0];
  }, [chapters]);

  // Writer's trail (§2): unresolved comments + recent notes, deep-linked.
  const openComments = useMemo(() => comments.filter((c) => !c.resolved), [comments]);
  const commentChapters = useMemo(() => new Set(openComments.map((c) => c.chapter_id)), [openComments]);
  const chById = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const recentNotes = useMemo(() => [...notes].reverse().slice(0, 4), [notes]);

  // "Keep both" on a duplicate question is permanent for that pair — the writer
  // with twin brothers named Holmes must never see it again (§9 ruling).
  const [dupKept, setDupKept] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(`k.dup.${worldId}`) || "[]")); } catch { return new Set<string>(); }
  });
  function keepBoth(key: string) {
    setDupKept((prev) => {
      const n = new Set(prev); n.add(key);
      localStorage.setItem(`k.dup.${worldId}`, JSON.stringify([...n]));
      return n;
    });
  }

  if (err) return <p className="err">{err}</p>;
  if (!stream) return <OverviewSkeleton />;

  const who = (s: StreamRow) => s.participants.map((p) => p.title).join(" · ");

  // Worth a look (§9 rulings): honest duplicate questions, dramatic irony, and
  // dormant threads. Reopened moves to Recently; lost anchors become one quiet
  // aggregate line; unconnected entities are not flagged pre-composer at all.
  const dupList = duplicates.filter((d) => !dupKept.has(d.key));
  const typeWord = (e: Entity, n: number) => { const t = (e.type || "thing").toLowerCase(); return n === 1 ? t : `${t}s`; };
  const lookItems = dupList.length + ironies.length + dormant.length;
  const LOOK_CAP = 3;
  let lookShown = 0;
  const nextLook = () => (lookShown < LOOK_CAP ? (lookShown++, true) : false);

  // shape sentence
  const shapeBits: string[] = [];
  if (stats.cast) shapeBits.push(`${stats.cast} character${stats.cast === 1 ? "" : "s"}`);
  if (stats.places) shapeBits.push(`${stats.places} place${stats.places === 1 ? "" : "s"}`);
  if (stats.written) shapeBits.push(`${stats.written} chapter${stats.written === 1 ? "" : "s"}`);
  if (stats.words) shapeBits.push(`${fmt(stats.words)} words`);
  const shape = shapeBits.length ? shapeBits.join(" · ") : "A new world — nothing in it yet. Start below.";

  // §5 cards: exactly four, each appearing only when it has something to report
  // (never a zero, never a denominator). A new project earns them one at a time.
  type Tile = { key: string; icon: IconName; label: string; value: string; sub?: string; nav: Nav };
  const worldCount = stats.cast + stats.places;
  const tiles: Tile[] = ([
    stats.words   && { key: "words", icon: "words", label: "Words", value: fmt(stats.words), nav: { scope: "manuscript" } },
    stats.written && { key: "chapters", icon: "manuscript", label: "Chapters", value: fmt(stats.written), sub: "written", nav: { scope: "manuscript" } },
    stream.length && { key: "moments", icon: "asterisk", label: "Moments", value: fmt(stream.length), sub: "recorded", nav: { scope: "relationships" } },
    worldCount    && { key: "world", icon: "cast", label: "Your world", value: fmt(worldCount), sub: "people and places", nav: { scope: "library" } },
  ] as (Tile | 0 | "")[]).filter(Boolean) as Tile[];

  // Getting-started checklist — the dashboard's "taking shape" state. Each step
  // checks off from real data; the card retires itself once all four are done.
  // Some steps have a prerequisite: you can't mark a moment or date a chapter
  // until prose exists to do it in. Those stay locked (dimmed, non-actionable)
  // with a hint, so the checklist never sends the writer somewhere that can't
  // yet do the thing it's asking for.
  const hasProse = chapters.some((c) => !c.planned && (c.body || "").trim().length > 0);
  const steps: { done: boolean; label: string; desc: string; nav: Nav; locked?: boolean; lockHint?: string }[] = [
    { done: stats.total > 0, label: "Write your first chapter", desc: "Just start typing — even a title is enough to begin.", nav: { scope: "manuscript" } },
    { done: stats.entities > 0, label: "Add someone, somewhere, or something", desc: "A character, a place, a faction — anyone in your story.", nav: { scope: "library" } },
    { done: stats.relCount > 0, label: "Mark a moment", desc: "In a chapter, select a line and record what happens between two characters.", nav: { scope: "manuscript" }, locked: !hasProse, lockHint: "Write a chapter first" },
    { done: stats.dated > 0, label: "Place it in time", desc: "Give a chapter a date and it lands on your timeline.", nav: { scope: "timeline" }, locked: stats.total === 0, lockHint: "Write a chapter first" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showChecklist = !checklistOff && doneCount < steps.length;
  function dismissChecklist() { localStorage.setItem(`k.checklist.${worldId}`, "1"); setChecklistOff(true); }

  // A brand-new world has nothing to orient, continue, or flag — so the stats,
  // the launchpad, and the activity columns are all empty shells. Until there's
  // something in the world, the Overview shows only the way in: the Docs
  // migration door and the getting-started checklist. The dashboard proper
  // appears the moment the writer has a chapter, a cast member, or a moment.
  const hasContent = stats.total > 0 || stats.entities > 0 || stats.relCount > 0;

  return (
    <div className="fi">
      <h2 className="scope-title">Overview</h2>
      <p className="scope-sub">{shape}</p>

      {stats.total === 0 && (
        <button className="migrate-cta" onClick={() => go({ scope: "manuscript", openImport: true })}>
          <span className="migrate-icon"><Icon name="feather" size={18} /></span>
          <span className="migrate-copy">
            <span className="migrate-title">Already writing in Google Docs or Word?</span>
            <span className="migrate-desc">Bring your manuscript over — upload a .docx or paste it in. We’ll split it into chapters and surface the characters we spot in the prose.</span>
          </span>
          <span className="migrate-action">Import <Icon name="arrow" size={15} /></span>
        </button>
      )}

      {showChecklist && (
        <div className="checklist">
          <div className="checklist-head">
            <span className="checklist-title">Getting started</span>
            <span className="checklist-count">{doneCount} of {steps.length}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="checklist-dismiss" title="Dismiss" onClick={dismissChecklist}><Icon name="close" size={14} /></span>
          </div>
          {steps.map((s, i) => {
            const locked = !s.done && !!s.locked;
            return (
              <div className={"checklist-step" + (s.done ? " done" : "") + (locked ? " locked" : "")} key={i}
                onClick={() => !s.done && !locked && go(s.nav)}>
                <span className="checklist-mark">{s.done ? <Icon name="done" size={16} /> : locked ? <Icon name="lock" size={13} /> : <span className="checklist-circle" />}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="checklist-label">{s.label}</span>
                  <span className="checklist-desc">{s.desc}</span>
                </span>
                <span className="spacer" style={{ flex: 1 }} />
                {locked && <span className="checklist-lock-hint">{s.lockHint}</span>}
                {!s.done && !locked && <Icon name="arrow" size={14} style={{ color: "var(--faint)", flex: "0 0 auto" }} />}
              </div>
            );
          })}
        </div>
      )}

      {hasContent && <>
      {/* World at a glance — cards appear only when earned (§5) */}
      {tiles.length > 0 && <div className="dash-stats">
        {tiles.map((t) => (
          <button key={t.key} className="stat" onClick={() => go(t.nav)}>
            <span className="stat-top"><Icon name={t.icon} size={13} /><span className="stat-lab">{t.label}</span></span>
            <span className="stat-num">{t.value}</span>
            {t.sub && <span className="stat-sub">{t.sub}</span>}
          </button>
        ))}
      </div>}

      {/* Continue writing / launchpad */}
      <div className="dash-continue">
        <span className="dash-continue-ic"><Icon name="write" size={20} /></span>
        {continueCh ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dash-continue-lab">Pick up where you left off</div>
              <div className="dash-continue-title">{continueCh.title}</div>
              <div className="dash-continue-sub">ch. {continueCh.manuscript_order} · {fmt(wordsOf(continueCh.body))} words</div>
            </div>
            <button className="primary" onClick={() => go({ scope: "manuscript", chapterId: continueCh.id })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Open chapter <Icon name="arrow" size={14} /></button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dash-continue-lab">Your manuscript is empty</div>
              <div className="dash-continue-title">Start chapter one</div>
              <div className="dash-continue-sub">Write, and known names light up as you type.</div>
            </div>
            <button className="primary" onClick={() => go({ scope: "manuscript" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Open Manuscript <Icon name="arrow" size={14} /></button>
          </>
        )}
      </div>

      {/* Writer's trail (§2): unresolved comments + recent notes, deep-linked. */}
      {(openComments.length > 0 || recentNotes.length > 0) && (
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginTop: 0 }}>What you left yourself</div>
          <div className="card">
            {openComments.length > 0 && (
              <div className="row click" onClick={() => go({ scope: "manuscript", chapterId: openComments[0].chapter_id })}>
                <span style={{ fontSize: 12.5 }}>
                  <b>{openComments.length}</b> unresolved comment{openComments.length === 1 ? "" : "s"} across {commentChapters.size} chapter{commentChapters.size === 1 ? "" : "s"}
                </span>
                <span className="spacer" />
                <Icon name="arrow" size={14} style={{ color: "var(--faint)" }} />
              </div>
            )}
            {recentNotes.map((n) => {
              const ch = (n.chapter_ids ?? []).map((id) => chById.get(id)).find(Boolean);
              const ent = !ch && (n.entity_ids ?? []).length ? entities.find((e) => e.id === n.entity_ids[0]) : null;
              const label = ch ? `Ch. ${ch.manuscript_order}` : ent ? ent.title : "World";
              const nav: Nav = ch ? { scope: "manuscript", chapterId: ch.id } : ent ? { scope: "library", entityId: ent.id } : { scope: "overview" };
              return (
                <div className="row click" key={n.id} onClick={() => go(nav)}>
                  <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body.trim().slice(0, 70) || <span className="muted">(empty note)</span>}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Worth a look (§4.3) — honest questions and observations, no chips, no count */}
      {lookItems > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginTop: 0 }}>Worth a look</div>
          <div className="card">
            {dupList.map((d) => nextLook() && (
              <div className="row" key={"dup" + d.key}>
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                  {d.reason === "same-name"
                    ? <>{d.entities.length === 2 ? "Two" : d.entities.length} {typeWord(d.entities[0], d.entities.length)} are called <b>{d.entities[0].title}</b>. Same {typeWord(d.entities[0], 1)}, or {d.entities.length === 2 ? "two" : "separate"}?</>
                    : <><b>{d.entities[0].title}</b> is a {typeWord(d.entities[0], 1)} of its own, and also an alias of <b>{d.entities[1].title}</b>. Same thing, or two?</>}
                </span>
                <button className="ghost" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => go({ scope: "library", entityId: d.entities[0].id })}>Merge</button>
                <button className="ghost" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => keepBoth(d.key)}>Keep both</button>
              </div>
            ))}
            {ironies.map((c) => nextLook() && (
              <div className="row click" key={"i" + c.relId} onClick={() => go({ scope: "relationships" })}>
                <span style={{ fontSize: 12.5 }}>
                  <b>{c.believers}</b> believe{c.believers.includes(",") ? "" : "s"} it's <span style={{ color: "var(--obligation)", fontWeight: 600 }}>{c.belief}</span> — the reader knows it's <span style={{ color: "var(--hostile)", fontWeight: 600 }}>{c.truth}</span>.
                </span>
              </div>
            ))}
            {dormant.map((s) => nextLook() && (
              <div className="row click" key={"d" + s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span style={{ fontSize: 12.5 }}><b>{who(s)}</b> · {s.type_label} — untouched for a while.</span>
              </div>
            ))}
            {lookItems > LOOK_CAP && (
              <div className="row"><span className="muted" style={{ fontSize: 12 }}>{lookItems - LOOK_CAP} more</span></div>
            )}
            {/* Lost anchors are a broken pointer, not a story observation — one quiet line (§9) */}
            {orphaned.length > 0 && (
              <div className="row"><span className="muted" style={{ fontSize: 12 }}>
                {orphaned.length} moment{orphaned.length === 1 ? "" : "s"} no longer point at any text — fix from the chapter's Continuity panel.
              </span></div>
            )}
          </div>
        </div>
      )}

      {/* Recently — moments in reverse order; reopened threads read as chronicle here (§9) */}
      <div style={{ marginBottom: 18 }}>
        <div className="label" style={{ marginTop: 0 }}>Recently</div>
        <div className="card">
          {recent.length === 0 && contradictions.length === 0 && <div className="row"><span className="muted">No moments yet — select a line in a chapter and record what changes.</span></div>}
          {contradictions.map((c) => (
            <div className="row click" key={"re" + c.relId} onClick={() => c.entityId && go({ scope: "library", entityId: c.entityId })}>
              <span className="dot" style={{ background: "var(--hostile)" }} />
              <span style={{ fontWeight: 500 }}>
                <b>{c.who}</b> are <span style={{ color: "var(--hostile)", fontWeight: 600 }}>{c.laterLabel}</span> again — they were {c.termLabel} in ch. {c.termCh}.
              </span>
            </div>
          ))}
          {recent.map((s) => (
            <div className="row click" key={s.state_id} onClick={() => go({ scope: "relationships" })}>
              <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
              <span style={{ fontWeight: 500 }}>
                {who(s)} <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 600 }}>{s.type_label}</span>
              </span>
              <span className="spacer" />
              <span className="muted">{s.manuscript_order != null ? `ch. ${s.manuscript_order}` : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      </>}
    </div>
  );
}

// Mirrors the real dashboard's shape so nothing jumps when data lands.
function OverviewSkeleton() {
  return (
    <div className="fi">
      <Skeleton w={150} h={26} r={7} style={{ marginBottom: 8 }} />
      <Skeleton w={320} h={13} style={{ marginBottom: 18 }} />
      <div className="dash-stats">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="stat" style={{ cursor: "default" }}>
            <Skeleton w={70} h={11} />
            <Skeleton w={54} h={24} r={7} style={{ margin: "2px 0" }} />
            <Skeleton w={84} h={11} />
          </div>
        ))}
      </div>
      <div className="dash-continue" style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <Skeleton w={40} h={40} r={11} style={{ flex: "0 0 auto" }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton w={120} h={11} />
          <Skeleton w={220} h={18} r={7} />
          <Skeleton w={140} h={12} />
        </div>
        <Skeleton w={120} h={34} r={8} style={{ flex: "0 0 auto" }} />
      </div>
      <div className="dash-cols">
        {Array.from({ length: 2 }).map((_, c) => (
          <div key={c}>
            <Skeleton w={130} h={11} style={{ margin: "0 0 8px" }} />
            <div className="card">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="row" key={i} style={{ borderBottom: i === 3 ? "none" : undefined }}>
                  <Skeleton w={9} h={9} r={9} style={{ flex: "0 0 auto" }} />
                  <Skeleton w={`${50 + ((i * 11) % 30)}%`} h={13} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
