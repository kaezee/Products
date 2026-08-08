import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getStream, getEntities, getEntityTypes, getRelationshipTypes, getChapters, getNotes, getWorldComments, getWorld } from "../lib/api";
import type { StreamRow, Entity, EntityType, RelationshipType, Chapter, Note, Comment } from "../lib/types";
import { buildTypeSwatches } from "../lib/entityTypes";
import { Mention } from "../components/Mention";
import { detectMentions } from "../lib/mentions";
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
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [worldName, setWorldName] = useState("");
  // §3 demonstration checklist: retires permanently at 4/4 and never returns.
  const [ckRetired] = useState(() => localStorage.getItem(`k.checklist.${worldId}`) === "1");

  // §4.1 time away, measured writer-side (there is no per-chapter timestamp): the
  // gap since this world was last opened in THIS browser. Read the prior mark
  // before the effect overwrites it, so a returning writer sees the recap once.
  const [awayMs] = useState(() => {
    const prev = Number(localStorage.getItem(`k.seen.${worldId}`) || 0);
    return prev ? Date.now() - prev : 0;
  });
  useEffect(() => { localStorage.setItem(`k.seen.${worldId}`, String(Date.now())); }, [worldId]);

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId), getChapters(worldId), getNotes(worldId), getWorldComments(worldId), getWorld(worldId), getEntityTypes(worldId)])
      .then(([s, e, t, c, n, cm, w, et]) => { if (!alive) return; setStream(s); setEntities(e); setTypes(t); setChapters(c); setNotes(n); setComments(cm); setWorldName(w.name); setEntityTypes(et); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  // §7 mention channel: resolve an entity id → its swatch, so a name can render
  // with a coloured underline + wash. whoM renders a state's participants as
  // mentions joined by " · ".
  const entById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const typeSwatch = useMemo(
    () => buildTypeSwatches(entityTypes.map((t) => ({ name: t.name, swatch: t.swatch })), entities.map((e) => e.type)),
    [entityTypes, entities],
  );
  const swatchOf = (id?: string) => { const e = id ? entById.get(id) : undefined; return e ? typeSwatch.get(e.type.toLowerCase()) : undefined; };
  const whoM = (s: StreamRow): ReactNode =>
    s.participants.map((p, i) => <span key={p.entity_id + i}>{i > 0 ? " · " : ""}<Mention name={p.title} swatch={swatchOf(p.entity_id)} /></span>);
  const refsM = (refs: { id: string; title: string }[], sep = ", "): ReactNode =>
    refs.map((r, i) => <span key={r.id + i}>{i > 0 ? sep : ""}<Mention name={r.title} swatch={swatchOf(r.id)} /></span>);

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

  // §3.1 derived from mention detection: who's on the page lately, and who has
  // slipped out of the story. Scans each written chapter's prose for known names.
  const mentions = useMemo(() => {
    const written = chapters.filter((c) => !c.planned && (c.body || "").trim())
      .sort((a, b) => a.manuscript_order - b.manuscript_order);
    const perCh = new Map<string, Set<string>>();
    const lastSeen = new Map<string, number>();
    for (const c of written) {
      const ids = new Set(detectMentions(c.body, entities).map((e) => e.id));
      perCh.set(c.id, ids);
      ids.forEach((id) => lastSeen.set(id, Math.max(lastSeen.get(id) ?? 0, c.manuscript_order)));
    }
    const maxOrder = written.length ? written[written.length - 1].manuscript_order : 0;
    const inPlayIds = new Set<string>();
    written.slice(-2).forEach((c) => perCh.get(c.id)?.forEach((id) => inPlayIds.add(id)));
    const whoInPlay = entities.filter((e) => inPlayIds.has(e.id)).slice(0, 5);
    const GAP = 3; // chapters absent before it's worth noting
    const absent = entities
      .filter((e) => lastSeen.has(e.id) && maxOrder - lastSeen.get(e.id)! >= GAP)
      .map((e) => ({ e, since: lastSeen.get(e.id)! }))
      .sort((a, b) => a.since - b.since);
    return { whoInPlay, absent };
  }, [chapters, entities]);

  // §4.4 "What's true right now" — the latest truth state of each live thread.
  const truths = useMemo(() => {
    const m = new Map<string, StreamRow>();
    for (const s of stream ?? []) {
      if (isBelief(s) || s.is_correction) continue;
      const cur = m.get(s.relationship_id);
      if (!cur || (s.manuscript_order ?? -1) > (cur.manuscript_order ?? -1)) m.set(s.relationship_id, s);
    }
    return [...m.values()]
      .filter((s) => !typesById.get(s.type_id)?.is_ambient)
      .sort((a, b) => (b.manuscript_order ?? 0) - (a.manuscript_order ?? 0))
      .slice(0, 4);
  }, [stream, typesById]);

  // §3 checklist progress — each step checks off from real data, no locks.
  const ckDone = useMemo(() => [
    chapters.some((c) => !c.planned && (c.body || "").trim().length > 0), // wrote a chapter
    entities.length > 0,                                                  // added someone/thing
    (stream?.length ?? 0) > 0,                                            // recorded a moment
    chapters.some((c) => c.time_year != null || c.day_num_start != null), // dated a chapter
  ], [chapters, entities, stream]);
  const ckCount = ckDone.filter(Boolean).length;
  useEffect(() => { if (ckCount === 4) localStorage.setItem(`k.checklist.${worldId}`, "1"); }, [ckCount, worldId]);

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

  // Worth a look (§9 rulings): honest duplicate questions, dramatic irony, and
  // dormant threads. Reopened moves to Recently; lost anchors become one quiet
  // aggregate line; unconnected entities are not flagged pre-composer at all.
  const dupList = duplicates.filter((d) => !dupKept.has(d.key));
  const typeWord = (e: Entity, n: number) => { const t = (e.type || "thing").toLowerCase(); return n === 1 ? t : `${t}s`; };
  const lookItems = dupList.length + ironies.length + dormant.length + mentions.absent.length;
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


  // A brand-new world has nothing to orient, continue, or flag — so the stats,
  // the launchpad, and the activity columns are all empty shells. Until there's
  // something in the world, the Overview shows only the way in: the Docs
  // migration door and the getting-started checklist. The dashboard proper
  // appears the moment the writer has a chapter, a cast member, or a moment.
  const hasContent = stats.total > 0 || stats.entities > 0 || stats.relCount > 0;

  // §4.1 thresholds (one place, made to be tuned): how long away flips Overview
  // from a resume line, to an orientation sentence, to a full recap.
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const away = awayMs > 3 * WEEK ? "recap" : awayMs > WEEK ? "orient" : "here";

  // A chapter's gist: its first sentence(s), cut at a boundary — never mid-line.
  const summaryOf = (ch: Chapter | null) => {
    const body = (ch?.body || "").trim();
    if (!body) return "";
    const head = body.split("\n").slice(0, 3).join(" ").trim();
    const m = head.match(/^[\s\S]*?[.!?]["']?(?=\s|$)/);
    return (m ? m[0] : head).slice(0, 240).trim();
  };
  const planned = chapters.filter((c) => c.planned).length;

  // §3 checklist steps — after-states speak in the chronicle voice from real data;
  // step 3 is the payoff, the engine saying a sentence built from the writer's prose.
  const ckFirstCh = [...chapters].filter((c) => !c.planned && (c.body || "").trim()).sort((a, b) => a.manuscript_order - b.manuscript_order)[0];
  const ckEnt = entities[0];
  const ckMoment = recent[0];
  const ckDated = chapters.find((c) => c.time_year != null || c.day_num_start != null);
  const ckDateLabel = ckDated?.story_time_label || (ckDated?.time_year != null ? String(ckDated.time_year) : "your timeline");
  const ckSteps: { done: boolean; title: string; body: ReactNode; nav: Nav }[] = [
    { done: ckDone[0], title: "Write your first chapter", nav: { scope: "manuscript" },
      body: ckDone[0] && ckFirstCh ? `Chapter ${ckFirstCh.manuscript_order} · ${fmt(wordsOf(ckFirstCh.body))} words. Names you add light up in this prose.` : "Even a title is enough." },
    { done: ckDone[1], title: "Add someone, somewhere, or something", nav: { scope: "library" },
      body: ckDone[1] && ckEnt ? `${ckEnt.title} now lights up wherever you write the name. Hover to peek.` : "A character, a place, a faction — anyone in your story." },
    { done: ckDone[2], title: "Record what changes", nav: { scope: "manuscript" },
      body: ckDone[2] && ckMoment
        ? <>Kronicler can now say: {whoM(ckMoment)} <span style={{ color: VALENCE_COLOR[ckMoment.valence], fontWeight: 600 }}>{ckMoment.type_label}</span>{ckMoment.manuscript_order != null ? ` — ch. ${ckMoment.manuscript_order}` : ""}</>
        : "Select a line where something shifts between two people." },
    { done: ckDone[3], title: "Give a chapter a date", nav: { scope: "timeline" },
      body: ckDone[3] && ckDated ? `Chapter ${ckDated.manuscript_order} sits on your timeline at ${ckDateLabel}.` : "Give a chapter a date and it lands on your timeline." },
  ];

  // ── §4.4 Returning after a long absence: the recap owns the screen ──────────
  if (hasContent && away === "recap") {
    const note = recentNotes[0];
    return (
      <div className="fi recap">
        <h2 className="scope-title">{worldName || "Your project"}</h2>

        {continueCh && (
          <section className="recap-sec">
            <div className="recap-lab">Where you stopped</div>
            <div className="recap-lead">Chapter {continueCh.manuscript_order} · {continueCh.title}</div>
            {summaryOf(continueCh) && <p className="recap-body">{summaryOf(continueCh)}</p>}
          </section>
        )}

        {note && (
          <section className="recap-sec">
            <div className="recap-lab">You left yourself this</div>
            <p className="recap-body">{note.body.trim().slice(0, 200) || "(an empty note)"}</p>
          </section>
        )}

        {mentions.whoInPlay.length > 0 && (
          <section className="recap-sec">
            <div className="recap-lab">Who's in play</div>
            <p className="recap-body">
              {mentions.whoInPlay.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && " · "}
                  <button className="linklike" onClick={() => go({ scope: "library", entityId: e.id })}>{e.title}</button>
                </span>
              ))}
            </p>
          </section>
        )}

        {truths.length > 0 && (
          <section className="recap-sec">
            <div className="recap-lab">What's true right now</div>
            <ul className="recap-list">
              {truths.map((s) => (
                <li key={s.state_id}>{whoM(s)} <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 600 }}>{s.type_label}</span>.</li>
              ))}
            </ul>
          </section>
        )}

        <div className="recap-actions">
          {continueCh && <button className="primary" onClick={() => go({ scope: "manuscript", chapterId: continueCh.id })}>Re-read where you stopped</button>}
          <button className="ghost" onClick={() => go({ scope: "manuscript", chapterId: continueCh?.id })}>Keep writing</button>
        </div>

        {(dupList.length > 0 || dormant.length > 0 || ironies.length > 0) && (
          <p className="recap-backlog muted">Some things to look at when you're ready.</p>
        )}
      </div>
    );
  }

  // ── §4.2 New project — nothing written: the only job is to get into prose ───
  if (!hasContent) {
    return (
      <div className="fi">
        <h2 className="scope-title">Overview</h2>
        <p className="scope-sub">Nothing here yet — start below.</p>

        <div className="np-start">
          <div className="np-head">Write your first chapter</div>
          <div className="np-desc">Even a title is enough. Known names light up as you write, and this page fills itself in.</div>
          <div className="np-actions">
            <button className="primary" onClick={() => go({ scope: "manuscript" })}>Start writing</button>
            <button className="ghost" onClick={() => go({ scope: "manuscript", openImport: true })}>Bring in a manuscript</button>
          </div>
        </div>

        <ul className="np-seq">
          <li>Add someone, somewhere, or something</li>
          <li>Select a line and record what changes</li>
          <li>Give a chapter a date</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="fi">
      <h2 className="scope-title">Overview</h2>
      <p className="scope-sub">{shape}</p>

      {/* §4.1 one orientation sentence after 1–3 weeks away */}
      {away === "orient" && continueCh && (
        <p className="dash-orient">You were last in <b>{continueCh.title}</b>{mentions.whoInPlay.length ? <> — {mentions.whoInPlay.slice(0, 3).map((e) => e.title).join(", ")} were in play.</> : "."}</p>
      )}

      {/* §3 demonstration checklist — each done step reports what it bought, in
          real data. No locks. Retires at 4/4 and never returns. */}
      {!ckRetired && (
        <div className="checklist">
          <div className="checklist-head">
            <span className="checklist-title">Getting started</span>
            <span className="checklist-count">{ckCount} of 4</span>
          </div>
          {ckSteps.map((s, i) => (
            <div className={"checklist-step" + (s.done ? " done" : "")} key={i} onClick={() => !s.done && go(s.nav)}>
              <span className="checklist-mark">{s.done ? <Icon name="done" size={16} /> : <span className="checklist-circle" />}</span>
              <span style={{ minWidth: 0 }}>
                <span className="checklist-label">{s.title}</span>
                <span className="checklist-desc">{s.body}</span>
              </span>
              {!s.done && <><span className="spacer" style={{ flex: 1 }} /><Icon name="arrow" size={14} style={{ color: "var(--faint)", flex: "0 0 auto" }} /></>}
            </div>
          ))}
        </div>
      )}

      {<>
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
      {(lookItems > 0 || planned > 0 || orphaned.length > 0) && (
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginTop: 0 }}>Worth a look</div>
          <div className="card">
            {dupList.map((d) => nextLook() && (
              <div className="row" key={"dup" + d.key}>
                <span style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
                  {d.reason === "same-name"
                    ? <>{d.entities.length === 2 ? "Two" : d.entities.length} {typeWord(d.entities[0], d.entities.length)} are called <Mention name={d.entities[0].title} swatch={swatchOf(d.entities[0].id)} />. Same {typeWord(d.entities[0], 1)}, or {d.entities.length === 2 ? "two" : "separate"}?</>
                    : <><Mention name={d.entities[0].title} swatch={swatchOf(d.entities[0].id)} /> is a {typeWord(d.entities[0], 1)} of its own, and also an alias of <Mention name={d.entities[1].title} swatch={swatchOf(d.entities[1].id)} />. Same thing, or two?</>}
                </span>
                <button className="ghost" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => go({ scope: "library", entityId: d.entities[0].id })}>Merge</button>
                <button className="ghost" style={{ fontSize: 11.5, padding: "3px 8px" }} onClick={() => keepBoth(d.key)}>Keep both</button>
              </div>
            ))}
            {ironies.map((c) => nextLook() && (
              <div className="row click" key={"i" + c.relId} onClick={() => go({ scope: "relationships" })}>
                <span style={{ fontSize: 12.5 }}>
                  {refsM(c.believerRefs)} believe{c.believerRefs.length > 1 ? "" : "s"} it's <span style={{ color: "var(--obligation)", fontWeight: 600 }}>{c.belief}</span> — the reader knows it's <span style={{ color: "var(--hostile)", fontWeight: 600 }}>{c.truth}</span>.
                </span>
              </div>
            ))}
            {dormant.map((s) => nextLook() && (
              <div className="row click" key={"d" + s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span style={{ fontSize: 12.5 }}>{whoM(s)} · {s.type_label} — untouched for a while.</span>
              </div>
            ))}
            {mentions.absent.map(({ e, since }) => nextLook() && (
              <div className="row click" key={"ab" + e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
                <span style={{ fontSize: 12.5 }}><Mention name={e.title} swatch={swatchOf(e.id)} /> hasn't appeared since chapter {since}.</span>
              </div>
            ))}
            {lookItems > LOOK_CAP && (
              <div className="row"><span className="muted" style={{ fontSize: 12 }}>{lookItems - LOOK_CAP} more</span></div>
            )}
            {/* §3.1 derived: a single quiet line, never a per-chapter nag */}
            {planned > 0 && (
              <div className="row click" onClick={() => go({ scope: "manuscript" })}>
                <span className="muted" style={{ fontSize: 12 }}>{planned} chapter{planned === 1 ? " is" : "s are"} planned but unwritten.</span>
              </div>
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
                {refsM(c.whoRefs, " · ")} are <span style={{ color: "var(--hostile)", fontWeight: 600 }}>{c.laterLabel}</span> again — they were {c.termLabel} in ch. {c.termCh}.
              </span>
            </div>
          ))}
          {recent.map((s) => (
            <div className="row click" key={s.state_id} onClick={() => go({ scope: "relationships" })}>
              <span className="dot" style={{ background: VALENCE_COLOR[s.valence] }} />
              <span style={{ fontWeight: 500 }}>
                {whoM(s)} <span style={{ color: VALENCE_COLOR[s.valence], fontWeight: 600 }}>{s.type_label}</span>
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
