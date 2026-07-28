import { useEffect, useState } from "react";
import type { Chapter } from "../lib/types";
import { getWorld, setChapterStructuredDate } from "../lib/api";
import {
  deriveCalendar, DEFAULT_CALENDAR, spanStart, spanEnd, formatWorldDate, monthName, type DerivedCalendar, type Precision,
} from "../lib/worldTime";
import { Icon } from "../components/icons";

// Structured in-world date editor (design doc 3 §12), simplified: three fields —
// year, month, day — where month and day each carry a "(none)" option. Precision
// is DERIVED from what you fill in: a day means day precision, a month (no day)
// means month precision, year alone means year precision. No separate precision
// selector. Month names + lengths come from the world's calendar.
export function ChapterDate({ worldId, chapter, onChanged }: {
  worldId: string;
  chapter: Chapter;
  onChanged?: (label: string | null) => void;
}) {
  const [cal, setCal] = useState<DerivedCalendar>(() => deriveCalendar(DEFAULT_CALENDAR));
  const [y, setY] = useState(chapter.time_year != null ? String(chapter.time_year) : "");
  const [m, setM] = useState(chapter.time_month ?? 0);   // 0 = (none)
  const [d, setD] = useState(chapter.time_day ?? 0);     // 0 = (none)
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getWorld(worldId).then((w) => setCal(deriveCalendar(w.calendar ?? DEFAULT_CALENDAR))).catch(() => {}); }, [worldId]);

  async function commit(nextY = y, nextM = m, nextD = d) {
    setErr(null);
    if (!nextY.trim()) {
      try { await setChapterStructuredDate(chapter.id, null); onChanged?.(null); } catch (x) { setErr(String(x)); }
      return;
    }
    const year = parseInt(nextY, 10);
    if (Number.isNaN(year)) { setErr("Year must be a number."); return; }
    const prec: Precision = nextD > 0 ? "day" : nextM > 0 ? "month" : "year";
    const wd = { year, month: nextM > 0 ? nextM : 1, day: nextD > 0 ? nextD : 1 };
    const label = formatWorldDate(wd, prec, cal);
    try {
      await setChapterStructuredDate(chapter.id, {
        time_year: year,
        time_month: nextM > 0 ? nextM : null,
        time_day: nextD > 0 ? nextD : null,
        time_precision: prec,
        day_num_start: spanStart(wd, prec, cal),
        day_num_end: spanEnd(wd, prec, cal),
        story_time_label: label,
        story_time_ref: year,
      });
      onChanged?.(label);
    } catch (x) { setErr(String(x)); }
  }

  const months = Array.from({ length: cal.monthsPerYear }, (_, i) => i + 1);
  const maxDay = cal.monthLengths[Math.min(cal.monthsPerYear, Math.max(1, m)) - 1] ?? 30;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  function onMonth(v: number) {
    const nextD = v === 0 ? 0 : d;    // clearing the month clears the day too
    setM(v); setD(nextD); void commit(y, v, nextD);
  }
  function onDay(v: number) { setD(v); void commit(y, m, v); }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span className="muted" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={11} /> in-world</span>
      <input value={y} placeholder="year" title="In-world year (e.g. 1150)"
        onChange={(e) => setY(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
        onBlur={() => commit()} style={{ width: 66, fontSize: 12 }} />
      <select className="sel" value={m} title="Month (optional)" onChange={(e) => onMonth(+e.target.value)}
        style={{ fontSize: 11, padding: "3px 6px" }}>
        <option value={0}>month (none)</option>
        {months.map((mm) => <option key={mm} value={mm}>{monthName(mm, cal)}</option>)}
      </select>
      <select className="sel" value={d} title={m > 0 ? "Day (optional)" : "Pick a month first"} disabled={m === 0}
        onChange={(e) => onDay(+e.target.value)} style={{ fontSize: 11, padding: "3px 6px" }}>
        <option value={0}>day (none)</option>
        {days.map((dd) => <option key={dd} value={dd}>{dd}</option>)}
      </select>
      {err && <span className="err" style={{ fontSize: 11 }}>{err}</span>}
    </span>
  );
}
