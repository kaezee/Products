import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Passwordless auth (Foundations-before-auth handoff §2.2): Google OAuth + email
// magic link, and no-signup guest. No password auth — there are no passwords to
// leak. Magic link uses the project's email sender; Google needs the provider
// enabled in Supabase (until then its button reports it's not switched on).
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

// Google's "G" mark, inline so there's no external asset.
function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden style={{ flex: "0 0 auto" }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "link" | "google" | "guest">(null);

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy("link");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setErr(error.message); else setSent(true);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(null); }
  }

  async function google() {
    setErr(null); setBusy("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      // On success the browser redirects to Google, so we only land here on error.
      if (error) setErr(/provider|not enabled|Unsupported|disabled/i.test(error.message)
        ? "Google sign-in isn't switched on for this project yet."
        : error.message);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(null); }
  }

  async function guest() {
    setErr(null); setBusy("guest");
    try {
      try { localStorage.removeItem("k.onboarded"); } catch { /* private mode */ }
      const { error } = await supabase.auth.signInAnonymously();
      if (error) setErr(/anonymous|disabled|not enabled/i.test(error.message)
        ? "Guest access isn't switched on for this project yet."
        : error.message);
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(null); }
  }

  if (sent) return (
    <div className="center">
      <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>Kronicler</h1>
      <div className="authcard">
        <span className="label" style={{ margin: 0 }}>Check your email</span>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          A sign-in link is on its way to <b>{email}</b>. Click it to sign in — you can close this tab.
        </p>
        <button type="button" onClick={() => { setSent(false); setEmail(""); }}>Use a different email</button>
      </div>
    </div>
  );

  return (
    <div className="center">
      <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0 }}>Kronicler</h1>
      <div className="authcard">
        <span className="label" style={{ margin: 0 }}>Sign in</span>
        <button type="button" className="google-btn" onClick={google} disabled={!!busy}>
          <GoogleG /> {busy === "google" ? "…" : "Continue with Google"}
        </button>
        <div className="auth-or"><span>or</span></div>
        <form onSubmit={magicLink} style={{ display: "contents" }}>
          <input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="primary" type="submit" disabled={!!busy || !email.trim()}>
            {busy === "link" ? "…" : "Email me a sign-in link"}
          </button>
        </form>
        {err && <span className="err">{err}</span>}
        <div className="auth-or"><span>or</span></div>
        <button type="button" onClick={guest} disabled={!!busy}>{busy === "guest" ? "…" : "Explore as a guest"}</button>
        <span className="faint" style={{ fontSize: 11, textAlign: "center" }}>
          Jump straight into an example world — no email needed.
        </span>
      </div>
    </div>
  );
}
