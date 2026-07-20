import { useEffect, useMemo, useState } from "react";
import type { Chapter, Band, TimelineMarker } from "../lib/types";
import type { Nav } from "../App";
import { getMarkers, createMarker, softDeleteMarker, createChapter } from "../lib/api";
import { parseStoryTime } from "../lib/time";

// The Chronicle — a snap-to-date PLANNING canvas. Time runs down (each distinct
// in-world date is a row, so equal dates line up across stories); stories are
// lanes; arcs are tinted bands. You can add things you haven't written yet:
// planned chapters (dashed — become real when written), labelled date lines,
// era/event markers, and time-skip dividers. Everything snaps to its date.

const GUTTER = 96, LANE_W = 196, LANE_HEAD_H = 30, CARD_W = 168, CARD_H = 46, TOP_PAD = LANE_HEAD_H + 16;
const ARC_TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];
const MAIN = "__main__";

type AddKind = null | "beat" | "date" | "event" | "timeskip";

export function TimelineVertical({ worldId, bands, chapters, go, onChanged }: {
  worldId: string; bands: Band[]; chapters: Chapter[]; go: (n: Nav) => void; onChanged?: () => void;
}) {
  const [rowH, setRowH] = useState(66);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [adding, setAdding] = useState<AddKind>(null);
  const [fLabel, setFLabel] = useState("");
  const [fDate, setFDate] = useState("");
  const [fLane, setFLane] = useState("");
  const [fArc, setFArc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refreshMarkers = () => getMarkers(worldId).then(setMarkers).catch((x) => setErr(String(x)));
  useEffect(() => { void refreshMarkers(); /* eslint-disable-next-line */ }, [worldId]);

  const arcById = useMemo(() => new Map(bands.map((b) => [b.id, b])), [bands]);
  const bandIds = useMemo(() => new Set(bands.map((b) => b.id)), [bands]);
  const storyOf = (c: Chapter) => {
    const b = c.band_id && bandIds.has(c.band_id) ? arcById.get(c.band_id) : null;
    return b?.story?.trim() ? b.story.trim() : null;
  };
  const tintOf = (b: Band) => b.color || ARC_TINTS[bands.indexOf(b) % ARC_TINTS.length];
  const knownStories = useMemo(
    () => [...new Set(bands.map((b) => b.story?.trim()).filter(Boolean) as string[])],
    [bands],
  );

  const dated = useMemo(() => chapters.filter((c) => c.story_time_ref != null), [chapters]);
  const undated = useMemo(() => chapters.filter((c) => c.story_time_ref == null), [chapters]);
  const spanMarkers = useMemo(() => markers.filter((m) => (m.kind === "date" || m.kind === "timeskip") && m.story_time_ref != null), [markers]);
  const eventMarkers = useMemo(() => markers.filter((m) => m.kind === "event" && m.story_time_ref != null), [markers]);

  // lanes: main leftmost, then named stories (from arcs + event markers) by earliest date
  const { laneList, laneIndex } = useMemo(() => {
    const earliest = new Map<string, number>();
    const bump = (k: string, v: number) => earliest.set(k, Math.min(earliest.get(k) ?? Infinity, v));
    for (const c of dated) bump(storyOf(c) ?? MAIN, c.story_time_ref!);
    for (const m of eventMarkers) bump(m.story?.trim() || MAIN, m.story_time_ref!);
    if (earliest.size === 0) earliest.set(MAIN, 0);
    const list = [...earliest.keys()].sort((a, b) =>
      a === MAIN ? -1 : b === MAIN ? 1 : (earliest.get(a)! - earliest.get(b)!));
    return { laneList: list, laneIndex: new Map(list.map((k, i) => [k, i])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, eventMarkers, bands]);

  // rows: one per distinct date across chapters AND markers; a label per date
  const { uniq, rowOf, labelAt } = useMemo(() => {
    const all = [...dated.map((c) => c.story_time_ref!), ...markers.filter((m) => m.story_time_ref != null).map((m) => m.story_time_ref!)];
    const u = [...new Set(all)].sort((a, b) => a - b);
    const label = new Map<number, string>();
    for (const c of dated) { const d = c.story_time_ref!; if (!label.has(d)) label.set(d, c.story_time_label ?? String(d)); }
    for (const m of markers) { if (m.story_time_ref == null) continue; const d = m.story_time_ref; if (m.story_time_label && (m.kind === "date" || !label.has(d))) label.set(d, m.story_time_label); else if (!label.has(d)) label.set(d, String(d)); }
    return { uniq: u, rowOf: new Map(u.map((d, i) => [d, i])), labelAt: label };
  }, [dated, markers]);

  const minGap = useMemo(() => {
    const g = uniq.slice(1).map((d, i) => d - uniq[i]).filter((x) => x > 0);
    return g.length ? Math.min(...g) : 0;
  }, [uniq]);
  const autoSkip = (i: number) => uniq[i + 1] != null && minGap > 0 && (uniq[i + 1] - uniq[i]) > minGap * 4;

  const yOfRow = (ri: number) => TOP_PAD + ri * rowH;
  const laneName = (k: string) => (k === MAIN ? "Main story" : k);

  const cell = new Map<string, number>();
  const cards = dated.map((c) => {
    const lk = storyOf(c) ?? MAIN, li = laneIndex.get(lk) ?? 0, ri = rowOf.get(c.story_time_ref!)!;
    const key = li + "|" + ri, sub = cell.get(key) ?? 0; cell.set(key, sub + 1);
    const band = c.band_id && bandIds.has(c.band_id) ? arcById.get(c.band_id) ?? null : null;
    return {
      c, tint: band ? tintOf(band) : "var(--lineStrong)",
      x: GUTTER + li * LANE_W + 10 + sub * 20, y: yOfRow(ri) + sub * 7,
      date: c.story_time_label ?? String(c.story_time_ref),
    };
  });

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
  const hasContent = uniq.length > 0;

  function resetForm() { setFLabel(""); setFDate(""); setFLane(""); setFArc(""); setAdding(null); }
  async function submitAdd() {
    try {
      if (adding === "beat") {
        if (!fLabel.trim()) { setErr("Give the beat a title."); return; }
        const order = chapters.reduce((m, c) => Math.max(m, c.manuscript_order), 0) + 1;
        const ref = fDate.trim() ? parseStoryTime(fDate) : null;
        await createChapter(worldId, fLabel.trim(), order, "", { planned: true, band_id: fArc || null, story_time_ref: ref, story_time_label: fDate.trim() || null });
        onChanged?.();
      } else if (adding === "date") {
        if (!fLabel.trim()) { setErr("Type the date, e.g. 1150 AE."); return; }
        await createMarker(worldId, { kind: "date", label: fLabel.trim(), story_time_ref: parseStoryTime(fLabel), story_time_label: fLabel.trim() });
        await refreshMarkers();
      } else if (adding === "event") {
        if (!fLabel.trim()) { setErr("Name the event."); return; }
        await createMarker(worldId, { kind: "event", label: fLabel.trim(), story_time_ref: fDate.trim() ? parseStoryTime(fDate) : null, story_time_label: fDate.trim() || null, story: fLane || null });
        await refreshMarkers();
      } else if (adding === "timeskip") {
        if (!fDate.trim()) { setErr("Give the time-skip a date to sit at."); return; }
        await createMarker(worldId, { kind: "timeskip", label: fLabel.trim() || null, story_time_ref: parseStoryTime(fDate), story_time_label: fDate.trim() });
        await refreshMarkers();
      }
      setErr(null); resetForm();
    } catch (x) { setErr(String(x)); }
  }
  async function delMarker(id: string) { try { await softDeleteMarker(id); await refreshMarkers(); } catch (x) { setErr(String(x)); } }

  const addBtn = (k: Exclude<AddKind, null>, label: string) => (
    <button style={{ padding: "3px 10px", fontSize: 12 }} className={adding === k ? "primary" : ""}
      onClick={() => { setErr(null); setAdding(adding === k ? null : k); }}>{label}</button>
  );

  return (
    <>
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <span className="faint" style={{ fontSize: 11 }}>time runs down · stories are lanes · add beats/dates/events below — they snap to their date</span>
        <span className="spacer" />
        {addBtn("beat", "＋ Beat")}
        {addBtn("date", "＋ Date line")}
        {addBtn("event", "＋ Event")}
        {addBtn("timeskip", "＋ Time-skip")}
        <span className="faint" style={{ fontSize: 11, marginLeft: 6 }}>density</span>
        <button style={{ padding: "2px 9px" }} onClick={() => setRowH((h) => Math.max(40, h - 12))}>−</button>
        <button style={{ padding: "2px 9px" }} onClick={() => setRowH((h) => Math.min(140, h + 12))}>+</button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 10, marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {adding === "beat" && <>
            <input autoFocus placeholder="Beat / chapter title" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={{ width: 220 }} />
            <input placeholder="🕐 date (e.g. 1150 AE)" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ width: 150 }} />
            <select className="sel" value={fArc} onChange={(e) => setFArc(e.target.value)} style={{ width: 150 }}>
              <option value="">no arc / main</option>
              {bands.map((b) => <option key={b.id} value={b.id}>{b.name}{b.story ? ` · ${b.story}` : ""}</option>)}
            </select>
          </>}
          {adding === "date" && <input autoFocus placeholder="Date line, e.g. 1150 AE" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={{ width: 220 }} />}
          {adding === "event" && <>
            <input autoFocus placeholder="Event, e.g. The Great War" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={{ width: 220 }} />
            <input placeholder="🕐 date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ width: 130 }} />
            <select className="sel" value={fLane} onChange={(e) => setFLane(e.target.value)} style={{ width: 150 }}>
              <option value="">whole world</option>
              {knownStories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>}
          {adding === "timeskip" && <>
            <input autoFocus placeholder="🕐 date it jumps to (e.g. 1250 AE)" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ width: 200 }} />
            <input placeholder="label (optional)" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={{ width: 160 }} />
          </>}
          <button className="primary" style={{ padding: "5px 12px" }} onClick={submitAdd}>Add</button>
          <button style={{ padding: "5px 12px" }} onClick={resetForm}>Cancel</button>
          {err && <span className="err">{err}</span>}
        </div>
      )}
      {!adding && err && <p className="err" style={{ marginTop: 0 }}>{err}</p>}

      {!hasContent ? (
        <div className="card" style={{ padding: 18 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing on the chronicle yet.</p>
          <p className="muted" style={{ marginTop: 6 }}>
            Add a <b>date line</b> (like “1150 AE”), a <b>planned beat</b> for something you haven't written, or an <b>event</b> —
            or give existing chapters an in-world date (in the Manuscript). Everything snaps to its date here.
          </p>
        </div>
      ) : (
        <div className="tv-scroll">
          <div style={{ position: "relative", width, height }}>
            {/* date rows: gridline + gutter label, auto time-skip hint */}
            {uniq.map((d, i) => {
              const y = yOfRow(i);
              const dm = spanMarkers.find((m) => m.kind === "date" && m.story_time_ref === d);
              return (
                <div key={"r" + d}>
                  <div style={{ position: "absolute", left: GUTTER - 6, top: y - 9, width: width - GUTTER, height: 1, background: dm ? "var(--lineStrong)" : "var(--line)" }} />
                  <div style={{ position: "absolute", left: 0, top: y - 8, width: GUTTER - 12, textAlign: "right", fontSize: 11.5, color: dm ? "var(--ink)" : "var(--sub)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} title={dm ? "date line" : `in-world: ${labelAt.get(d)}`}>
                    🕐 {labelAt.get(d)}
                    {dm && <span onClick={() => delMarker(dm.id)} title="Remove date line" style={{ cursor: "pointer", color: "var(--faint)", marginLeft: 4 }}>✕</span>}
                  </div>
                  {autoSkip(i) && !spanMarkers.some((m) => m.kind === "timeskip" && m.story_time_ref === uniq[i + 1]) && (
                    <div style={{ position: "absolute", left: 8, top: y + rowH - 22, fontSize: 10.5, color: "var(--obligation)", border: "1px dashed var(--obligation)", borderRadius: 8, padding: "1px 6px", background: "var(--obligationBg)", whiteSpace: "nowrap" }}>
                      ⟿ time skip +{uniq[i + 1] - d}
                    </div>
                  )}
                </div>
              );
            })}

            {/* time-skip divider markers: full-width dashed band */}
            {spanMarkers.filter((m) => m.kind === "timeskip").map((m) => {
              const ri = rowOf.get(m.story_time_ref!); if (ri == null) return null;
              const y = yOfRow(ri) - 9;
              return (
                <div key={"ts" + m.id} style={{ position: "absolute", left: GUTTER - 6, top: y, width: width - GUTTER, height: 0, borderTop: "2px dashed var(--obligation)" }}>
                  <span style={{ position: "absolute", left: 8, top: -9, fontSize: 10.5, fontWeight: 700, color: "var(--obligation)", background: "var(--surface)", padding: "0 6px" }}>
                    ⟿ TIMESKIP{m.label ? ` · ${m.label}` : ""} <span onClick={() => delMarker(m.id)} title="Remove" style={{ cursor: "pointer", color: "var(--faint)" }}>✕</span>
                  </span>
                </div>
              );
            })}

            {/* lane headers */}
            {laneList.map((k) => (
              <div key={"lh" + k} style={{ position: "absolute", left: GUTTER + laneIndex.get(k)! * LANE_W + 6, top: 0, width: LANE_W - 12 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)", borderBottom: "2px solid var(--line)", paddingBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={laneName(k)}>{laneName(k)}</div>
              </div>
            ))}

            {/* arc bands behind cards */}
            {arcBands.map(({ b, tint, x, y, h }) => (
              <div key={"ab" + b.id} style={{ position: "absolute", left: x, top: y, width: LANE_W - 10, height: h, background: tint + "14", border: `1px solid ${tint}44`, borderRadius: 10, pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: 4, left: 8, fontSize: 10.5, fontWeight: 700, color: tint, textTransform: "uppercase", letterSpacing: 0.3 }}>{b.name}{b.time_frame ? ` · ${b.time_frame}` : ""}</span>
              </div>
            ))}

            {/* event markers */}
            {eventMarkers.map((m) => {
              const ri = rowOf.get(m.story_time_ref!); if (ri == null) return null;
              const lk = m.story?.trim() || MAIN, li = laneIndex.get(lk) ?? 0;
              return (
                <div key={"ev" + m.id} style={{ position: "absolute", left: GUTTER + li * LANE_W + 10, top: yOfRow(ri) + 2, maxWidth: LANE_W - 16,
                  fontSize: 11, color: "var(--obligation)", border: "1px solid var(--obligation)", background: "var(--obligationBg)", borderRadius: 8, padding: "3px 8px", display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={m.label ?? ""}>★ {m.label}</span>
                  <span onClick={() => delMarker(m.id)} title="Remove event" style={{ cursor: "pointer", color: "var(--faint)" }}>✕</span>
                </div>
              );
            })}

            {/* chapter cards (planned = dashed) */}
            {cards.map(({ c, tint, x, y, date }) => (
              <div key={c.id} className="tv-card" style={{ left: x, top: y, width: CARD_W, height: CARD_H, borderLeft: `3px solid ${tint}`, borderStyle: c.planned ? "dashed" : "solid", opacity: c.planned ? 0.9 : 1 }}
                onClick={() => go({ scope: "manuscript", chapterId: c.id })} title={c.planned ? `Planned — click to write: ${c.title}` : c.title}>
                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ fontSize: 10.5, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{c.planned ? "✎ plan" : String(c.manuscript_order).padStart(2, "0")}</span>
                  <span style={{ fontSize: 10.5, color: "var(--sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>🕐 {date}</span>
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 12.5, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontStyle: c.planned ? "italic" : "normal" }}>{c.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>undated — give these an in-world date to place them on the chronicle:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {undated.map((c) => (
              <span key={c.id} className="chip click" onClick={() => go({ scope: "manuscript", chapterId: c.id })} title="Open to set a date">
                {c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")} · {c.title.length > 26 ? c.title.slice(0, 26) + "…" : c.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
