import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

// The "side panel" toggle: a rounded rectangle with a vertical divider marking a
// panel on the right edge. Drawn from the shared icon library so it matches
// every other icon's weight and sizing.
export function PanelToggleIcon({ size = 16 }: { size?: number }) {
  return <Icon name="panel" size={size} />;
}

// A toggleable right-hand contextual panel with progressive-disclosure sections
// (the pattern from Claude's own right sidebar). The single collapse toggle lives
// ON the panel itself — never in the host's top bar. When collapsed the panel
// shrinks to a slim rail carrying just the re-open toggle, so it's always the
// same control in the same place.
export function SidePanel({ open, onToggle, children }: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (!open) {
    return (
      <div className="sidepanel-rail">
        <button className="sidepanel-toggle" title="Show panel" aria-label="Show panel" onClick={onToggle}>
          <PanelToggleIcon />
        </button>
      </div>
    );
  }
  return (
    <aside className="sidepanel">
      <div className="sidepanel-head">
        <button className="sidepanel-toggle" title="Hide panel" aria-label="Hide panel" onClick={onToggle}><PanelToggleIcon /></button>
      </div>
      <div className="sidepanel-body">{children}</div>
    </aside>
  );
}

// One collapsible section. Header shows a chevron, a label, and an optional
// count/afford on the right. Only the sections a writer needs are opened.
export function Disclosure({ label, count, right, defaultOpen = false, openSignal, children }: {
  label: string;
  count?: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  // When this value changes to something defined, force the section open (it can
  // still be collapsed again by hand). Used to reveal a section on a new action.
  openSignal?: unknown;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (openSignal !== undefined && openSignal !== null) setOpen(true);
  }, [openSignal]);
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
