import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getMyWorlds, createWorld, softDeleteWorld, renameWorld, seedSampleWorld, getChapters, getEntities, getNotes } from "./lib/api";
import type { World } from "./lib/types";
import { AuthGate } from "./auth/AuthGate";
import { Library } from "./views/Library";
import { Relationships } from "./views/Relationships";
import { Manuscript } from "./views/Manuscript";
import { WorldTimeline } from "./views/WorldTimeline";
import { Overview } from "./views/Overview";
import { Settings } from "./views/Settings";
import { SearchResults } from "./views/SearchResults";
import { Palette } from "./views/Palette";
import { getStoredTheme, setTheme, type Theme } from "./lib/theme";
import { PanelToggleIcon } from "./components/SidePanel";
import { Icon, ICON_SIZE, type IconName } from "./components/icons";
import { ConfirmHost, confirmDialog } from "./components/confirm";
import { Spinner } from "./components/Skeleton";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";

const THEME_CYCLE: Theme[] = ["paper", "white", "dark", "system"];
const THEME_ICON: Record<Theme, IconName> = { paper: "theme-paper", white: "theme-white", dark: "theme-dark", system: "theme-system" };
const THEME_LABEL: Record<Theme, string> = { paper: "Paper", white: "White", dark: "Dark", system: "System" };

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
// IA restructure §1: destinations rename — Manuscript→Write, Collection→World —
// and Relationships sits above Timeline. Notes stays in the rail until §5 lands
// (it becomes an anchored object surfaced in Overview/Write, not a destination).
// IA v2 §1: exactly five destinations. Notes is no longer a rail item — it's an
// anchored object reached through the Write/World panels and Overview.
const RAIL_CORE: [Scope, string, IconName][] = [
  ["overview", "Overview", "overview"],
  ["manuscript", "Write", "manuscript"],
  ["library", "World", "library"],
];
const RAIL_MORE: [Scope, string, IconName][] = [
  ["relationships", "Relationships", "relationships"],
  ["timeline", "Timeline", "timeline"],
];

