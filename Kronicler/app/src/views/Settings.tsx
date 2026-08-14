import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { exportWorld, getChapters, getEntities, getStream, getNotes, getTrashCount, requestAccountDeletion } from "../lib/api";
import { exportVaultZip } from "../lib/exportVault";
import { track } from "../lib/analytics";
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
  track({ name: "export_run" }); // every export button funnels through here (§4.3)
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
  const [acctMsg, setAcctMsg] = useState<string | null>(null);
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

  async function obsidianVault() {
    setBusy("vault"); setErr(null);
    try {
      const [data, entities, chapters, stream, notes] = await Promise.all([
        exportWorld(worldId, worldName), getEntities(worldId), getChapters(worldId), getStream(worldId), getNotes(worldId),
      ]);
      const blob = await exportVaultZip({ worldName, entities, chapters, stream, notes, data });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slug(worldName)}-obsidian-vault-${stamp()}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      track({ name: "export_run" });
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

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

  // Account deletion (MVP): the client can't delete an auth user, so this files a
  // logged request an operator actions from the dashboard, then signs the writer
  // out. Confirm hard first, and point them at Export — this is irreversible.
  async function requestDelete() {
    const ok = await confirmDialog({
      title: "Delete your account",
      message: `Permanently delete your account${userEmail ? ` (${userEmail})` : ""} and every project in it?\n\nThis is irreversible — all your worlds, chapters, characters, relationships, and notes are removed. Export anything you want to keep first.`,
      confirmLabel: "Request deletion", tone: "danger",
    });
    if (!ok) return;
    setBusy("account"); setErr(null);
    try {
      await requestAccountDeletion();
      track({ name: "account_deletion_requested" });
      setAcctMsg("Your deletion request has been received. We’ll remove your account and all its data. Signing you out…");
      window.setTimeout(() => { void supabase.auth.signOut(); }, 2800);
    } catch (x) { setErr(String(x)); setBusy(null); }
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
            <div style={{ fontWeight: 500 }}>Obsidian vault <span className="chip" style={{ fontSize: 10 }}>.zip</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Your whole world as a folder of Markdown files — chapters and characters cross-linked. Unzip and open it in Obsidian, or read it anywhere. Includes the raw data too.</span>
          </div>
          <button className="primary" onClick={obsidianVault} disabled={!!busy}>{busy === "vault" ? <Spinner size={13} /> : "Download"}</button>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Full backup <span className="chip" style={{ fontSize: 10 }}>.json</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Everything — entities, chapters, relationships, notes, the lot. Keep it safe; it's your complete world.</span>
          </div>
          <button onClick={backupJson} disabled={!!busy}>{busy === "json" ? <Spinner size={13} /> : "Download"}</button>
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
        <div className="row">
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
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Delete my account</div>
            <span className="muted" style={{ fontSize: 12.5 }}>
              Requests permanent deletion of your whole account and every project in it. Irreversible, and unlike a project it does not go to trash — export first.
            </span>
            {acctMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--allied)" }}>{acctMsg}</div>}
          </div>
          <button
            style={{ color: "var(--hostile)", borderColor: "var(--hostile)" }}
            disabled={busy === "account" || !!acctMsg}
            onClick={requestDelete}
          >{busy === "account" ? <Spinner size={13} /> : "Delete account…"}</button>
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
// Passwordless account panel (§2.2). For a real account: change email. For a
// guest: add an email — which links it to the anonymous user (§2.3 conversion),
// so the project is kept and the writer signs back in with a link, no password.
function AccountPanel({ userEmail }: { userEmail: string }) {
  const [mode, setMode] = useState<null | "email">(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<null | "email">(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const isGuest = !userEmail;

  function reset() { setMode(null); setEmail(""); }

  async function saveEmail() {
    const next = email.trim();
    if (!next || next === userEmail) { reset(); return; }
    setBusy("email"); setMsg(null);
    const { error } = await supabase.auth.updateUser({ email: next });
    setBusy(null);
    if (error) setMsg({ tone: "err", text: error.message });
    else {
      setMsg({ tone: "ok", text: isGuest
        ? `Confirmation sent to ${next}. Click the link to keep this project on a real account.`
        : `Confirmation sent to ${next}. Click the link in that email to finish the change.` });
      reset();
    }
  }

  return (
    <div className="card">
      <div className="row">
        <div style={{ flex: 1, minWidth: 0 }}>
          {isGuest ? (
            <>
              <div style={{ fontWeight: 500 }}>You're exploring as a guest</div>
              <span className="muted" style={{ fontSize: 12.5 }}>Add an email to keep this project — you'll sign back in with a link, no password.</span>
            </>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 11 }}>Signed in as</div>
              <div style={{ fontWeight: 500 }}>{userEmail}</div>
            </>
          )}
        </div>
        {mode !== "email" && (
          <button className={isGuest ? "primary" : undefined} onClick={() => { setMode("email"); setEmail(isGuest ? "" : userEmail); setMsg(null); }}>
            {isGuest ? "Add an email" : "Change email"}
          </button>
        )}
      </div>

      {mode === "email" && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your email address"
            style={{ flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === "Enter") saveEmail(); if (e.key === "Escape") reset(); }} />
          <button className="primary" onClick={saveEmail} disabled={busy === "email"}>{busy === "email" ? <Spinner size={13} /> : "Send confirmation"}</button>
          <button onClick={reset} disabled={busy === "email"}>Cancel</button>
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
