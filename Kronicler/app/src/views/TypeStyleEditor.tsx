import { useState } from "react";
import type { EntityType } from "../lib/types";
import { createEntityType, updateEntityType } from "../lib/api";
import { ENTITY_SWATCHES, LINE_STYLES } from "../lib/entityTypes";

type LineStyle = EntityType["line_style"];

// The colour/mark/underline editor for ONE entity type, shown under its section
// in the Library. If the type has no registry row yet (a custom type minted
// inline), the first edit adopts it into the registry.
export function TypeStyleEditor({ worldId, typeName, row, swatch, onChanged }: {
  worldId: string;
  typeName: string;
  row: EntityType | null;   // the registry row, if one exists
  swatch: string;           // effective swatch (registry, built-in, or auto)
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const curSwatch = row?.swatch ?? swatch;
  const curMark = row?.mark ?? typeName.slice(0, 1).toUpperCase();
  const curLine: LineStyle = row?.line_style ?? "solid";

  async function patch(p: { swatch?: string; mark?: string; line_style?: LineStyle }) {
    setBusy(true); setErr(null);
    try {
      if (row) await updateEntityType(row.id, p);
      else await createEntityType(worldId, {
        name: typeName, mark: (p.mark ?? curMark).slice(0, 2) || typeName.slice(0, 1).toUpperCase(),
        swatch: p.swatch ?? curSwatch, line_style: p.line_style ?? curLine,
      });
      onChanged();
    } catch (x) { setErr(String(x)); } finally { setBusy(false); }
  }

  return (
    <div style={{ margin: "2px 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--k-entity-${curSwatch})` }} />
        <span style={{
          fontFamily: "var(--serif)", fontSize: 13.5,
          textDecorationLine: "underline", textDecorationStyle: curLine,
          textDecorationColor: `var(--k-entity-${curSwatch})`, textDecorationThickness: 2, textUnderlineOffset: 3,
        }}>How {typeName} mentions look</span>
        <span className="tab" onClick={() => setOpen((v) => !v)} style={{ padding: "3px 9px", fontSize: 11.5 }}>
          {open ? "Done" : "Edit colour"}
        </span>
      </div>

      {open && (
        <div className="card" style={{ marginTop: 8, padding: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 300 }}>
            {ENTITY_SWATCHES.map((s) => (
              <button key={s} title={s} disabled={busy} onClick={() => patch({ swatch: s })}
                style={{
                  width: 20, height: 20, padding: 0, borderRadius: 5, cursor: "pointer",
                  background: `var(--k-entity-${s})`,
                  border: curSwatch === s ? "2px solid var(--ink)" : "1px solid rgba(0,0,0,.15)",
                }} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="muted" style={{ fontSize: 11 }}>Mark</span>
            <input key={`${typeName}:${curMark}`} defaultValue={curMark} maxLength={2} aria-label={`${typeName} marker`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== curMark) patch({ mark: v }); }}
              style={{ width: 34, textAlign: "center", fontSize: 12 }} disabled={busy} />
            <select className="sel" value={curLine} title="Underline style" disabled={busy}
              onChange={(e) => patch({ line_style: e.target.value as LineStyle })}
              style={{ padding: "3px 6px", fontSize: 11.5 }}>
              {LINE_STYLES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {err && <span className="err" style={{ fontSize: 11 }}>{err}</span>}
        </div>
      )}
    </div>
  );
}
