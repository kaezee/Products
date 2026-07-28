import { useState, type ReactNode } from "react";

// A real "side panel" toggle icon: a rounded rectangle with a vertical divider
// marking a panel on the right edge (like Claude's open/close-sidebar control).
export function PanelToggleIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2.2" />
      <line x1="10" y1="2.5" x2="10" y2="13.5" />
    </svg>
  );
}

// A toggleable right-hand contextual panel with progressive-disclosure sections
// (the pattern from Claude's own right sidebar). The panel toggle lives in the
// host's top bar; this renders the panel body only when open.

export function SidePanel({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <aside className="sidepanel">
      <div className="sidepanel-body">{children}</div>
      <button className="sidepanel-close" title="Close panel" aria-label="Close panel" onClick={onClose}><PanelToggleIcon /></button>
    </aside>
  );
}

// One collapsible section. Header shows a chevron, a label, and an optional
// count/afford on the right. Only the sections a writer needs are opened.
export function Disclosure({ label, count, right, defaultOpen = false, children }: {
  label: string;
  count?: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={"disc" + (open ? " open" : "")}>
      <button className="disc-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="disc-chev">›</span>
        <span className="disc-label">{label}</span>
        {count != null && <span className="disc-count">{count}</span>}
      </button>
      {open && <div className="disc-body">{right != null && <div className="disc-right">{right}</div>}{children}</div>}
    </section>
  );
}
