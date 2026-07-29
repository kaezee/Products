import { useEffect, useMemo, useState } from "react";
import { getStream, getEntities, getRelationshipTypes, getChapters, softDeleteEntity } from "../lib/api";
import type { StreamRow, Entity, RelationshipType, Chapter } from "../lib/types";
import { isBelief } from "../lib/knowledge";
import { findIssues } from "../lib/continuity";
import { findDuplicates } from "../lib/dedupe";
import type { Nav } from "../App";
import { VALENCE_COLOR } from "../lib/valence";
import { Icon, type IconName } from "../components/icons";
import { confirmDialog } from "../components/confirm";
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
  const [err, setErr] = useState<string | null>(null);
  const [allOrphans, setAllOrphans] = useState(false);

  const ORPHAN_CAP = 8;

  useEffect(() => {
    let alive = true;
    Promise.all([getStream(worldId), getEntities(worldId), getRelationshipTypes(worldId), getChapters(worldId)])
      .then(([s, e, t, c]) => { if (!alive) return; setStream(s); setEntities(e); setTypes(t); setChapters(c); })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, [worldId]);

  const typesById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const recent = useMemo(
    () => [...(stream ?? [])].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 6),
    [stream],
  );

  const orphans = useMemo(() => {
    if (!stream) return [];
    const seen = new Set<string>();
    stream.forEach((s) => s.participants.forEach((p) => seen.add(p.entity_id)));
    return entities.filter((e) => !seen.has(e.id));
  }, [stream, entities]);

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

  async function delOrphan(e: Entity, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!(await confirmDialog({ title: "Delete entity", message: `Delete "${e.title}"? It's soft-deleted — recoverable, nothing is truly lost.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await softDeleteEntity(e.id);
      setEntities((prev) => prev.filter((x) => x.id !== e.id));
    } catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (!stream) return <OverviewSkeleton />;

  const who = (s: StreamRow) => s.participants.map((p) => p.title).join(" · ");
  const attentionCount = duplicates.length + contradictions.length + orphaned.length + dormant.length + orphans.length + ironies.length;

  // shape sentence
  const shapeBits: string[] = [];
  if (stats.cast) shapeBits.push(`${stats.cast} character${stats.cast === 1 ? "" : "s"}`);
  if (stats.places) shapeBits.push(`${stats.places} place${stats.places === 1 ? "" : "s"}`);
  if (stats.total) shapeBits.push(`${stats.written} of ${stats.total} chapters written`);
  if (stats.words) shapeBits.push(`${fmt(stats.words)} words`);
  const shape = shapeBits.length ? shapeBits.join(" · ") : "A new world — nothing in it yet. Start below.";

  const tiles: { key: string; icon: IconName; label: string; value: string; sub: string; nav: Nav }[] = [
    { key: "cast", icon: "cast", label: "Cast", value: fmt(stats.cast), sub: `${fmt(stats.entities)} entities`, nav: { scope: "library" } },
    { key: "places", icon: "place", label: "Places", value: fmt(stats.places), sub: "in the library", nav: { scope: "library" } },
    { key: "chapters", icon: "manuscript", label: "Chapters", value: fmt(stats.written), sub: stats.planned ? `+ ${stats.planned} planned` : `of ${stats.total}`, nav: { scope: "manuscript" } },
    { key: "words", icon: "words", label: "Words", value: fmt(stats.words), sub: "in the manuscript", nav: { scope: "manuscript" } },
    { key: "rel", icon: "relationships", label: "Relationships", value: fmt(stats.relCount), sub: `${fmt(stream.length)} states`, nav: { scope: "relationships" } },
    { key: "dated", icon: "timeline", label: "Dated", value: `${fmt(stats.dated)}/${fmt(stats.total)}`, sub: "on the timeline", nav: { scope: "timeline" } },
  ];

  return (
    <div className="fi">
      <h2 className="scope-title">Overview</h2>
      <p className="scope-sub">{shape}</p>

      {/* World at a glance */}
      <div className="dash-stats">
        {tiles.map((t) => (
          <button key={t.key} className="stat" onClick={() => go(t.nav)}>
            <span className="stat-top"><Icon name={t.icon} size={13} /><span className="stat-lab">{t.label}</span></span>
            <span className="stat-num">{t.value}</span>
            <span className="stat-sub">{t.sub}</span>
          </button>
        ))}
      </div>

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

      <div className="dash-cols">
        <div>
          <div className="label" style={{ marginTop: 0 }}>Recent activity</div>
          <div className="card">
            {recent.length === 0 && <div className="row"><span className="muted">No state changes yet — mark a moment in a chapter and it shows here.</span></div>}
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

        <div>
          <div className="label" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            Needs attention {attentionCount > 0 && <span className="dash-count">{attentionCount}</span>}
          </div>
          <div className="card">
            {attentionCount === 0 && (
              <div className="row"><span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="done" size={14} style={{ color: "var(--bond)" }} /> Nothing flagged — every thread is live and every entity connected.</span></div>
            )}
            {duplicates.map((d) => (
              <div className="row click" key={"dup" + d.key} onClick={() => go({ scope: "library", entityId: d.entities[0].id })}>
                <span className="chip warn">duplicate?</span>
                <span style={{ fontSize: 12.5 }}>
                  {d.reason === "same-name"
                    ? <><b>{d.entities.length}</b> entities named “{d.entities[0].title}” — likely the same thing, twice.</>
                    : <>“{d.entities[0].title}” is already an alias of <b>{d.entities[1].title}</b> — likely a duplicate.</>}
                </span>
              </div>
            ))}
            {contradictions.map((c) => (
              <div className="row click" key={"c" + c.relId} onClick={() => c.entityId && go({ scope: "library", entityId: c.entityId })}>
                <span className="chip" style={{ borderColor: "var(--hostile)", background: "var(--hostileBg)", color: "var(--hostile)" }}>reopened</span>
                <span style={{ fontSize: 12.5 }}>
                  <b>{c.who}</b> — “{c.termLabel}” (ended) in ch. {c.termCh}, but “{c.laterLabel}” in ch. {c.laterCh}
                </span>
              </div>
            ))}
            {orphaned.map((c) => (
              <div className="row click" key={"o" + c.relId} onClick={() => go({ scope: "relationships" })}>
                <span className="chip warn">lost chapter</span>
                <span style={{ fontSize: 12.5 }}>
                  <b>{c.who}</b> · {c.label} — marked in a chapter that's since been deleted, so it shows as “standing”. Re-mark it{c.note ? <> (“{c.note.slice(0, 40)}{c.note.length > 40 ? "…" : ""}”)</> : null}.
                </span>
              </div>
            ))}
            {ironies.map((c) => (
              <div className="row click" key={"i" + c.relId} onClick={() => go({ scope: "relationships" })}>
                <span className="chip" style={{ borderColor: "var(--obligation)", background: "var(--obligationBg)", color: "var(--obligation)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="drama" size={11} /> irony</span>
                <span style={{ fontSize: 12.5 }}>
                  <b>{c.believers}</b> believe{c.believers.includes(",") ? "" : "s"} it's <span style={{ color: "var(--obligation)", fontWeight: 600 }}>{c.belief}</span> — the reader knows it's <span style={{ color: "var(--hostile)", fontWeight: 600 }}>{c.truth}</span>.
                </span>
              </div>
            ))}
            {dormant.map((s) => (
              <div className="row click" key={"d" + s.state_id} onClick={() => go({ scope: "relationships" })}>
                <span className="chip warn">dormant</span>
                <span style={{ fontSize: 12.5 }}>{who(s)} · {s.type_label}</span>
              </div>
            ))}
            {(allOrphans ? orphans : orphans.slice(0, ORPHAN_CAP)).map((e) => (
              <div className="row click" key={e.id} onClick={() => go({ scope: "library", entityId: e.id })}>
                <span className="chip warn">orphaned</span>
                <span style={{ fontSize: 12.5 }}>{e.title}</span>
                <span className="spacer" />
                <span className="muted">no relationships yet</span>
                <span title={`Delete ${e.title}`} onClick={(ev) => delOrphan(e, ev)}
                  style={{ color: "var(--faint)", cursor: "pointer", padding: "0 4px", display: "inline-flex" }}><Icon name="close" size={14} /></span>
              </div>
            ))}
            {orphans.length > ORPHAN_CAP && (
              <div className="row click" onClick={() => setAllOrphans((v) => !v)}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {allOrphans ? "Show fewer" : `+${orphans.length - ORPHAN_CAP} more unconnected — show all`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
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
