import { useEffect, useMemo, useState } from "react";
import {
  getDeletedEntities, getDeletedChapters, getDeletedWorlds,
  restoreEntity, restoreChapter, restoreWorld, purgeTrashItem,
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
  const [worlds, setWorlds] = useState<World[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    try {
      const [e, c, w] = await Promise.all([
        getDeletedEntities(worldId), getDeletedChapters(worldId), getDeletedWorlds(),
      ]);
      setEnts(e); setChaps(c); setWorlds(w); setLoaded(true);
    } catch (x) { setErr(String(x)); }
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [worldId]);

  async function undoEntity(id: string) {
    try { await restoreEntity(id); setEnts((p) => p.filter((e) => e.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoChapter(id: string) {
    try { await restoreChapter(id); setChaps((p) => p.filter((c) => c.id !== id)); } catch (x) { setErr(String(x)); }
  }
  async function undoWorld(id: string) {
    try { await restoreWorld(id); setWorlds((p) => p.filter((w) => w.id !== id)); onWorldsChanged(); } catch (x) { setErr(String(x)); }
  }

  async function purge(kind: "entity" | "chapter" | "world", id: string, name: string) {
    const worldWarn = kind === "world"
      ? "\n\nEverything inside it — every entity, chapter, relationship and note — is erased too."
      : "";
    if (!(await confirmDialog({
      title: "Delete forever",
      message: `Permanently erase “${name}”?${worldWarn}\n\nThis cannot be undone.`,
      confirmLabel: "Delete forever", tone: "danger",
    }))) return;
    setBusy(id);
    try {
      await purgeTrashItem(kind, id);
      if (kind === "entity") setEnts((p) => p.filter((e) => e.id !== id));
      else if (kind === "chapter") setChaps((p) => p.filter((c) => c.id !== id));
      else { setWorlds((p) => p.filter((w) => w.id !== id)); onWorldsChanged(); }
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

  const ql = q.trim().toLowerCase();
  const fEnts = useMemo(() => ents.filter((e) => !ql || e.title.toLowerCase().includes(ql) || e.type.toLowerCase().includes(ql)), [ents, ql]);
  const fChaps = useMemo(() => chaps.filter((c) => !ql || c.title.toLowerCase().includes(ql)), [chaps, ql]);
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

  const total = ents.length + chaps.length + worlds.length;
  const shown = fEnts.length + fChaps.length + fWorlds.length;
  const empty = total === 0;

  const purgeBtn = (kind: "entity" | "chapter" | "world", id: string, name: string) => (
    <span className="trash-forever" title="Delete forever" onClick={() => busy !== id && purge(kind, id, name)}
      style={{ opacity: busy === id ? 0.5 : 1 }}>
      <Icon name="trash" size={13} /> Delete forever
    </span>
  );

  return (
    <div>
      {!empty && (
        <div className="searchwrap trash-search">
          <span className="ic"><Icon name="search" size={15} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trash…" />
        </div>
      )}

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
  );
}
