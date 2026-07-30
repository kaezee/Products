import type { Entity } from "../lib/types";
import type { RelArc, ArcState } from "../lib/relArc";
import { VALENCE_COLOR } from "../lib/valence";
import { Icon } from "./icons";

// One relationship, read as a single row: who it's between, the arc of what it
// has been (tone-coloured chips with chapter refs), the latest note, and a
// micro-timeline that shows the shape of its change at a glance. Used at world
// scope (List lens) and, with `anchor`, inside an entity's own page.
export function RelRow({ arc, entById, typeSwatch, maxCh, asOf, anchor, compact, onOpenEntity, onRemove }: {
  arc: RelArc;
  entById: Map<string, Entity>;
  typeSwatch: Map<string, string>;
  maxCh: number;
  asOf: number;
  anchor?: string;          // entity id — show only the counterpart's name
  compact?: boolean;        // borderless, for the entity page
  onOpenEntity?: (id: string) => void;
  onRemove?: () => void;    // optional per-row remove affordance
}) {
  const shown = anchor ? arc.participants.filter((p) => p.entity_id !== anchor) : arc.participants;
  const dotOf = (id: string) => {
    const t = entById.get(id)?.type;
    const sw = t ? typeSwatch.get(t.toLowerCase()) : undefined;
    return sw ? `var(--k-entity-${sw})` : "var(--lineStrong)";
  };
  const concealedN = arc.current?.concealedN ?? 0;
  const note = arc.current?.note ?? [...arc.states].reverse().find((s) => s.note)?.note ?? null;
  const changeWord = arc.changes === 0 ? "unchanged" : `${arc.changes} change${arc.changes === 1 ? "" : "s"}`;

  return (
    <div className={"relrow" + (compact ? " compact" : "")}>
      <div className="relrow-main">
        <div className="relrow-head">
          {shown.map((p, i) => (
            <span key={p.entity_id}>
              {i > 0 && <span className="relrow-sep">·</span>}
              <span className="relrow-name" role={onOpenEntity ? "button" : undefined} tabIndex={onOpenEntity ? 0 : undefined}
                onClick={() => onOpenEntity?.(p.entity_id)}
                onKeyDown={(e) => { if (onOpenEntity && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenEntity(p.entity_id); } }}>
                <span className="relrow-dot" style={{ background: dotOf(p.entity_id) }} />
                {p.title}
              </span>
            </span>
          ))}
          {concealedN > 0 && <span className="relrow-secret">hidden from {concealedN}</span>}
        </div>

        <div className="relrow-arc">
          {arc.states.map((s, i) => (
            <span key={s.stateId} className="relrow-arc-step" style={{ opacity: s.future ? 0.42 : 1 }}>
              {i > 0 && <span className="relrow-arrow">→</span>}
              <span className="relrow-chip" style={{ color: VALENCE_COLOR[s.valence], background: chipBg(s) }}>{s.typeLabel}</span>
              <span className="relrow-ch">{s.order != null ? `ch.${s.order}` : "always"}</span>
            </span>
          ))}
        </div>

        {note && <div className="relrow-note">{note}</div>}
      </div>

      <div className="relrow-time">
        <MicroTimeline states={arc.states} maxCh={maxCh} asOf={asOf} />
        <div className="relrow-cap">ch.1 · {changeWord} · ch.{maxCh}</div>
      </div>

      {onRemove && (
        <span className="relrow-remove" role="button" tabIndex={0} title="Remove this relationship"
          onClick={onRemove} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRemove(); } }}>
          <Icon name="close" size={13} />
        </span>
      )}
    </div>
  );
}

function chipBg(s: ArcState): string {
  // tone tint behind the chip; a valence token has a matching -tint sibling
  const map: Record<string, string> = {
    bond: "var(--k-valence-allied-tint)", obligation: "var(--k-valence-obligation-tint)",
    neutral: "var(--k-valence-neutral-tint)", hostile: "var(--k-valence-hostile-tint)",
  };
  return map[s.valence] ?? "var(--wash)";
}

// The 126px strip: tone-coloured segments between changes, a dot at each state,
// and a vertical line at the current chapter. Standing facts (no chapter) have
// no position and don't draw here — they still appear as an "always" chip.
function MicroTimeline({ states, maxCh, asOf }: { states: ArcState[]; maxCh: number; asOf: number }) {
  const W = 126, H = 16, pad = 3;
  const placed = states.filter((s) => s.order != null) as (ArcState & { order: number })[];
  const x = (ch: number) => (maxCh <= 1 ? W / 2 : pad + ((ch - 1) / (maxCh - 1)) * (W - pad * 2));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="relrow-svg" aria-hidden>
      <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="var(--line)" strokeWidth={1} />
      {placed.map((s, i) => {
        const x0 = x(s.order);
        const x1 = i + 1 < placed.length ? x(placed[i + 1].order) : W - pad;
        return <line key={"seg" + s.stateId} x1={x0} y1={H / 2} x2={x1} y2={H / 2}
          stroke={VALENCE_COLOR[s.valence]} strokeWidth={3} opacity={s.future ? 0.4 : 0.9} strokeLinecap="round" />;
      })}
      {placed.map((s) => (
        <circle key={"d" + s.stateId} cx={x(s.order)} cy={H / 2} r={2.6}
          fill={VALENCE_COLOR[s.valence]} opacity={s.future ? 0.5 : 1} />
      ))}
      <line x1={x(asOf)} y1={1} x2={x(asOf)} y2={H - 1} stroke="var(--ink)" strokeWidth={1.4} opacity={0.55} />
    </svg>
  );
}
