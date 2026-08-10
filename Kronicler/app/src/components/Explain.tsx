import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

// Inline "?" term explainer (UX audit §10 / self-explaining product). Defines a
// word right where it appears, so the app teaches its own vocabulary in context
// instead of parking definitions on a Help page. Hover to peek, click to pin,
// Esc or an outside click to close. The popover is portaled to <body> so it
// never clips inside a chip, menu, or overflow-hidden container.
export function Explain({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false);
  const hideT = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(hideT.current);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.bottom });
    setOpen(true);
  };
  // A short grace period so the pointer can travel from the dot into the popover
  // without it flickering shut.
  const scheduleHide = () => { if (!pinned.current) hideT.current = window.setTimeout(() => setOpen(false), 110); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!btnRef.current?.contains(e.target as Node)) { pinned.current = false; setOpen(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { pinned.current = false; setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span className="explain">
      <button
        ref={btnRef}
        type="button"
        className="explain-dot"
        aria-label={`What “${term}” means`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); pinned.current = !pinned.current; pinned.current ? show() : setOpen(false); }}
      >
        <Icon name="help" size={12} />
      </button>
      {open && pos && createPortal(
        <span
          className="explain-pop pop"
          role="tooltip"
          style={{ position: "fixed", left: Math.min(Math.max(pos.x, 140), window.innerWidth - 140), top: pos.y + 6, transform: "translateX(-50%)" }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          <span className="explain-term">{term}</span>
          <span className="explain-def">{children}</span>
        </span>,
        document.body,
      )}
    </span>
  );
}
