import { supabase } from "../lib/supabase";

// Settings is app/world level only. The relationship dictionary lives under
// Relationships → Types now (it's relationship vocabulary, not an app setting).
export function Settings({ worldName, userEmail, onDeleteWorld }: {
  worldName: string;
  userEmail: string;
  onDeleteWorld: () => void;
}) {
  return (
    <div className="fi">
      <h2 className="scope-title">Settings</h2>
      <p className="scope-sub" style={{ maxWidth: 620 }}>
        Your account and this world. Relationship types moved to Relationships → Types.
      </p>

      <div className="label" style={{ marginTop: 8 }}>Account</div>
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="row" style={{ borderBottom: "none" }}>
          <span style={{ flex: 1 }}>{userEmail}</span>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <div className="label" style={{ marginTop: 28, color: "var(--hostile)" }}>Danger zone</div>
      <div className="card" style={{ maxWidth: 680, borderColor: "var(--hostile)" }}>
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Delete “{worldName}”</div>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Removes this whole world from your list. Soft-deleted — recoverable by support, not truly erased.
            </span>
          </div>
          <button
            style={{ color: "var(--hostile)", borderColor: "var(--hostile)" }}
            onClick={() => {
              if (confirm(`Delete the world “${worldName}”?\n\nEverything in it is hidden and recoverable — nothing is truly erased. You'll be switched to another world.`)) {
                onDeleteWorld();
              }
            }}
          >Delete world</button>
        </div>
      </div>
    </div>
  );
}
