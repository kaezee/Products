import { useState } from "react";
import { Icon } from "./icons";

// One-tap note capture (Foundations §3). Beats the phone's default notes app by
// landing somewhere it'll be found again — a project note under "What you left
// yourself" — and it works offline: the note is queued locally the instant you
// hit save, and syncs when there's a connection. onSave owns the queue write.
export function QuickCapture({ onClose, onSave }: { onClose: () => void; onSave: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    try { await onSave(body); onClose(); }
    catch { setSaving(false); } // queue write shouldn't throw, but never trap the user
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ borderBottom: "none", padding: 0, marginBottom: 8 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontWeight: 500, margin: 0, fontSize: 19 }}>Quick note</h3>
          <span className="spacer" />
          <span onClick={onClose} style={{ cursor: "pointer", color: "var(--muted)", display: "inline-flex" }}><Icon name="close" size={16} /></span>
        </div>
        <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={5}
          placeholder="A name, a thought, a thread to pick up later…"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save(); if (e.key === "Escape") onClose(); }}
          style={{ width: "100%", resize: "vertical", fontFamily: "var(--serif)", fontSize: 15, lineHeight: 1.5 }} />
        <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
          Saved to “What you left yourself.” Works offline — it syncs when you’re back.
        </p>
        <div className="np-entry" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!body.trim() || saving} onClick={() => void save()}>Save note</button>
        </div>
      </div>
    </div>
  );
}
