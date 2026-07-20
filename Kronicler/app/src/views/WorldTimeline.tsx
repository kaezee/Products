import { useEffect, useMemo, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand,
  getChapters, getNotes, createNote, updateNote, softDeleteNote,
} from "../lib/api";
import type { Band, Chapter, Note } from "../lib/types";
import type { Nav } from "../App";
import { parseStoryTime } from "../lib/time";

// The World Timeline: one stretchy year-ruler for the whole world. SERIES stack
// as lanes; a VOLUME (band) is a bar sized by its year range; CHAPTERS ride
// inside a volume as ticks at their in-world date; NOTES attach to a volume.
// Undated / unplaced things park on the left. Everything here is composed BY the
// writer — add series, volumes, notes by hand; nothing is auto-generated.

const TINTS = ["#8a6fb0", "#5b8ab0", "#b08a4a", "#5f9a6a", "#b06a6a", "#7a7ab0"];
const LANE_HEAD = 24, VOL_ROW = 34, LANE_PAD = 14;
const MAIN = "Main series";

type Adding = null | "series" | "volume" | "note";

export function WorldTimeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [bands, setBands] = useState<Band[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [adding, setAdding] = useState<Adding>(null);
  const [fName, setFName] = useState("");
  const [fSeries, setFSeries] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fVol, setFVol] = useState("");
  const [fBody, setFBody] = useState("");

  async function reload() {
    try {
      const [b, c, n] = await Promise.all([getBands(worldId), getChapters(worldId), getNotes(worldId)]);
      setBands(b.sort((x, y) => x.band_order - y.band_order)); setChapters(c); setNotes(n);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const seriesOf = (b: Band) => (b.story?.trim() ? b.story.trim() : MAIN);
  const tintOf = (b: Band) => b.color || TINTS[bands.indexOf(b) % TINTS.length];
  // a volume's resolved span: explicit range, else the span of its dated chapters
  const rangeOf = (b: Band): [number, number] | null => {
    if (b.start_ref != null && b.end_ref != null) return [Math.min(b.start_ref, b.end_ref), Math.max(b.start_ref, b.end_ref)];
    const ds = chapters.filter((c) => c.band_id === b.id && c.story_time_ref != null).map((c) => c.story_time_ref!);
    if (ds.length) return [Math.min(...ds), Math.max(...ds)];
    if (b.start_ref != null) return [b.start_ref, b.start_ref];
    return null;
  };

  const knownSeries = useMemo(() => [...new Set(bands.map(seriesOf))], [bands]);

  // domain of the ruler = min/max across every placed thing, padded a little
  const domain = useMemo(() => {
    const vals: number[] = [];
    for (const b of bands) { const r = rangeOf(b); if (r) vals.push(r[0], r[1]); }
    for (const c of chapters) if (c.story_time_ref != null) vals.push(c.story_time_ref);
    if (vals.length === 0) return null;
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.06;
    return { lo: lo - pad, hi: hi + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, chapters]);

  const xPct = (y: number) => domain ? Math.max(0, Math.min(100, ((y - domain.lo) / (domain.hi - domain.lo)) * 100)) : 0;
  const ticks = useMemo(() => domain ? niceTicks(domain.lo, domain.hi, 6) : [], [domain]);

  // group volumes into series lanes, ordered by earliest start
  const lanes = useMemo(() => {
    const map = new Map<string, Band[]>();
    for (const b of bands) { const k = seriesOf(b); (map.get(k) ?? map.set(k, []).get(k)!).push(b); }
    const startOf = (b: Band) => rangeOf(b)?.[0] ?? Infinity;
    return [...map.entries()]
      .map(([name, vols]) => ({ name, vols: vols.sort((a, b) => startOf(a) - startOf(b)) }))
      .sort((a, b) => (a.name === MAIN ? -1 : b.name === MAIN ? 1 : Math.min(...a.vols.map(startOf)) - Math.min(...b.vols.map(startOf))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, chapters]);

  const parkedChapters = useMemo(
    () => chapters.filter((c) => !(c.band_id && bands.some((b) => b.id === c.band_id))),
    [chapters, bands],
  );

  // ── actions (all writer-driven) ──────────────────────────────────────────
  const nextOrder = () => (bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0);
  function resetForm() { setFName(""); setFSeries(""); setFStart(""); setFEnd(""); setFVol(""); setFBody(""); setAdding(null); setErr(null); }
  async function submit() {
    try {
      if (adding === "series") {
        if (!fName.trim()) { setErr("Name the series."); return; }
        const b = await createBand(worldId, "Volume 1", nextOrder());
        await updateBand(b.id, { story: fName.trim() });
      } else if (adding === "volume") {
        if (!fName.trim()) { setErr("Name the volume."); return; }
        const b = await createBand(worldId, fName.trim(), nextOrder());
        await updateBand(b.id, {
          story: fSeries.trim() || null,
          start_ref: fStart.trim() ? parseStoryTime(fStart) : null,
          end_ref: fEnd.trim() ? parseStoryTime(fEnd) : null,
        });
      } else if (adding === "note") {
        if (!fBody.trim()) { setErr("Write the note."); return; }
        const n = await createNote(worldId, 40, 40, true);
        await updateNote(n.id, { body: fBody.trim(), band_id: fVol || null, chapter_ids: [], plan_ref: null });
      }
      resetForm(); await reload();
    } catch (x) { setErr(String(x)); }
  }
  async function setRange(b: Band, patch: Partial<Pick<Band, "start_ref" | "end_ref" | "name">>) {
    setBands((prev) => prev.map((z) => z.id === b.id ? { ...z, ...patch } : z));
    try { await updateBand(b.id, patch); } catch (x) { setErr(String(x)); }
  }
  async function delVolume(b: Band) {
    if (!confirm(`Delete volume "${b.name}"? Its chapters stay in the manuscript. Recoverable.`)) return;
    try { await softDeleteBand(b.id); await reload(); } catch (x) { setErr(String(x)); }
  }
  async function delNote(id: string) { try { await softDeleteNote(id); await reload(); } catch (x) { setErr(String(x)); } }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading world timeline…</p>;

  const addBtn = (k: Exclude<Adding, null>, label: string) => (
    <button className={adding === k ? "primary" : ""} onClick={() => { resetForm(); setAdding(k); }}>{label}</button>
  );

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
        <h2 className="scope-title" style={{ margin: 0 }}>World Timeline</h2>
        <span className="spacer" />
        {addBtn("series", "+ Series")}
        {addBtn("volume", "+ Volume")}
        {addBtn("note", "+ Note")}
      </div>
      <p className="scope-sub" style={{ marginBottom: 12 }}>The whole world on one clock. You compose it — add a series, give a volume its years, hang notes and chapters where they belong.</p>

      {adding && (
        <div className="card" style={{ padding: 10, marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {adding === "series" && <input autoFocus placeholder="Series name (e.g. The Age of Rot)" value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: 240 }} />}
          {adding === "volume" && <>
            <input autoFocus placeholder="Volume name" value={fName} onChange={(e) => setFName(e.target.value)} style={{ width: 160 }} />
            <input list="wt-series" placeholder="series…" value={fSeries} onChange={(e) => setFSeries(e.target.value)} style={{ width: 150 }} />
            <datalist id="wt-series">{knownSeries.filter((s) => s !== MAIN).map((s) => <option key={s} value={s} />)}</datalist>
            <input placeholder="start yr" value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ width: 90 }} />
            <span className="muted">→</span>
            <input placeholder="end yr" value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ width: 90 }} />
          </>}
          {adding === "note" && <>
            <input autoFocus placeholder="Note…" value={fBody} onChange={(e) => setFBody(e.target.value)} style={{ width: 260 }} />
            <select className="sel" value={fVol} onChange={(e) => setFVol(e.target.value)} style={{ width: 180 }}>
              <option value="">attach to a volume…</option>
              {bands.map((b) => <option key={b.id} value={b.id}>{seriesOf(b)} · {b.name}</option>)}
            </select>
          </>}
          <button className="primary" onClick={submit}>Add</button>
          <button onClick={resetForm}>Cancel</button>
        </div>
      )}

      {!domain ? (
        <div className="card" style={{ padding: 18 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Your world clock is empty.</p>
          <p className="muted" style={{ marginTop: 6 }}>Add a <b>series</b>, then a <b>volume</b> with a start and end year — it'll draw as a bar on the ruler. Chapters you've dated and filed into a volume show up as ticks inside it.</p>
        </div>
      ) : (
        <div className="wt-chart">
          {/* parking bay for undated / unfiled chapters */}
          <div className="wt-parking">
            <div className="wt-parklab">unplaced</div>
            {parkedChapters.length === 0 && <span className="faint" style={{ fontSize: 11 }}>—</span>}
            {parkedChapters.map((c) => (
              <div key={c.id} className="wt-block" onClick={() => go({ scope: "manuscript", chapterId: c.id })} title={`${c.title} — open to date it / file it in a volume`}>
                {c.planned ? "✎" : String(c.manuscript_order).padStart(2, "0")}<br /><span style={{ fontSize: 9.5 }}>{c.title.length > 14 ? c.title.slice(0, 14) + "…" : c.title}</span>
              </div>
            ))}
          </div>

          {/* plot: ruler + gridlines + series lanes */}
          <div className="wt-plot">
            <div className="wt-ruler">
              {ticks.map((t) => (
                <span key={t} className="wt-major" style={{ left: xPct(t) + "%" }}>{t}</span>
              ))}
            </div>
            <div className="wt-lanes">
              {ticks.map((t) => <div key={"g" + t} className="wt-grid" style={{ left: xPct(t) + "%" }} />)}

              {lanes.map((lane) => (
                <div key={lane.name} className="wt-lane" style={{ height: LANE_HEAD + lane.vols.length * VOL_ROW + LANE_PAD }}>
                  <div className="wt-serieslab">{lane.name}</div>
                  {(() => {
                    const rs = lane.vols.map(rangeOf).filter(Boolean) as [number, number][];
                    if (!rs.length) return null;
                    const lo = Math.min(...rs.map((r) => r[0])), hi = Math.max(...rs.map((r) => r[1]));
                    return <div className="wt-seriesbar" style={{ left: xPct(lo) + "%", width: (xPct(hi) - xPct(lo)) + "%", top: LANE_HEAD - 4 }} />;
                  })()}
                  {lane.vols.map((v, i) => {
                    const r = rangeOf(v), tint = tintOf(v), top = LANE_HEAD + i * VOL_ROW + 6;
                    const chs = chapters.filter((c) => c.band_id === v.id);
                    const vnotes = notes.filter((n) => n.band_id === v.id && n.on_timeline);
                    if (!r) {
                      return (
                        <div key={v.id} className="wt-volunset" style={{ top }}>
                          <input className="wt-volname" value={v.name} onChange={(e) => setRange(v, { name: e.target.value })} style={{ color: tint }} />
                          <input className="wt-yr" placeholder="start" onBlur={(e) => e.target.value && setRange(v, { start_ref: parseStoryTime(e.target.value) })} />
                          <span className="muted">→</span>
                          <input className="wt-yr" placeholder="end" onBlur={(e) => e.target.value && setRange(v, { end_ref: parseStoryTime(e.target.value) })} />
                          <span className="wt-x" onClick={() => delVolume(v)}>✕</span>
                        </div>
                      );
                    }
                    const left = xPct(r[0]), width = Math.max(xPct(r[1]) - xPct(r[0]), 1.5);
                    return (
                      <div key={v.id}>
                        <span className="wt-vollab" style={{ left: left + "%", top: top - 15, color: tint }}>
                          {v.name} <span className="faint" style={{ fontSize: 10 }}>{r[0]}–{r[1]}</span>
                          <span className="wt-x" onClick={() => delVolume(v)}>✕</span>
                        </span>
                        <div className="wt-vol" style={{ left: left + "%", width: width + "%", top, background: tint }} title={`${v.name} · ${r[0]}–${r[1]}`} />
                        {chs.map((c, ci) => {
                          const cx = c.story_time_ref != null ? xPct(c.story_time_ref) : left + (width * (ci + 1)) / (chs.length + 1);
                          return <div key={c.id} className="wt-tick" style={{ left: cx + "%", top: top - 2, borderStyle: c.planned ? "dashed" : "solid" }}
                            title={`${c.planned ? "planned · " : ""}${c.title}${c.story_time_ref != null ? " · " + (c.story_time_label ?? c.story_time_ref) : ""}`}
                            onClick={() => go({ scope: "manuscript", chapterId: c.id })} />;
                        })}
                        {vnotes.map((n, ni) => (
                          <span key={n.id} className="wt-note" style={{ left: `calc(${left}% + ${ni * 16}px)`, top: top + 8 }} title={n.body}>
                            ✎<span className="wt-x" onClick={() => delNote(n.id)}>✕</span>
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// round, human tick values across [min,max]
function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min; if (span <= 0) return [Math.round(min)];
  const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) out.push(Math.round(t));
  return [...new Set(out)];
}
