import { useEffect, useState } from "react";
import {
  getBands, createBand, updateBand, softDeleteBand, setChapterBand,
  getChapters, getNotes, updateNote,
} from "../lib/api";
import type { Band, Chapter, Note } from "../lib/types";
import type { Nav } from "../App";

// The Timeline (slice 1): a world's chapters run left → right, grouped into named
// BANDS — "Novel 1", "Season 4", "the Spin-off". Planned/unwritten beats (notes
// with a 🗓 ref) sit in the future. Same world, one continuous line.
// (Character drill-down and the in-world-time toggle are the next slices.)
export function Timeline({ worldId, go }: { worldId: string; go: (n: Nav) => void }) {
  const [bands, setBands] = useState<Band[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      const [b, c, n] = await Promise.all([getBands(worldId), getChapters(worldId), getNotes(worldId)]);
      setBands(b.sort((x, y) => x.band_order - y.band_order)); setChapters(c); setNotes(n);
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { setLoading(true); void reload(); /* eslint-disable-next-line */ }, [worldId]);

  const bandIds = new Set(bands.map((b) => b.id));
  const isPlaced = (id: string | null) => !!id && bandIds.has(id);
  const chaptersIn = (bandId: string | null) =>
    chapters
      .filter((c) => (bandId === null ? !isPlaced(c.band_id) : c.band_id === bandId))
      .sort((a, b) => a.manuscript_order - b.manuscript_order);
  const notesIn = (bandId: string) => notes.filter((n) => n.band_id === bandId);
  const plannedLoose = notes.filter((n) => n.plan_ref && !isPlaced(n.band_id));
  const unsorted = chaptersIn(null);

  async function addBand() {
    const order = bands.length ? Math.max(...bands.map((b) => b.band_order)) + 1 : 0;
    try { const b = await createBand(worldId, `Band ${bands.length + 1}`, order); setBands((p) => [...p, b]); }
    catch (x) { setErr(String(x)); }
  }
  async function moveBand(b: Band, dir: -1 | 1) {
    const sorted = [...bands].sort((a, c) => a.band_order - c.band_order);
    const i = sorted.findIndex((x) => x.id === b.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const a = sorted[i], c = sorted[j];
    setBands((prev) => prev.map((x) => x.id === a.id ? { ...x, band_order: c.band_order } : x.id === c.id ? { ...x, band_order: a.band_order } : x).sort((m, n) => m.band_order - n.band_order));
    try { await Promise.all([updateBand(a.id, { band_order: c.band_order }), updateBand(c.id, { band_order: a.band_order })]); }
    catch (x) { setErr(String(x)); }
  }
  async function rename(b: Band, name: string) {
    setBands((prev) => prev.map((x) => x.id === b.id ? { ...x, name } : x));
    try { await updateBand(b.id, { name: name.trim() || "Untitled band" }); } catch (x) { setErr(String(x)); }
  }
  async function removeBand(b: Band) {
    if (!confirm(`Delete band "${b.name}"? Its chapters become unsorted — nothing is lost.`)) return;
    try { await softDeleteBand(b.id); setBands((p) => p.filter((x) => x.id !== b.id)); } catch (x) { setErr(String(x)); }
  }
  async function assignChapter(chapterId: string, bandId: string | null) {
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, band_id: bandId } : c));
    try { await setChapterBand(chapterId, bandId); } catch (x) { setErr(String(x)); }
  }
  async function assignNote(noteId: string, bandId: string | null) {
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, band_id: bandId } : n));
    try { await updateNote(noteId, { band_id: bandId }); } catch (x) { setErr(String(x)); }
  }

  if (err) return <p className="err">{err}</p>;
  if (loading) return <p className="muted">Loading timeline…</p>;

  const bandPicker = (value: string | null, onPick: (id: string | null) => void) => (
    <select className="sel" value={value ?? ""} style={{ fontSize: 10.5, padding: "1px 4px" }}
      onChange={(e) => onPick(e.target.value || null)} onClick={(e) => e.stopPropagation()}>
      <option value="">— unsorted</option>
      {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
  );

  return (
    <div className="fi">
      <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12, gap: 10 }}>
        <h2 className="scope-title" style={{ margin: 0 }}>Timeline</h2>
        <span className="faint" style={{ fontSize: 11 }}>past → future · group chapters into novels / seasons · plan the beats ahead</span>
        <span className="spacer" />
        <button onClick={addBand}>+ Band</button>
      </div>

      <div className="tl-board">
        {unsorted.length > 0 && (
          <div className="tl-band tl-band-unsorted">
            <div className="tl-band-head"><span className="tl-band-name muted">Unsorted</span><span className="faint">{unsorted.length}</span></div>
            <div className="tl-band-body">
              {unsorted.map((c) => (
                <div key={c.id} className="tl-chapter" onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                  <span className="tl-ch-no">{String(c.manuscript_order).padStart(2, "0")}</span>
                  <span className="tl-ch-title">{c.title}</span>
                  {bandPicker(c.band_id, (id) => assignChapter(c.id, id))}
                </div>
              ))}
            </div>
          </div>
        )}

        {bands.map((b, i) => (
          <div key={b.id} className="tl-band">
            <div className="tl-band-head">
              <input className="tl-band-name" value={b.name} onChange={(e) => rename(b, e.target.value)} />
              <span className="tl-band-acts">
                <span className={"tl-arrow" + (i === 0 ? " off" : "")} title="Move earlier" onClick={() => moveBand(b, -1)}>←</span>
                <span className={"tl-arrow" + (i === bands.length - 1 ? " off" : "")} title="Move later" onClick={() => moveBand(b, 1)}>→</span>
                <span className="tl-arrow" title="Delete band" onClick={() => removeBand(b)}>✕</span>
              </span>
            </div>
            <div className="tl-band-body">
              {chaptersIn(b.id).map((c) => (
                <div key={c.id} className="tl-chapter" onClick={() => go({ scope: "manuscript", chapterId: c.id })}>
                  <span className="tl-ch-no">{String(c.manuscript_order).padStart(2, "0")}</span>
                  <span className="tl-ch-title">{c.title}</span>
                  {bandPicker(c.band_id, (id) => assignChapter(c.id, id))}
                </div>
              ))}
              {notesIn(b.id).map((n) => (
                <div key={n.id} className="tl-note" title={n.body || n.plan_ref || ""}>
                  <span className="tl-note-mark">🗓</span>
                  <span className="tl-note-body">{n.plan_ref || (n.body ? n.body.slice(0, 60) : "(idea)")}</span>
                  {bandPicker(n.band_id, (id) => assignNote(n.id, id))}
                </div>
              ))}
              {chaptersIn(b.id).length === 0 && notesIn(b.id).length === 0 && (
                <span className="faint" style={{ fontSize: 11 }}>empty — assign chapters or plan a beat here</span>
              )}
            </div>
          </div>
        ))}

        {bands.length === 0 && unsorted.length === 0 && (
          <div className="muted" style={{ padding: 20 }}>No chapters yet. Add bands to shape your world's timeline, then place chapters in them.</div>
        )}

        {plannedLoose.length > 0 && (
          <div className="tl-band tl-band-planned">
            <div className="tl-band-head"><span className="tl-band-name" style={{ color: "var(--obligation)" }}>🗓 Planned &amp; future</span></div>
            <div className="tl-band-body">
              {plannedLoose.map((n) => (
                <div key={n.id} className="tl-note" title={n.body || ""}>
                  <span className="tl-note-mark">🗓</span>
                  <span className="tl-note-body">{n.plan_ref}</span>
                  {bandPicker(n.band_id, (id) => assignNote(n.id, id))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
