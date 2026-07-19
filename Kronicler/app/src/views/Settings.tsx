import { useState } from "react";
import { supabase } from "../lib/supabase";
import { exportWorld, getChapters, getEntities } from "../lib/api";
import type { Entity } from "../lib/types";
import { Trash } from "./Trash";

function slug(s: string) { return (s || "world").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "world"; }
function stamp() { return new Date().toISOString().slice(0, 10); }
function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

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
      let md = `# ${worldName} — World Bible\n\n_Exported ${stamp()} · ${entities.length} entries_\n`;
      for (const [type, list] of [...byType.entries()].sort()) {
        md += `\n---\n\n## ${type}\n\n`;
        for (const e of list.sort((a, b) => a.title.localeCompare(b.title))) {
          md += `### ${e.title}\n`;
          if (e.aliases.length) md += `_also: ${e.aliases.join(", ")}_\n`;
          md += `\n${(e.body || "").trim() || "_(no description)_"}\n\n`;
        }
      }
      download(`${slug(worldName)}-world-bible-${stamp()}.md`, md, "text/markdown");
    } catch (x) { setErr(String(x)); } finally { setBusy(null); }
  }

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

      <div className="label" style={{ marginTop: 28 }}>Export · your data is yours</div>
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Full backup <span className="chip" style={{ fontSize: 10 }}>.json</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Everything — entities, chapters, relationships, notes, bands, the lot. Keep it safe; it's your complete world.</span>
          </div>
          <button className="primary" onClick={backupJson} disabled={!!busy}>{busy === "json" ? "…" : "Download"}</button>
        </div>
        <div className="row">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>Manuscript <span className="chip" style={{ fontSize: 10 }}>.md</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Your chapters, in order, as readable Markdown — the prose itself, out of the tool.</span>
          </div>
          <button onClick={manuscriptMd} disabled={!!busy}>{busy === "ms" ? "…" : "Download"}</button>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>World bible <span className="chip" style={{ fontSize: 10 }}>.md</span></div>
            <span className="muted" style={{ fontSize: 12.5 }}>Every entity by type, with aliases and descriptions — a readable reference document.</span>
          </div>
          <button onClick={bibleMd} disabled={!!busy}>{busy === "bible" ? "…" : "Download"}</button>
        </div>
      </div>
      {err && <p className="err" style={{ maxWidth: 680 }}>{err}</p>}

      <div className="label" style={{ marginTop: 28 }}>Trash · recently deleted</div>
      <Trash worldId={worldId} onWorldsChanged={onWorldsChanged} />

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
