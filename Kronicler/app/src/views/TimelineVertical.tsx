import { useMemo, useState } from "react";
import type { Chapter, Band } from "../lib/types";
import type { Nav } from "../App";

// The vertical Chronicle: in-world time runs DOWN the page (each distinct date is
// a row, so equal dates line up across stories), stories are LANES across, arcs
// are tinted bands inside a lane, and a big jump in dates shows an explicit
// "time skip". Read-only navigation for now — click a card to open the chapter.
// Dates are set in the Manuscript / chapter editor (this view lays them out).

const GUTTER = 92, LANE_W = 196, LANE_HEAD_H = 30, CARD_W = 168, CARD_H = 46, TOP_PAD = LANE_HEAD_H + 14;
const ARC_TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];
const MAIN = "__main__";

export function TimelineVertical({ bands, chapters, go }: { bands: Band[]; chapters: Chapter[]; go: (n: Nav) => void }) {
  const [rowH, setRowH] = useState(66);

  const arcById = useMemo(() => new Map(bands.map((b) => [b.id, b])), [bands]);
  const bandIds = useMemo(() => new Set(bands.map((b) => b.id)), [bands]);
  const storyOf = (c: Chapter) => {
    const b = c.band_id && bandIds.has(c.band_id) ? arcById.get(c.band_id) : null;
    return b?.story?.trim() ? b.story.trim() : null;
  };
  const tintOf = (b: Band) => b.color || ARC_TINTS[bands.indexOf(b) % ARC_TINTS.length];

  const dated = useMemo(() => chapters.filter((c) => c.story_time_ref != null), [chapters]);
  const undated = useMemo(() => chapters.filter((c) => c.story_time_ref == null), [chapters]);

  // lanes: the "main" story leftmost, then named stories by earliest date
  const { laneList, laneIndex } = useMemo(() => {
    const earliest = new Map<string, number>();
    for (const c of dated) {
      const k = storyOf(c) ?? MAIN;
      earliest.set(k, Math.min(earliest.get(k) ?? Infinity, c.story_time_ref!));
    }
    const list = [...earliest.keys()].sort((a, b) =>
      a === MAIN ? -1 : b === MAIN ? 1 : (earliest.get(a)! - earliest.get(b)!));
    return { laneList: list, laneIndex: new Map(list.map((k, i) => [k, i])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, bands]);

  // rows: one per distinct date, sorted; a representative label per date
  const { uniq, rowOf, labelAt } = useMemo(() => {
    const u = [...new Set(dated.map((c) => c.story_time_ref!))].sort((a, b) => a - b);
    const label = new Map<number, string>();
    for (const c of dated) {
      const d = c.story_time_ref!;
      const cur = label.get(d);
      if (cur == null || (cur === String(d) && c.story_time_label)) label.set(d, c.story_time_label ?? String(d));
    }
    return { uniq: u, rowOf: new Map(u.map((d, i) => [d, i])), labelAt: label };
  }, [dated]);

  // a "time skip" is a gap that dwarfs the tightest spacing between dates —
  // robust with only a handful of dates (median is too jumpy at small n).
  const minGap = useMemo(() => {
    const g = uniq.slice(1).map((d, i) => d - uniq[i]).filter((x) => x > 0);
    return g.length ? Math.min(...g) : 0;
  }, [uniq]);
  const skipAfter = (i: number) => uniq[i + 1] != null && minGap > 0 && (uniq[i + 1] - uniq[i]) > minGap * 4;

  const yOfRow = (ri: number) => TOP_PAD + ri * rowH;
  const laneName = (k: string) => (k === MAIN ? "Main story" : k);

  // place each dated chapter; several at the same date+lane fan out slightly
  const cell = new Map<string, number>();
  const cards = dated.map((c) => {
    const lk = storyOf(c) ?? MAIN, li = laneIndex.get(lk)!, ri = rowOf.get(c.story_time_ref!)!;
    const key = li + "|" + ri, sub = cell.get(key) ?? 0; cell.set(key, sub + 1);
    const band = c.band_id && bandIds.has(c.band_id) ? arcById.get(c.band_id) ?? null : null;
    return {
      c, band, tint: band ? tintOf(band) : "var(--lineStrong)",
      x: GUTTER + li * LANE_W + 10 + sub * 20,
      y: yOfRow(ri) + sub * 7,
      date: c.story_time_label ?? String(c.story_time_ref),
    };
  });

  // arc bands: span the rows their chapters occupy, within their story's lane
  const arcBands = bands.map((b) => {
    const chs = dated.filter((c) => c.band_id === b.id);
    if (chs.length === 0) return null;
    const lk = b.story?.trim() ? b.story.trim() : MAIN, li = laneIndex.get(lk);
    if (li == null) return null;
    const rows = chs.map((c) => rowOf.get(c.story_time_ref!)!);
    const minR = Math.min(...rows), maxR = Math.max(...rows);
    return { b, tint: tintOf(b), x: GUTTER + li * LANE_W + 3, y: yOfRow(minR) - 8, h: (maxR - minR) * rowH + CARD_H + 14 };
  }).filter(Boolean) as { b: Band; tint: string; x: number; y: number; h: number }[];

  const width = GUTTER + Math.max(laneList.length, 1) * LANE_W + 24;
  const height = TOP_PAD + Math.max(uniq.length, 1) * rowH + CARD_H + 40;

  if (dated.length === 0) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>No dated chapters yet.</p>
        <p className="muted" style={{ marginTop: 6 }}>
          Give chapters an in-world date (in the Manuscript, or a chapter's 🕐 field) and they'll lay out here by time.
          Add a <b>story</b> to an arc in the Manuscript to split it into its own lane (great for spin-offs).
        </p>
        {undated.length > 0 && <p className="faint" style={{ fontSize: 12 }}>{undated.length} chapter{undated.length === 1 ? "" : "s"} waiting for a date.</p>}
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8, gap: 8 }}>
        <span className="faint" style={{ fontSize: 11 }}>time runs downward · stories are lanes · arcs are the tinted bands · scroll to travel the chronicle</span>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 11 }}>density</span>
        <button style={{ padding: "2px 9px" }} title="Compress" onClick={() => setRowH((h) => Math.max(40, h - 12))}>−</button>
        <button style={{ padding: "2px 9px" }} title="Expand" onClick={() => setRowH((h) => Math.min(140, h + 12))}>+</button>
      </div>

      <div className="tv-scroll">
        <div style={{ position: "relative", width, height }}>
          {/* date rows: gridline + gutter label, plus time-skip pills */}
          {uniq.map((d, i) => {
            const y = yOfRow(i);
            return (
              <div key={"r" + d}>
                <div style={{ position: "absolute", left: GUTTER - 6, top: y - 9, width: width - GUTTER, height: 1, background: "var(--line)" }} />
                <div style={{ position: "absolute", left: 0, top: y - 8, width: GUTTER - 12, textAlign: "right",
                  fontSize: 11.5, color: "var(--sub)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} title={`in-world: ${labelAt.get(d)}`}>
                  🕐 {labelAt.get(d)}
                </div>
                {skipAfter(i) && (
                  <div style={{ position: "absolute", left: 8, top: y + rowH - 22, fontSize: 10.5, color: "var(--obligation)",
                    border: "1px dashed var(--obligation)", borderRadius: 8, padding: "1px 6px", background: "var(--obligationBg)", whiteSpace: "nowrap" }}>
                    ⟿ time skip +{uniq[i + 1] - d}
                  </div>
                )}
              </div>
            );
          })}

          {/* lane headers */}
          {laneList.map((k) => (
            <div key={"lh" + k} style={{ position: "absolute", left: GUTTER + laneIndex.get(k)! * LANE_W + 6, top: 0, width: LANE_W - 12 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
                borderBottom: "2px solid var(--line)", paddingBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={laneName(k)}>{laneName(k)}</div>
            </div>
          ))}

          {/* arc bands (behind cards) */}
          {arcBands.map(({ b, tint, x, y, h }) => (
            <div key={"ab" + b.id} style={{ position: "absolute", left: x, top: y, width: LANE_W - 10, height: h,
              background: tint + "14", border: `1px solid ${tint}44`, borderRadius: 10, pointerEvents: "none" }}>
              <span style={{ position: "absolute", top: 4, left: 8, fontSize: 10.5, fontWeight: 700, color: tint,
                textTransform: "uppercase", letterSpacing: 0.3 }}>{b.name}{b.time_frame ? ` · ${b.time_frame}` : ""}</span>
            </div>
          ))}

          {/* chapter cards */}
          {cards.map(({ c, tint, x, y, date }) => (
            <div key={c.id} className="tv-card" style={{ left: x, top: y, width: CARD_W, height: CARD_H, borderLeft: `3px solid ${tint}` }}
              onClick={() => go({ scope: "manuscript", chapterId: c.id })} title={c.title}>
              <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                <span style={{ fontSize: 10.5, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{String(c.manuscript_order).padStart(2, "0")}</span>
                <span style={{ fontSize: 10.5, color: "var(--sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🕐 {date}</span>
              </div>
              <div style={{ fontFamily: "var(--serif)", fontSize: 12.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
            </div>
          ))}
        </div>
      </div>

      {undated.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>undated — give these an in-world date to place them on the chronicle:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {undated.map((c) => (
              <span key={c.id} className="chip click" onClick={() => go({ scope: "manuscript", chapterId: c.id })} title="Open to set a date">
                {String(c.manuscript_order).padStart(2, "0")} · {c.title.length > 26 ? c.title.slice(0, 26) + "…" : c.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
