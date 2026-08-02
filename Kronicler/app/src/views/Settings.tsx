import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { exportWorld, getChapters, getEntities, getTrashCount } from "../lib/api";
import type { Entity } from "../lib/types";
import { Trash } from "./Trash";
import { getLevelNames, setLevelNames } from "../lib/levelNames";
import { Icon } from "../components/icons";
import { Spinner } from "../components/Skeleton";
import { confirmDialog } from "../components/confirm";

function slug(s: string) { return (s || "world").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "world"; }
function stamp() { return new Date().toISOString().slice(0, 10); }
function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
const fmtCount = (n: number) => (n > 99 ? "99+" : String(n));

// Settings is app/world level only. The relationship dictionary lives under
// Relationships → Types now (it's relationship vocabulary, not an app setting).
export function Settings({ worldId, worldName, userEmail, onDeleteWorld, onWorldsChanged }: {
  worldId: string;
  worldName: string;
  userEmail: string;
  onDeleteWorld: () => void;
  onWorldsChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState<number | null>(null);
  const [levels, setLevels] = useState(() => getLevelNames(worldId));
  useEffect(() => { setLevels(getLevelNames(worldId)); }, [worldId]);
  function commitLevels(next: { container: string; leaf: string }) { setLevels(setLevelNames(worldId, next)); }

  useEffect(() => {
    let alive = true;
    getTrashCount(worldId).then((n) => alive && setTrashCount(n)).catch(() => {});
    return () => { alive = false; };
  }, [worldId, trashOpen]);

  async function backupJson() {
    setBusy("json"); setErr(null);
    try {
      const data = await exportWorld(worldId, worldName);
      download(`${slug(worldName)}-kronicler-backup-${stamp()}.json`, JSON.stringify(data, null, 2), "application/json");
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

  async function manuscriptMd() {
    setBusy("ms"); setErr(null);
    try {
      const chapters = await getChapters(worldId);
      const md = `# ${worldName} — Manuscript\n\n_Exported ${stamp()} · ${chapters.length} chapters_\n\n---\n\n`
        + chapters
          .sort((a, b) => a.manuscript_order - b.manuscript_order)
          .map((c) => `## ${c.title}\n\n${(c.body || "").trim() || "_(empty)_"}\n`)
          .join("\n\n");
      download(`${slug(worldName)}-manuscript-${stamp()}.md`, md, "text/markdown");
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

  async function bibleMd() {
    setBusy("bible"); setErr(null);
    try {
      const entities = await getEntities(worldId);
      const byType = new Map<string, Entity[]>();
      for (const e of entities) { const a = byType.get(e.type) ?? []; a.push(e); byType.set(e.type, a); }
      let md = `# ${worldName} — World\n\n_Exported ${stamp()} · ${entities.length} entries_\n`;
      for (const [type, list] of [...byType.entries()].sort()) {
        md += `\n---\n\n## ${type}\n\n`;
        for (const e of list.sort((a, b) => a.title.localeCompare(b.title))) {
          md += `### ${e.title}\n`;
          if (e.aliases.length) md += `_also: ${e.aliases.join(", ")}_\n`;
          md += `\n${(e.body || "").trim() || "_(no description)_"}\n\n`;
        }
      }
      download(`${slug(worldName)}-world-${stamp()}.md`, md, "text/markdown");
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

  return (
    <div className="fi settings-wrap">
      <h2 className="scope-title">Settings</h2>
      <p className="scope-sub">
        Your account and this project. Relationship kinds live under Relationships → Manage.
      </p>

      <div className="label" style={{ marginTop: 8 }}>Account</div>
      <AccountPanel userEmail={userEmail} />

      <div className="label" style={{ marginTop: 28 }}>Export · your data is yours</div>
      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Full backup <span className="chip" style={{ fontSize: 10 }}>.json</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Everything — entities, chapters, relationships, notes, the lot. Keep it safe; it's your complete world.</span>
          </div>
          <button className="primary" onClick={backupJson} disabled={!!busy}>{busy === "json" ? <Spinner size={13} /> : "Download"}</button>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Manuscript <span className="chip" style={{ fontSize: 10 }}>.md</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Your chapters, in order, as readable Markdown — the prose itself, out of the tool.</span>
          </div>
          <button onClick={manuscriptMd} disabled={!!busy}>{busy === "ms" ? <Spinner size={13} /> : "Download"}</button>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>World <span className="chip" style={{ fontSize: 10 }}>.md</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Every entity by type, with aliases and descriptions — a readable reference document.</span>
          </div>
          <button onClick={bibleMd} disabled={!!busy}>{busy === "bible" ? <Spinner size={13} /> : "Download"}</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="label" style={{ marginTop: 28 }}>What things are called</div>
      <div className="card">
        <div className="row" style={{ borderBottom: "none", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Your project, your words</div>
            <span className="muted" style={{ fontSize: 12.5 }}>Book / Chapter is the default — rename them to fit your story (Season / Episode, Act / Scene, Volume / Issue). Used everywhere in Write.</span>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
              The bigger unit
              <input value={levels.container} placeholder="Book" style={{ width: 120 }}
                onChange={(e) => setLevels((v) => ({ ...v, container: e.target.value }))}
                onBlur={() => commitLevels(levels)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: "var(--muted)" }}>
              What you write in
              <input value={levels.leaf} placeholder="Chapter" style={{ width: 120 }}
                onChange={(e) => setLevels((v) => ({ ...v, leaf: e.target.value }))}
                onBlur={() => commitLevels(levels)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </label>
          </div>
        </div>
      </div>

      <div className="label" style={{ marginTop: 28 }}>Trash · recently deleted</div>
      <div className="card">
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Recover deleted items</div>
            <span className="muted" style={{ fontSize: 12.5 }}>Nothing is truly erased at first — restore deleted entities, chapters, and worlds. Items still in the trash after 30 days are permanently purged.</span>
          </div>
          <button onClick={() => setTrashOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Icon name="trash" size={14} /> Open trash
            {trashCount != null && trashCount > 0 && <span className="count-badge">{fmtCount(trashCount)}</span>}
          </button>
        </div>
      </div>

      <div className="label" style={{ marginTop: 28, color: "var(--hostile)" }}>Danger zone</div>
      <div className="card" style={{ borderColor: "var(--hostile)" }}>
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Delete “{worldName}”</div>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Removes this whole project from your list. Soft-deleted first — recoverable from trash for 30 days, then purged.
            </span>
          </div>
          <button
            style={{ color: "var(--hostile)", borderColor: "var(--hostile)" }}
            onClick={async () => {
              if (await confirmDialog({ title: "Delete project", message: `Delete the project “${worldName}”?\n\nIt moves to the trash — recoverable for 30 days, then permanently purged. You'll be switched to another project.`, confirmLabel: "Delete project", tone: "danger" })) {
                onDeleteWorld();
              }
            }}
          >Delete project</button>
        </div>
      </div>

      {trashOpen && (
        <div className="overlay" onClick={() => setTrashOpen(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 12 }}>
              <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon name="trash" size={17} /> Trash
                {trashCount != null && trashCount > 0 && <span className="count-badge">{fmtCount(trashCount)}</span>}
              </h3>
              <span className="spacer" style={{ flex: 1 }} />
              <span onClick={() => setTrashOpen(false)} style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }} title="Close"><Icon name="close" size={16} /></span>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "0 0 14px" }}>Restore anything below, or erase it for good. Items left here are auto-purged 30 days after deletion.</p>
            <Trash worldId={worldId} onWorldsChanged={onWorldsChanged} />
          </div>
        </div>
      )}
    </div>
  );
}

// Account management — change email, change password, request a reset link, and
// sign out. Supabase emails a confirmation for email changes; password updates
// apply to the live session immediately.
function AccountPanel({ userEmail }: { userEmail: string }) {
  const [mode, setMode] = useState<null | "email" | "password">(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<null | "email" | "password" | "reset">(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function reset() { setMode(null); setEmail(""); setPw(""); }

  async function saveEmail() {
    const next = email.trim();
    if (!next || next === userEmail) { reset(); return; }
    setBusy("email"); setMsg(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(null);
    if (error) setMsg({ tone: "err", text: error.message });
    else { setMsg({ tone: "ok", text: `Confirmation sent to ${next}. Click the link in that email to finish the change.` }); reset(); }
  }

  async function savePassword() {
    if (pw.length < 8) { setMsg({ tone: "err", text: "Use at least 8 characters." }); return; }
    setBusy("password"); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) setMsg({ tone: "err", text: error.message });
    else { setMsg({ tone: "ok", text: "Password updated." }); reset(); }
  }

  async function sendReset() {
    setBusy("reset"); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: window.location.origin });
    setBusy(null);
    if (error) setMsg({ tone: "err", text: error.message });
    else setMsg({ tone: "ok", text: `Reset link sent to ${userEmail}.` });
  }

  return (
    <div className="card">
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted" style={{ fontSize: 11 }}>Signed in as</div>
          <div style={{ fontWeight: 500 }}>{userEmail}</div>
        </div>
        {mode !== "email" && <button onClick={() => { setMode("email"); setEmail(userEmail); setMsg(null); }}>Change email</button>}
      </div>

      {mode === "email" && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new email address"
            style={{ flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") reset(); }} />
          <button className="primary" onClick={saveEmail} disabled={busy === "email"}>{busy === "email" ? <Spinner size={13} /> : "Send confirmation"}</button>
          <button onClick={reset} disabled={busy === "email"}>Cancel</button>
        </div>
      )}

      <div className="row">
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Password</div>
          <span className="muted" style={{ fontSize: 12.5 }}>Set a new password, or email yourself a reset link.</span>
        </div>
        <button onClick={() => sendReset()} disabled={busy === "reset"}>{busy === "reset" ? <Spinner size={13} /> : "Email reset link"}</button>
        {mode !== "password" && <button onClick={() => { setMode("password"); setPw(""); setMsg(null); }}>Change password</button>}
      </div>

      {mode === "password" && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="new password (min 8 chars)"
            style={{ flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === "Enter") savePassword(); if (e.key === "Escape") reset(); }} />
          <button className="primary" onClick={savePassword} disabled={busy === "password"}>{busy === "password" ? <Spinner size={13} /> : "Update password"}</button>
          <button onClick={reset} disabled={busy === "password"}>Cancel</button>
        </div>
      )}

      {msg && (
        <div className="row" style={{ borderBottom: "none" }}>
          <span style={{ fontSize: 12.5, color: msg.tone === "ok" ? "var(--allied)" : "var(--hostile)" }}>{msg.text}</span>
        </div>
      )}

      <div className="row" style={{ borderBottom: "none" }}>
        <span className="muted" style={{ flex: 1, fontSize: 12.5 }}>End this session on this device.</span>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}
