import { useEffect, useState } from "react";
import {
  getDeletedEntities, getDeletedChapters, getDeletedWorlds,
  restoreEntity, restoreChapter, restoreWorld,
} from "../lib/api";
import type { Entity, Chapter, World } from "../lib/types";

// Recover soft-deleted things. Nothing in Kronicler is truly erased on delete —
// this is where it comes back. Entities/chapters are scoped to the current
// world; deleted worlds are account-wide.
export function Trash({ worldId, onWorldsChanged }: { worldId: string; onWorldsChanged: () => void }) {
  const [ents, setEnts] = useState<Entity[]>([]);
  const [chaps, setChaps] = useState<Chapter[]>([]);
  const [worlds, setWorlds] = useState<World[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  if (err) return <p className="err">{err}</p>;
  if (!loaded) return <p className="muted">Loading trash…</p>;

  const empty = ents.length === 0 && chaps.length === 0 && worlds.length === 0;

  return (
    <div>
      {empty && <div className="card"><div className="row"><span className="muted">Nothing deleted. Trash is empty.</span></div></div>}

      {ents.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 8 }}>Entities · this world</div>
          <div className="card" style={{ maxWidth: 680 }}>
            {ents.map((e) => (
              <div className="row" key={e.id}>
                <span className="chip">{e.type}</span>
                <span className="title-serif" style={{ flex: 1 }}>{e.title}</span>
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoEntity(e.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {chaps.length > 0 && (
        <>
          <div className="label">Chapters · this world</div>
          <div className="card" style={{ maxWidth: 680 }}>
            {chaps.map((c) => (
              <div className="row" key={c.id}>
                <span className="title-serif" style={{ flex: 1 }}>{c.title}</span>
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoChapter(c.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}

      {worlds.length > 0 && (
        <>
          <div className="label">Worlds · your account</div>
          <div className="card" style={{ maxWidth: 680 }}>
            {worlds.map((w) => (
              <div className="row" key={w.id}>
                <span className="title-serif" style={{ flex: 1 }}>{w.name}</span>
                <button style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => undoWorld(w.id)}>Restore</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