// Label + icon per scope, for the breadcrumb trail (settings isn't in the rail).
const SCOPE_META: Record<Scope, { label: string; icon: IconName }> = {
  overview: { label: "Overview", icon: "overview" },
  library: { label: "World", icon: "library" },
  manuscript: { label: "Write", icon: "manuscript" },
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
  const [renameId, setRenameId] = useState<string | null>(null); // world being inline-renamed in the popover
  const [worldNameDraft, setWorldNameDraft] = useState("");
  const [worldsOpen, setWorldsOpen] = useState(false); // worlds popover
  const [newWorldOpen, setNewWorldOpen] = useState(false); // new-world dialog
  const [newWorldDraft, setNewWorldDraft] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem("k.rail") === "1");
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const worldsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!worldsOpen) return;
    const h = (e: MouseEvent) => {
      if (renameId) return; // don't close while inline-renaming a row
      if (worldsRef.current && !worldsRef.current.contains(e.target as Node)) setWorldsOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [worldsOpen, renameId]);

  async function reloadWorlds() {
    try {
      const w = await getMyWorlds();
      setWorlds(w);
      setWorldId((cur) => cur ?? w[0]?.id ?? null);
    } catch (x) { setErr(String(x)); }
  }

  // New world now opens an in-app dialog (no native prompt). Reused by the
  // worlds popover, the empty-state hero, and the command palette.
  function makeWorld() { setNewWorldDraft(""); setWorldsOpen(false); setNewWorldOpen(true); }
  async function commitNewWorld() {
    const name = newWorldDraft.trim();
    if (!name) return;
    setNewWorldOpen(false);
    try {
      const w = await createWorld(name);
      localStorage.setItem("k.onboarded", "1");
      setWorlds((prev) => [...(prev ?? []), w]);
      setWorldId(w.id);
      go({ scope: "overview" });
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

  function startRename(id: string) {
    const cur = worlds?.find((w) => w.id === id);
    setWorldNameDraft(cur?.name ?? "");
    setRenameId(id);
  }
  async function commitRename() {
    const id = renameId;
    setRenameId(null);
    if (!id) return;
    const name = worldNameDraft.trim();
    const cur = worlds?.find((w) => w.id === id);
    if (!name || name === cur?.name) return;
    try {
      await renameWorld(id, name);
      setWorlds((prev) => (prev ?? []).map((w) => (w.id === id ? { ...w, name } : w)));
    } catch (x) { setErr(String(x)); }
  }
  async function confirmDeleteWorld(w: World) {
    if (!(await confirmDialog({
      title: "Delete world", tone: "danger", confirmLabel: "Delete",
      message: `Delete “${w.name}”? Everything in it — chapters, cast, relationships, timeline — is soft-deleted and recoverable, but it disappears from here.`,
    }))) return;
    await deleteWorld(w.id);
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

  // Landing rule (§2): a truly empty world (no cast, chapters, notes, comments)
  // opens straight into Write — there's nothing to orient yet. Runs once per world.
  const landedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!worldId || landedFor.current === worldId) return;
    landedFor.current = worldId;
    Promise.all([getChapters(worldId), getEntities(worldId), getNotes(worldId)])
      .then(([c, e, n]) => { if (c.length === 0 && e.length === 0 && n.length === 0) setNav({ scope: "manuscript" }); })
      .catch(() => {});
  }, [worldId]);

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
  } else if (nav.scope !== "overview" && nav.scope !== "manuscript") {
    // Write owns its own navigation (the structure tree), so it shows no breadcrumb.
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
              {/* Rail header (§1/§7): K mark + full world name + chevron → the
                  world switcher popover, in place. The name never truncates. */}
              <div className="rail-top">
                <div className="railworld" ref={worldsRef}>
                  <button className="railworld-btn" title="Switch world" aria-haspopup="menu" aria-expanded={worldsOpen}
                    onClick={() => (worlds.length > 0 ? setWorldsOpen((v) => !v) : makeWorld())}>
                    <span className="k">K</span>
                    {!railCollapsed && <span className="railworld-name">{worlds.find((w) => w.id === worldId)?.name ?? "Kronicler"}</span>}
                    {!railCollapsed && worlds.length > 0 && <Icon name="chevron-down" size={ICON_SIZE.sm} />}
                  </button>
                  {worldsOpen && worlds.length > 0 && (
                    <div className="worlds-pop rail" role="menu">
                      <div className="worlds-poplab">Worlds</div>
                      <div className="worlds-list">
                        {worlds.map((w) => (renameId === w.id ? (
                          <div className="worlds-row" key={w.id}>
                            <input autoFocus value={worldNameDraft} className="worlds-renameinput"
                              onChange={(e) => setWorldNameDraft(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenameId(null); }}
                              onBlur={commitRename} />
                          </div>
                        ) : (
                          <div key={w.id} className={"worlds-row" + (w.id === worldId ? " on" : "")} role="menuitemradio" aria-checked={w.id === worldId}
                            onClick={() => { setWorldId(w.id); go({ scope: "overview" }); setWorldsOpen(false); }}>
                            <span className="worlds-check">{w.id === worldId && <Icon name="check" size={14} />}</span>
                            <span className="worlds-name">{w.name}</span>
                            {w.is_sample && <span className="worlds-tag">Example</span>}
                            <span className="spacer" style={{ flex: 1 }} />
                            <span className="worlds-act" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(w.id); }}><Icon name="edit" size={13} /></span>
                            <span className="worlds-act danger" title="Delete" onClick={(e) => { e.stopPropagation(); void confirmDeleteWorld(w); }}><Icon name="trash" size={13} /></span>
                          </div>
                        )))}
                      </div>
                      <div className="worlds-foot">
                        <button className="worlds-action" onClick={makeWorld}><Icon name="plus" size={14} /> New world</button>
                        {!worlds.some((w) => w.is_sample) && (
                          <button className="worlds-action" disabled={seeding} onClick={() => !seeding && loadExample()}>
                            {seeding ? <Spinner size={12} /> : <Icon name="book" size={14} />} Load example
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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
                // §1: Notes is no longer a destination — anything routing here
                // lands on Overview, where notes surface as an anchored object.
                <Overview worldId={worldId} go={go} />
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

      {newWorldOpen && (
        <div className="overlay" onClick={() => setNewWorldOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 4 }}>
              <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>New world</h3>
              <span className="spacer" />
              <span onClick={() => setNewWorldOpen(false)} style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name="close" size={16} /></span>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>A world holds one story’s cast, chapters, timeline, and the web of who-knows-what. Give it a name — you can rename it any time.</p>
            <input autoFocus value={newWorldDraft} placeholder="e.g. The Vurnan Chronicles"
              onChange={(e) => setNewWorldDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void commitNewWorld(); if (e.key === "Escape") setNewWorldOpen(false); }}
              style={{ width: "100%", fontFamily: "var(--serif)", fontSize: 15 }} />
            <div className="row" style={{ borderBottom: "none", padding: 0, marginTop: 14, gap: 10 }}>
              <button className="primary" disabled={!newWorldDraft.trim()} onClick={() => void commitNewWorld()}>Create world</button>
              <button onClick={() => setNewWorldOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
