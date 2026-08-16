import { useEffect, useMemo, useState } from "react";
import {
  getDeletedEntities, getDeletedChapters, getDeletedWorlds,
  getDeletedNotes, getDeletedComments,
  restoreEntity, restoreChapter, restoreWorld, restoreNote, restoreComment,
  purgeTrashItem, purgeNote, purgeComment,
  type DeletedNote, type DeletedComment,
} from "../lib/api";
import type { Entity, Chapter, World } from "../lib/types";
import { Icon } from "../components/icons";
import { Skeleton } from "../components/Skeleton";
import { confirmDialog } from "../components/confirm";

const PURGE_DAYS = 30;
const DAY = 86_400_000;

// Days until a soft-deleted row is auto-purged (migration 0022 runs daily).
function daysLeft(deletedAt?: string | null): number | null {
  if (!deletedAt) return null;
  const gone = Date.parse(deletedAt);
  if (Number.isNaN(gone)) return null;
  return Math.max(0, PURGE_DAYS - Math.floor((Date.now() - gone) / DAY));
}
function countdownLabel(deletedAt?: string | null): string {
  const d = daysLeft(deletedAt);
  if (d == null) return "";
  if (d === 0) return "clears within a day";
  if (d === 1) return "clears in 1 day";
  return `clears in ${d} days`;
}

