import { useEffect, useRef, useState } from "react";
import { ENTITY_SWATCHES } from "../lib/entityTypes";

// A tiny colour control: a coloured dot that opens a popover of the 12 curated
// swatches. Picking one calls onPick(swatch); "Auto" clears the override
// (onPick(null)) so the segment falls back to its kind's default colour.
export function SwatchPicker({ value, onPick, title = "Colour", allowAuto = true, size = 12 }: {
  value: string;
  onPick: (swatch: string | null) => void;
  title?: string;
  allowAuto?: boolean;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" title={title} aria-label={title}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{ width: size, height: size, padding: 0, borderRadius: "50%", cursor: "pointer",
          background: `var(--k-entity-${value})`, border: "1px solid rgba(0,0,0,.18)", flex: "0 0 auto" }} />
      {open && (
        <div className="swatchpop" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="swatchpop-grid">
            {ENTITY_SWATCHES.map((s) => (
              <button key={s} type="button" title={s} onClick={() => { onPick(s); setOpen(false); }}
                style={{ width: 20, height: 20, padding: 0, borderRadius: 5, cursor: "pointer",
                  background: `var(--k-entity-${s})`,
                  border: value === s ? "2px solid var(--ink)" : "1px solid rgba(0,0,0,.15)" }} />
            ))}
          </div>
          {allowAuto && (
            <button type="button" className="swatchpop-auto" onClick={() => { onPick(null); setOpen(false); }}>
              Auto (by kind)
            </button>
          )}
        </div>
      )}
    </span>
  );
}
