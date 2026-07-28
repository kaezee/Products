import { useState, type ReactNode } from "react";
import { Icon } from "./icons";

// The "side panel" toggle: a rounded rectangle with a vertical divider marking a
// panel on the right edge. Drawn from the shared icon library so it matches
// every other icon's weight and sizing.
export function PanelToggleIcon({ size = 16 }: { size?: number }) {
  return <Icon name="panel" size={size} />;
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
        <span className="disc-chev"><Icon name="chevron" size={15} /></span>
        <span className="disc-label">{label}</span>
        {count != null && <span className="disc-count">{count}</span>}
      </button>
      {open && <div className="disc-body">{right != null && <div className="disc-right">{right}</div>}{children}</div>}
    </section>
  );
}
