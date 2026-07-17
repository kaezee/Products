import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getMyWorlds, createWorld, softDeleteWorld, renameWorld } from "./lib/api";
import type { World } from "./lib/types";
import { AuthGate } from "./auth/AuthGate";
import { Library } from "./views/Library";
import { Relationships } from "./views/Relationships";
import { Manuscript } from "./views/Manuscript";
import { Notes } from "./views/Notes";
import { Overview } from "./views/Overview";
import { Settings } from "./views/Settings";
import { SearchResults } from "./views/SearchResults";
import { Palette } from "./views/Palette";

export function App() {
  return <AuthGate>{(session) => <Workspace session={session} />}</AuthGate>;
}

type Scope = "overview" | "library" | "manuscript" | "relationships" | "notes" | "settings";
export interface Nav { scope: Scope; entityId?: string; chapterId?: string }

const RAIL: [Scope, string, string][] = [
  ["overview", "Overview", "◫"],
  ["library", "Library", "❖"],
  ["manuscript", "Manuscript", "▤"],
  ["relationships", "Relationships", "✳"],
  ["notes", "Notes", "✎"],
];

function Workspace({ session }: { session: Session }) {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ scope: "overview" });
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renamingWorld, setRenamingWorld] = useState(false);
  const [worldNameDraft, setWorldNameDraft] = useState("");

  useEffect(() => {
    let alive = true;
    getMyWorlds()
      .then((w) => {
        if (!alive) return;
        setWorlds(w);
        setWorldId((cur) => cur ?? w[0]?.id ?? null);
      })
      .catch((x) => alive && setErr(String(x)));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function reloadWorlds() {
    try {
      const w = await getMyWorlds();
      setWorlds(w);
      setWorldId((cur) => cur ?? w[0]?.id ?? null);
    } catch (x) { setErr(String(x)); }
  }

  async function makeWorld() {
    const name = prompt("Name your world");
    if (!name) return;
    try {
      const w = await createWorld(name);
      setWorlds((prev) => [...(prev ?? []), w]);
      setWorldId(w.id);
    } catch (x) { setErr(String(x)); }
  }

  function startRename() {
    const cur = worlds?.find((w) => w.id === worldId);
    setWorldNameDraft(cur?.name ?? "");
    setRenamingWorld(true);
  }
  async function commitRename() {
    if (!renamingWorld || !worldId) return;
    setRenamingWorld(false);
    const name = worldNameDraft.trim();
    const cur = worlds?.find((w) => w.id === worldId);
    if (!name || name === cur?.name) return;
    try {
      await renameWorld(worldId, name);
      setWorlds((prev) => (prev ?? []).map((w) => (w.id === worldId ? { ...w, name } : w)));
    } catch (x) { setErr(String(x)); }
  }

  async function deleteWorld(id: string) {
    try {
      await softDeleteWorld(id);
      const remaining = (worlds ?? []).filter((w) => w.id !== id);
      setWorlds(remaining);
      if (worldId === id) setWorldId(remaining[0]?.id ?? null);
      go({ scope: "overview" });
    } catch (x) { setErr(String(x)); }
  }

  function go(n: Nav) { setQuery(""); setNav(n); }

  if (!worlds) return <div className="center"><span className="muted">Loading…</span></div>;

  const searching = query.trim().length >= 2;

  return (
    <div className="page">
      <div className="shell">
        <div className="shellcard">
          {/* chrome */}
          <div className="chrome">
            <div className="worldchip" title="Worlds">
              <span className="k">K</span>
              {renamingWorld && worldId ? (
                <input autoFocus value={worldNameDraft}
                  onChange={(e) => setWorldNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingWorld(false); }}
                  onBlur={commitRename}
                  style={{ border: "none", background: "transparent", fontWeight: 600, padding: 0, width: 130, fontSize: 13 }} />
              ) : worlds.length > 0 ? (
                <select value={worldId ?? ""} onChange={(e) => setWorldId(e.target.value)}
                  style={{ border: "none", background: "transparent", fontWeight: 600, padding: 0, cursor: "pointer" }}>
                  {worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              ) : <span style={{ fontWeight: 600 }}>Kronicler</span>}
              {worldId && !renamingWorld && (
                <span title="Rename this world" onClick={startRename}
                  style={{ cursor: "pointer", color: "var(--muted)", fontSize: 12.5, padding: "0 2px" }}>✎</span>
              )}
              {!renamingWorld && (
                <span title="New world" onClick={makeWorld}
                  style={{ cursor: "pointer", color: "var(--muted)", fontSize: 15, padding: "0 2px" }}>＋</span>
              )}
            </div>
            <div className="searchwrap">
              <span className="ic">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search world content — try a name, a place, a line…" />
            </div>
            <div className="kbtn" onClick={() => setPaletteOpen(true)}>
              <span className="kbd">⌘K</span> Jump or create
            </div>
          </div>

          <div className="shellbody">
            {/* rail */}
            <div className="rail">
              {RAIL.map(([s, label, g]) => (
                <div key={s} className={"railitem" + (!searching && nav.scope === s ? " on" : "")} onClick={() => go({ scope: s })}>
                  <span className="g">{g}</span>{label}
                </div>
              ))}
              <div className="spacer" />
              <div className="railfoot">
                <div className={"railitem" + (!searching && nav.scope === "settings" ? " on" : "")} onClick={() => go({ scope: "settings" })}>
                  <span className="g">⚙</span>Settings
                </div>
                <div className="railitem" title={session.user.email ?? ""}>
                  <span className="g">◐</span>Account
                  <span className="spacer" />
                  <span className="muted" style={{ cursor: "pointer" }} onClick={() => supabase.auth.signOut()}>out</span>
                </div>
              </div>
            </div>

            {/* main */}
            <div className="main">
              {err && <p className="err">{err}</p>}
              {!worldId ? (
                <div className="card"><div className="row"><span className="muted">
                  No worlds yet — hit the K chip up top to create one. It seeds your starter vocabulary automatically.
                </span></div></div>
              ) : searching ? (
                <SearchResults key={worldId} worldId={worldId} query={query} go={go} />
              ) : nav.scope === "overview" ? (
                <Overview worldId={worldId} go={go} />
              ) : nav.scope === "library" ? (
                <Library key={worldId + (nav.entityId ?? "")} worldId={worldId} focusEntityId={nav.entityId} />
              ) : nav.scope === "manuscript" ? (
                <Manuscript key={worldId + (nav.chapterId ?? "")} worldId={worldId} focusChapterId={nav.chapterId} go={go} />
              ) : nav.scope === "notes" ? (
                <Notes key={worldId} worldId={worldId} />
              ) : nav.scope === "settings" ? (
                <Settings
                  worldId={worldId}
                  worldName={worlds.find((w) => w.id === worldId)?.name ?? "this world"}
                  userEmail={session.user.email ?? ""}
                  onDeleteWorld={() => deleteWorld(worldId)}
                  onWorldsChanged={reloadWorlds}
                />
              ) : (
                <Relationships worldId={worldId} go={go} />
              )}
            </div>
          </div>
        </div>
        <p className="foot-note">Kronicler — {session.user.email} · raw build, design system applied</p>
      </div>

      {paletteOpen && worldId && (
        <Palette worldId={worldId} close={() => setPaletteOpen(false)} go={(n) => { setPaletteOpen(false); go(n); }} onCreateWorld={makeWorld} />
      )}
    </div>
  );
}
