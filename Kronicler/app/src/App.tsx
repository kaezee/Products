import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { getMyWorlds, createWorld } from "./lib/api";
import type { World } from "./lib/types";
import { AuthGate } from "./auth/AuthGate";
import { Library } from "./views/Library";
import { Stream } from "./views/Stream";

export function App() {
  return <AuthGate>{(session) => <Workspace session={session} />}</AuthGate>;
}

type Tab = "library" | "stream";

function Workspace({ session }: { session: Session }) {
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("stream");
  const [err, setErr] = useState<string | null>(null);

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

  async function makeWorld() {
    const name = prompt("Name your world");
    if (!name) return;
    try {
      const w = await createWorld(name);
      setWorlds((prev) => [...(prev ?? []), w]);
      setWorldId(w.id);
    } catch (x) {
      setErr(String(x));
    }
  }

  if (err) return <div className="app"><p className="err">{err}</p></div>;
  if (!worlds) return <div className="center"><span className="muted">Loading…</span></div>;

  return (
    <div className="app">
      <div className="nav">
        <strong style={{ fontFamily: "var(--serif)", fontSize: 18, marginRight: 8 }}>Kronicler</strong>
        {worlds.length > 0 && (
          <select value={worldId ?? ""} onChange={(e) => setWorldId(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--line)" }}>
            {worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        <button onClick={makeWorld}>+ World</button>
        <span className="spacer" />
        <span className="muted">{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {!worldId ? (
        <div className="card"><div className="row"><span className="muted">
          No worlds yet. Create one to begin — it seeds your starter vocabulary automatically.
        </span></div></div>
      ) : (
        <>
          <div className="nav">
            <span className={"tab" + (tab === "stream" ? " on" : "")} onClick={() => setTab("stream")}>Relationships</span>
            <span className={"tab" + (tab === "library" ? " on" : "")} onClick={() => setTab("library")}>Library</span>
          </div>
          {tab === "stream" ? <Stream worldId={worldId} /> : <Library worldId={worldId} />}
        </>
      )}
    </div>
  );
}
