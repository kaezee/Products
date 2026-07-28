import { useEffect, useState } from "react";
import type { Chapter } from "../lib/types";
import { getWorld, setChapterStructuredDate } from "../lib/api";
import {
  deriveCalendar, DEFAULT_CALENDAR, spanStart, spanEnd, formatWorldDate, monthName, type DerivedCalendar, type Precision,
} from "../lib/worldTime";
import { Icon } from "../components/icons";

// Structured in-world date editor (design doc 3 §12): pick a precision, then the
// year (and month, and day) it needs. Writes authored fields + derived day
// numbers so the chapter lands correctly on the timeline. Calendar-aware — month
// choices and names come from the world's calendar.
export function ChapterDate({ worldId, chapter, onChanged }: {
  worldId: string;
  chapter: Chapter;
  onChanged?: (label: string | null) => void;
}) {
  const [cal, setCal] = useState<DerivedCalendar>(() => deriveCalendar(DEFAULT_CALENDAR));
  const [prec, setPrec] = useState<Precision>(chapter.time_precision ?? "year");
  const [y, setY] = useState(chapter.time_year != null ? String(chapter.time_year) : "");
  const [m, setM] = useState(chapter.time_month ?? 1);
  const [d, setD] = useState(chapter.time_day ?? 1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getWorld(worldId).then((w) => setCal(deriveCalendar(w.calendar ?? DEFAULT_CALENDAR))).catch(() => {}); }, [worldId]);

  async function commit(nextPrec = prec, nextY = y, nextM = m, nextD = d) {
    setErr(null);
    if (!nextY.trim()) {
      try { await setChapterStructuredDate(chapter.id, null); onChanged?.(null); } catch (x) { setErr(String(x)); }
      return;
    }
    const year = parseInt(nextY, 10);
    if (Number.isNaN(year)) { setErr("Year must be a number."); return; }
    const wd = { year, month: nextPrec === "year" ? 1 : nextM, day: nextPrec === "day" ? nextD : 1 };
    const label = formatWorldDate(wd, nextPrec, cal);
    try {
      await setChapterStructuredDate(chapter.id, {
        time_year: year,
        time_month: nextPrec === "year" ? null : nextM,
        time_day: nextPrec === "day" ? nextD : null,
        time_precision: nextPrec,
        day_num_start: spanStart(wd, nextPrec, cal),
        day_num_end: spanEnd(wd, nextPrec, cal),
        story_time_label: label,
        story_time_ref: year,
      });
      onChanged?.(label);
    } catch (x) { setErr(String(x)); }
  }

  const months = Array.from({ length: cal.monthsPerYear }, (_, i) => i + 1);
  const maxDay = cal.monthLengths[Math.min(cal.monthsPerYear, Math.max(1, m)) - 1];

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={11} /> in-world</span>
      <select className="sel" value={prec} title="How precisely you know when this happens"
        onChange={(e) => { const p = e.target.value as Precision; setPrec(p); void commit(p); }}
        style={{ fontSize: 11, padding: "3px 6px" }}>
        <option value="year">year</option>
        <option value="month">month</option>
        <option value="day">day</option>
      </select>
      <input value={y} placeholder="year" title="In-world year (e.g. 1150)"
        onChange={(e) => setY(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
        onBlur={() => commit()} style={{ width: 70, fontSize: 12 }} />
      {prec !== "year" && (
        <select className="sel" value={m} title="Month" onChange={(e) => { const v = +e.target.value; setM(v); void commit(prec, y, v); }}
          style={{ fontSize: 11, padding: "3px 6px" }}>
          {months.map((mm) => <option key={mm} value={mm}>{monthName(mm, cal)}</option>)}
        </select>
      )}
      {prec === "day" && (
        <input type="number" min={1} max={maxDay} value={d} title="Day of month"
          onChange={(e) => setD(Math.max(1, Math.min(maxDay, +e.target.value || 1)))}
          onBlur={() => commit()} style={{ width: 52, fontSize: 12 }} />
      )}
      {err && <span className="err" style={{ fontSize: 11 }}>{err}</span>}
    </span>
  );
}