// Recover soft-deleted things — or erase them for good. Nothing is truly gone on
// delete; it lands here, stays recoverable, and is auto-purged after 30 days.
// Entities/chapters are scoped to the current world; deleted worlds are account-wide.
export function Trash({ worldId, onWorldsChanged }: { worldId: string; onWorldsChanged: () => void }) {
  const [ents, setEnts] = useState<Entity[]>([]);
  const [chaps, setChaps] = useState<Chapter[]>([]);
  const [notes, setNotes] = useState<DeletedNote[]>([]);
  const [comments, setComments] = useState<DeletedComment[]>([]);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try {
      const [e, c, n, cm, w] = await Promise.all([
        getDeletedEntities(worldId), getDeletedChapters(worldId), getDeletedNotes(worldId), getDeletedComments(worldId), getDeletedWorlds(),
      ]);
      setEnts(e); setChaps(c); setNotes(n); setComments(cm); setWorlds(w); setLoaded(true);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  async function undoEntity(id: string) {
    try { await restoreEntity(id); setEnts((p) => p.filter((e) => e.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoChapter(id: string) {
    try { await restoreChapter(id); setChaps((p) => p.filter((c) => c.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoNote(id: string) {
    try { await restoreNote(id); setNotes((p) => p.filter((n) => n.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoComment(id: string) {
    try { await restoreComment(id); setComments((p) => p.filter((c) => c.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoWorld(id: string) {
    try { await restoreWorld(id); setWorlds((p) => p.filter((w) => w.id !== id)); onWorldsChanged(); } catch (x) { setErr(String(x)); }
  }

  type Kind = "entity" | "chapter" | "note" | "comment" | "world";
  async function purge(kind: Kind, id: string, name: string) {
    const worldWarn = kind === "world"
      ? "\n\nEverything inside it — every entity, chapter, relationship and note — is erased too."
      : "";
    if (!(await confirmDialog({
      title: "Delete forever",
      message: `Permanently erase ${name ? `“${name}”` : "this item"}?${worldWarn}\n\nThis cannot be undone.`,
      confirmLabel: "Delete forever", tone: "danger",
    }))) return;
    setBusy(id);
    try {
      // Entities/chapters/worlds purge server-side (they have children); notes and
      // comments are leaf rows, deleted directly under RLS.
      if (kind === "note") { await purgeNote(id); setNotes((p) => p.filter((n) => n.id !== id)); }
      else if (kind === "comment") { await purgeComment(id); setComments((p) => p.filter((c) => c.id !== id)); }
      else {
        await purgeTrashItem(kind, id);
        if (kind === "entity") setEnts((p) => p.filter((e) => e.id !== id));
        else if (kind === "chapter") setChaps((p) => p.filter((c) => c.id !== id));
        else { setWorlds((p) => p.filter((w) => w.id !== id)); onWorldsChanged(); }
      }
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

  const preview = (s?: string | null) => { const t = (s || "").replace(/<[^>]*>/g, " ").trim(); return t.length > 60 ? t.slice(0, 60) + "…" : (t || "(empty)"); };
  const ql = q.trim().toLowerCase();
  const fEnts = useMemo(() => ents.filter((e) => !ql || e.title.toLowerCase().includes(ql) || e.type.toLowerCase().includes(ql)), [ents, ql]);
  const fChaps = useMemo(() => chaps.filter((c) => !ql || c.title.toLowerCase().includes(ql)), [chaps, ql]);
  const fNotes = useMemo(() => notes.filter((n) => !ql || (n.body || "").toLowerCase().includes(ql)), [notes, ql]);
  const fComments = useMemo(() => comments.filter((c) => !ql || (c.body || "").toLowerCase().includes(ql) || (c.quote || "").toLowerCase().includes(ql)), [comments, ql]);
  const fWorlds = useMemo(() => worlds.filter((w) => !ql || w.name.toLowerCase().includes(ql)), [worlds, ql]);

  if (err) return <p className="err">{err}</p>;
  if (!loaded) {
    return (
      <div className="card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="row" key={i} style={{ borderBottom: i === 3 ? "none" : undefined }}>
            <Skeleton w={54} h={18} r={999} style={{ flex: "0 0 auto" }} />
            <Skeleton w={`${40 + i * 8}%`} h={14} />
            <span className="spacer" style={{ flex: 1 }} />
            <Skeleton w={70} h={24} r={8} />
          </div>
        ))}
      </div>
    );
  }

  const total = ents.length + chaps.length + notes.length + comments.length + worlds.length;
  const shown = fEnts.length + fChaps.length + fNotes.length + fComments.length + fWorlds.length;
  const empty = total === 0;

  const purgeBtn = (kind: Kind, id: string, name: string) => (
    <span className="trash-forever" title="Delete forever" onClick={() => busy !== id && purge(kind, id, name)}
      style={{ opacity: busy === id ? 0.5 : 1 }}>
      <Icon name="trash" size={13} /> Delete forever
    </span>
  );

  return (
    <div className="trash-root">
      {!empty && (
        <div className="searchwrap trash-search">
          <span className="ic"><Icon name="search" size={15} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trash…" />
        </div>
      )}

      <div className="trash-scroll">
      {empty && <div className="card"><div className="row"><span className="muted">Nothing deleted. Trash is empty.</span></div></div>}
      {!empty && shown === 0 && <div className="card"><div className="row"><span className="muted">No trashed items match “{q}”.</span></div></div>}

      {fEnts.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 8 }}>Entities · this world</div>
          <div className="card">
            {fEnts.map((e) => (
              <div className="row" key={e.id}>
                <span className="chip">{e.type}</span>
                <span className="title-serif" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                <span className="faint trash-when">{countdownLabel(e.deleted_at)}</span>
                {purgeBtn("entity", e.id, e.title)}
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoEntity(e.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {fChaps.length > 0 && (
        <>
          <div className="label">Chapters · this world</div>
          <div className="card">
            {fChaps.map((c) => (
              <div className="row" key={c.id}>
                <span className="title-serif" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <span className="faint trash-when">{countdownLabel(c.deleted_at)}</span>
                {purgeBtn("chapter", c.id, c.title)}
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoChapter(c.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {fNotes.length > 0 && (
        <>
          <div className="label">Notes · this world</div>
          <div className="card">
            {fNotes.map((n) => (
              <div className="row" key={n.id}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(n.body)}</span>
                <span className="faint trash-when">{countdownLabel(n.deleted_at)}</span>
                {purgeBtn("note", n.id, preview(n.body))}
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoNote(n.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {fComments.length > 0 && (
        <>
          <div className="label">Comments · this world</div>
          <div className="card">
            {fComments.map((c) => (
              <div className="row" key={c.id}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(c.body)}</span>
                <span className="faint trash-when">{countdownLabel(c.deleted_at)}</span>
                {purgeBtn("comment", c.id, preview(c.body))}
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoComment(c.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {fWorlds.length > 0 && (
        <>
          <div className="label">Worlds · your account</div>
          <div className="card">
            {fWorlds.map((w) => (
              <div className="row" key={w.id}>
                <span className="title-serif" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
                <span className="faint trash-when">{countdownLabel(w.deleted_at)}</span>
                {purgeBtn("world", w.id, w.name)}
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoWorld(w.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
