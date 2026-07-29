import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getMyWorlds, createWorld, softDeleteWorld, renameWorld, seedSampleWorld } from "./lib/api";
import type { World } from "./lib/types";
import { AuthGate } from "./auth/AuthGate";
import { Library } from "./views/Library";
import { Relationships } from "./views/Relationships";
import { Manuscript } from "./views/Manuscript";
import { WorldTimeline } from "./views/WorldTimeline";
import { Notes } from "./views/Notes";
import { Overview } from "./views/Overview";
import { Settings } from "./views/Settings";
import { SearchResults } from "./views/SearchResults";
import { Palette } from "./views/Palette";
import { getStoredTheme, setTheme, type Theme } from "./lib/theme";
import { PanelToggleIcon } from "./components/SidePanel";
import { Icon, ICON_SIZE, type IconName } from "./components/icons";
import { ConfirmHost } from "./components/confirm";
import { Spinner } from "./components/Skeleton";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";

const THEME_CYCLE: Theme[] = ["paper", "grey", "dark", "system"];
const THEME_ICON: Record<Theme, IconName> = { paper: "theme-paper", grey: "theme-grey", dark: "theme-dark", system: "theme-system" };
const THEME_LABEL: Record<Theme, string> = { paper: "Paper", grey: "Grey", dark: "Dark", system: "System" };

export function App() {
  return (
    <>
      <AuthGate>{(session) => <Workspace session={session} />}</AuthGate>
      <ConfirmHost />
    </>
  );
}

type Scope = "overview" | "library" | "manuscript" | "timeline" | "relationships" | "notes" | "settings";
export interface Nav { scope: Scope; entityId?: string; chapterId?: string; openImport?: boolean }

// The rail is split write-first: the everyday writing tools up top, the
// analysis tools (timeline, relationships) under a divider — so a newcomer
// isn't met with a flat wall of seven equal sections.
const RAIL_CORE: [Scope, string, IconName][] = [
  ["overview", "Overview", "overview"],
  ["manuscript", "Manuscript", "manuscript"],
  ["library", "Collection", "library"],
  ["notes", "Notes", "notes"],
];
const RAIL_MORE: [Scope, string, IconName][] = [
  ["timeline", "Timeline", "timeline"],
  ["relationships", "Relationships", "relationships"],
];

// Label + icon per scope, for the breadcrumb trail (settings isn't in the rail).
const SCOPE_META: Record<Scope, { label: string; icon: IconName }> = {
  overview: { label: "Overview", icon: "overview" },
  library: { label: "Collection", icon: "library" },
  manuscript: { label: "Manuscript", icon: "manuscript" },
  timeline: { label: "Timeline", icon: "timeline" },
  relationships: { label: "Relationships", icon: "relationships" },
  notes: { label: "Notes", icon: "notes" },
  settings: { label: "Settings", icon: "settings" },
};

// A leaf a view opens inside itself (a chapter, an entity) — reported up so the
// trail can show it and route back. onClear closes the leaf within the view.
export interface LeafCrumb { label: string; onClear: () => void }

