import { useState } from "react";
import { Icon } from "./icons";

// A notepad-style modal for a single note — a tall writing surface, used for
// both quick capture (new note) and opening an existing note to read / edit /
// delete. Cmd/Ctrl+Enter saves, Esc closes.
export function NotePad({
  title = "Quick note",
  helper,
  initial = "",
  saveLabel = "Save note",
  onClose,
  onSave,
  onDelete,
  goto,
}: {
  title?: string;
  helper?: string;
  initial?: string;
  saveLabel?: string;
  onClose: () => void;
  onSave: (body: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  goto?: { label: string; onClick: () => void };
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = body.trim() !== initial.trim();

  async function save() {
    if (!body.trim() || busy || !dirty) return;
    setBusy(true);
    try { await onSave(body); onClose(); }
    catch { setBusy(false); }
  }
  async function del() {
    if (busy || !onDelete) return;
    setBusy(true);
    try { await onDelete(); onClose(); }
    catch { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal notepad" onClick={(e) => e.stopPropagation()}>
        <div className="notepad-head">
          <h3 className="notepad-title">{title}</h3>
          <span className="spacer" />
          <button className="notepad-close" aria-label="Close" onClick={onClose}><Icon name="close" size={17} /></button>
        </div>
        {helper && <p className="notepad-helper">{helper}</p>}
        <textarea
          className="notepad-area"
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="A name, a thought, a thread to pick up later…"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save(); if (e.key === "Escape") onClose(); }}
        />
        <div className="notepad-foot">
          {onDelete && <button className="ghost notepad-del" onClick={() => void del()} disabled={busy}>Delete</button>}
          {goto && <button className="ghost" onClick={goto.onClick}>{goto.label} <Icon name="arrow" size={13} /></button>}
          <span className="spacer" />
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!body.trim() || busy || !dirty} onClick={() => void save()}>{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
