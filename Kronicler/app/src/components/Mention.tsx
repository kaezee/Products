import type { CSSProperties } from "react";

// §7 entity-mention channel, inline. A name carries a 2px solid underline in its
// entity's swatch colour plus a faint canvas-derived wash (radius 2). Linework
// only — no fill beyond the wash, no icon, no container. When the swatch can't
// be resolved (unknown entity) the name falls back to plain bold.
export function Mention({ name, swatch }: { name: string; swatch?: string }) {
  if (!swatch) return <b>{name}</b>;
  return (
    <span
      className="ment-x"
      style={{ "--mc": `var(--k-entity-${swatch})`, "--mw": `var(--k-entity-${swatch}-tint)` } as CSSProperties}
    >
      {name}
    </span>
  );
}