function Workspace({ session }: { session: Session }) {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [nav, setNav] = useState<Nav>({ scope: "overview" });
  const [leaf, setLeaf] = useState<LeafCrumb | null>(null); // chapter/entity open inside a view
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renamingWorld, setRenamingWorld] = useState(false);
  const [worldNameDraft, setWorldNameDraft] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem("k.rail") === "1");
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const appearanceRef = useRef<HTMLDivElement>(null);

  function toggleRail() {
    setRailCollapsed((v) => { const n = !v; localStorage.setItem("k.rail", n ? "1" : ""); return n; });
  }
  function pickTheme(next: Theme) { setTheme(next); setThemeState(next); setAppearanceOpen(false); }

  useEffect(() => {
    let alive = true;
    getMyWorlds()
      .then(async (w) => {
        if (!alive) return;
        // First-ever visit with nothing here → seed the example world so the
        // first thing a new writer sees is a full, explorable world.
        if (w.length === 0 && !localStorage.getItem("k.onboarded")) {
          setSeeding(true);
          try {
            const id = await seedSampleWorld();
            localStorage.setItem("k.onboarded", "1");
            const w2 = await getMyWorlds();
            if (!alive) return;
            setWorlds(w2);
            setWorldId(w2.find((x) => x.id === id)?.id ?? w2[0]?.id ?? null);
          } catch {
            if (alive) { setWorlds(w); setWorldId(null); } // seeding failed → empty state
          } finally {
            if (alive) setSeeding(false);
          }
          return;
        }
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

  useEffect(() => {
    if (!appearanceOpen) return;
    const h = (e: MouseEvent) => { if (appearanceRef.current && !appearanceRef.current.contains(e.target as Node)) setAppearanceOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [appearanceOpen]);

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
      localStorage.setItem("k.onboarded", "1");
      setWorlds((prev) => [...(prev ?? []), w]);
      setWorldId(w.id);
    } catch (x) { setErr(String(x)); }
  }

  // Re-add the seeded example world on demand (world switcher / empty state).
  async function loadExample() {
    setSeeding(true);
    try {
      const id = await seedSampleWorld();
      localStorage.setItem("k.onboarded", "1");
      const w = await getMyWorlds();
      setWorlds(w);
      setWorldId(id);
      go({ scope: "overview" });
    } catch (x) { setErr(String(x)); } finally { setSeeding(false); }
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

  function go(n: Nav) { setQuery(""); setLeaf(null); setNav(n); }

  if (!worlds) return (
    <div className="center">
      <Spinner size={26} />
      <span className="muted">{seeding ? "Building your example world — Sherlock Holmes, fully populated…" : "Loading your worlds…"}</span>
    </div>
  );

  const searching = query.trim().length >= 2;

  // Breadcrumb trail: Overview › Section › Leaf. Empty on the bare dashboard.
  const crumbs: Crumb[] = [];
  if (searching) {
    crumbs.push({ label: "Overview", icon: "overview", onClick: () => go({ scope: "overview" }) });
    crumbs.push({ label: `“${query.trim()}”`, icon: "search" });
  } else if (nav.scope !== "overview") {
    const m = SCOPE_META[nav.scope];
    crumbs.push({ label: "Overview", icon: "overview", onClick: () => go({ scope: "overview" }) });
    // The section crumb closes an open leaf when there is one; otherwise it's the current page.
    crumbs.push({ label: m.label, icon: m.icon, onClick: leaf ? leaf.onClear : undefined });
    if (leaf) crumbs.push({ label: leaf.label });
  }

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
                  {worlds.map((w) => <option key={w.id} value={w.id}>{w.name}{w.is_sample ? "  · Example" : ""}</option>)}
                </select>
              ) : <span style={{ fontWeight: 600 }}>Kronicler</span>}
              {worldId && !renamingWorld && (
                <span title="Rename this world" onClick={startRename}
                  style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex", padding: "0 2px" }}><Icon name="edit" size={ICON_SIZE.sm} /></span>
              )}
              {!renamingWorld && (
                <span title="New world" onClick={makeWorld}
                  style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex", padding: "0 2px" }}><Icon name="plus" size={ICON_SIZE.md} /></span>
              )}
              {!renamingWorld && !worlds.some((w) => w.is_sample) && (
                <span title="Load the example world (Sherlock Holmes)" onClick={() => !seeding && loadExample()}
                  style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex", padding: "0 2px", opacity: seeding ? 0.5 : 1 }}><Icon name="book" size={ICON_SIZE.md} /></span>
              )}
            </div>
            <div className="searchwrap">
              <span className="ic"><Icon name="search" size={ICON_SIZE.md} /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search world content — try a name, a place, a line…" />
            </div>
            <div className="kbtn" onClick={() => setPaletteOpen(true)}>
              <span className="kbd">⌘K</span> Jump or create
            </div>
            <div className="appearance" ref={appearanceRef}>
              <button className="appearance-btn" title={`Appearance: ${THEME_LABEL[theme]}`} aria-label="Appearance"
                aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen((v) => !v)}>
                <Icon name={THEME_ICON[theme]} size={ICON_SIZE.md} />
              </button>
              {appearanceOpen && (
                <div className="appearance-pop" role="menu">
                  <div className="appearance-poplab">Appearance</div>
                  {THEME_CYCLE.map((t) => (
                    <button key={t} role="menuitemradio" aria-checked={t === theme}
                      className={"appearance-opt" + (t === theme ? " on" : "")} onClick={() => pickTheme(t)}>
                      <Icon name={THEME_ICON[t]} size={ICON_SIZE.md} /> <span>{THEME_LABEL[t]}</span>
                      {t === theme && <span className="appearance-check"><Icon name="check" size={13} /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shellbody">
            {/* rail */}
            <div className={"rail" + (railCollapsed ? " rail-collapsed" : "")}>
              <div className="rail-top">
                <button className="rail-toggle-btn" onClick={toggleRail}
                  title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
                  <PanelToggleIcon size={16} />
                </button>
              </div>
              {RAIL_CORE.map(([s, label, g]) => (
                <div key={s} className={"railitem" + (!searching && nav.scope === s ? " on" : "")}
                  onClick={() => go({ scope: s })} title={railCollapsed ? label : undefined}>
                  <span className="g"><Icon name={g} size={ICON_SIZE.lg} /></span>{!railCollapsed && label}
                </div>
              ))}
              <div className="rail-div" />
              {RAIL_MORE.map(([s, label, g]) => (
                <div key={s} className={"railitem" + (!searching && nav.scope === s ? " on" : "")}
                  onClick={() => go({ scope: s })} title={railCollapsed ? label : undefined}>
                  <span className="g"><Icon name={g} size={ICON_SIZE.lg} /></span>{!railCollapsed && label}
                </div>
              ))}
              <div className="spacer" />
              <div className="railfoot">
                <div className={"railitem" + (!searching && nav.scope === "settings" ? " on" : "")}
                  onClick={() => go({ scope: "settings" })} title={railCollapsed ? "Settings" : undefined}>
                  <span className="g"><Icon name="settings" size={ICON_SIZE.lg} /></span>{!railCollapsed && "Settings"}
                </div>
                <div className="railitem" onClick={() => supabase.auth.signOut()}
                  title={railCollapsed ? "Sign out" : (session.user.email ?? "Sign out")}>
                  <span className="g"><Icon name="logout" size={ICON_SIZE.lg} /></span>{!railCollapsed && "Sign out"}
                </div>
              </div>
            </div>

            {/* main */}
            <div className="main">
              {session.user.is_anonymous && (
                <div className="guest-banner">
                  <Icon name="book" size={15} />
                  <span>You're exploring as a <b>guest</b> — this world lives only in this browser.</span>
                  <button onClick={() => go({ scope: "settings" })}>Add an email to keep it</button>
                </div>
              )}
              {err && <p className="err">{err}</p>}
              {worldId && <Breadcrumb items={crumbs} />}
              {!worldId ? (
                <div className="empty-hero">
                  <h2 className="scope-title" style={{ marginBottom: 6 }}>Start your first world</h2>
                  <p className="scope-sub" style={{ maxWidth: 460 }}>
                    A world holds your cast, your chapters, your timeline, and the web of who-knows-what.
                    Begin from scratch, or explore a finished example first.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    <button className="primary" onClick={makeWorld}>Create a world</button>
                    <button onClick={loadExample} disabled={seeding} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {seeding ? <Spinner size={13} /> : <Icon name="book" size={14} />} Explore the example (Sherlock Holmes)
                    </button>
                  </div>
                </div>
              ) : searching ? (
                <SearchResults key={worldId} worldId={worldId} query={query} go={go} />
              ) : nav.scope === "overview" ? (
                <Overview worldId={worldId} go={go} />
              ) : nav.scope === "library" ? (
                <Library key={worldId + (nav.entityId ?? "")} worldId={worldId} focusEntityId={nav.entityId} onLeaf={setLeaf} />
              ) : nav.scope === "manuscript" ? (
                <Manuscript key={worldId + (nav.chapterId ?? "")} worldId={worldId} focusChapterId={nav.chapterId} openImport={nav.openImport} go={go} onLeaf={setLeaf} />
              ) : nav.scope === "timeline" ? (
                <WorldTimeline key={worldId} worldId={worldId} go={go} />
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
      </div>

      {paletteOpen && worldId && (
        <Palette worldId={worldId} close={() => setPaletteOpen(false)} go={(n) => { setPaletteOpen(false); go(n); }} onCreateWorld={makeWorld} />
      )}
    </div>
  );
}
