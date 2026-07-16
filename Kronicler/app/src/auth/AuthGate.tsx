import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Email + password auth. Chosen over magic-link for phase 3 because it works
// without email delivery, which keeps local/dev and automated smoke tests
// possible. Auth method is not load-bearing and can change later.
export function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="center"><span className="muted">Loading…</span></div>;
  if (!session) return <SignIn />;
  return <>{children(session)}</>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      // Call the methods directly — pulling them into a variable would detach
      // `this` from the GoTrue client and throw.
      const creds = { email: email.trim(), password };
      const { error } = mode === "in"
        ? await supabase.auth.signInWithPassword(creds)
        : await supabase.auth.signUp(creds);
      if (error) setErr(error.message);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>Kronicler</h1>
      <form className="authcard" onSubmit={submit}>
        <span className="label" style={{ margin: 0 }}>{mode === "in" ? "Sign in" : "Create account"}</span>
        <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {err && <span className="err">{err}</span>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
        </button>
        <span className="muted" style={{ cursor: "pointer" }} onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}>
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </span>
      </form>
    </div>
  );
}
