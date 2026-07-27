import { useEffect, useMemo, useState } from "react";
import type { EntityType } from "../lib/types";
import { getEntityTypes, getEntities, createEntityType, updateEntityType, deleteEntityType } from "../lib/api";
import { ENTITY_SWATCHES, LINE_STYLES, buildTypeSwatches, plural } from "../lib/entityTypes";

type LineStyle = EntityType["line_style"];

// One row the writer can edit: either a real registry type (has `row`) or a
// custom type discovered "in use" among entities but not yet registered. The
// latter is adopted into the registry the moment the writer touches it.
interface TypeRow {
  key: string;         // stable list key (name)
  name: string;
  mark: string;
  swatch: string;
  line_style: LineStyle;
  is_builtin: boolean;
  inUse: boolean;      // any entity currently uses this type?
  row: EntityType | null;
}

// Small live preview of how a mention of this type will read in prose.
function MentionPreview({ swatch, line_style, name }: { swatch: string; line_style: LineStyle; name: string }) {
  return (
    <span style={{
      textDecorationLine: "underline",
      textDecorationStyle: line_style,
      textDecorationColor: `var(--k-entity-${swatch})`,
      textDecorationThickness: 2,
      textUnderlineOffset: 3.5,
      color: "var(--k-text-primary, var(--ink))",
      fontFamily: "var(--serif)",
    }}>{name}</span>
  );
}

export function TypesManager({ worldId }: { worldId: string }) {
  const [types, setTypes] = useState<EntityType[]>([]);
  const [usedNames, setUsedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // new-type form
  const [nName, setNName] = useState("");
  const [nMark, setNMark] = useState("");
  const [nSwatch, setNSwatch] = useState<string>("teal");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [t, ents] = await Promise.all([getEntityTypes(worldId), getEntities(worldId)]);
      setTypes(t);
      setUsedNames(ents.map((e) => e.type));
    } catch (x) { setErr(String(x)); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [worldId]);

  const swatchMap = useMemo(() => buildTypeSwatches(types, usedNames), [types, usedNames]);
  const useCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of usedNames) m.set(n.toLowerCase(), (m.get(n.toLowerCase()) ?? 0) + 1);
    return m;
  }, [usedNames]);

  // Merge registry rows with any custom type only seen among entities.
  const rows: TypeRow[] = useMemo(() => {
    const byName = new Map<string, EntityType>();
    for (const t of types) byName.set(t.name.toLowerCase(), t);
    const out: TypeRow[] = types
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((t) => ({
        key: t.name, name: t.name, mark: t.mark, swatch: t.swatch, line_style: t.line_style,
        is_builtin: t.is_builtin, inUse: (useCount.get(t.name.toLowerCase()) ?? 0) > 0, row: t,
      }));
    const seen = new Set(out.map((r) => r.name.toLowerCase()));
    const orphans = [...new Set(usedNames)].filter((n) => !seen.has(n.toLowerCase())).sort();
    for (const n of orphans) {
      const sw = swatchMap.get(n.toLowerCase()) ?? "slate";
      out.push({
        key: n, name: n, mark: n.slice(0, 1).toUpperCase(), swatch: sw, line_style: "solid",
        is_builtin: false, inUse: true, row: null,
      });
    }
    return out;
  }, [types, usedNames, useCount, swatchMap]);

  // Persist an edit. Registry rows update; orphan rows are adopted (created).
  async function patchRow(r: TypeRow, patch: { mark?: string; swatch?: string; line_style?: LineStyle }) {
    setSavingKey(r.key); setErr(null);
    try {
      if (r.row) {
        await updateEntityType(r.row.id, patch);
      } else {
        await createEntityType(worldId, {
          name: r.name, mark: patch.mark ?? r.mark, swatch: patch.swatch ?? r.swatch,
          line_style: patch.line_style ?? r.line_style,
        });
      }
      await load();
    } catch (x) { setErr(String(x)); } finally { setSavingKey(null); }
  }

  async function removeRow(r: TypeRow) {
    if (!r.row) return;
    if (!confirm(`Delete the type “${r.name}”? Its colour returns to an automatic one; entities keep their type.`)) return;
    setSavingKey(r.key); setErr(null);
    try { await deleteEntityType(r.row.id); await load(); }
    catch (x) { setErr(String(x)); } finally { setSavingKey(null); }
  }

  async function addType() {
    const name = nName.trim();
    const mark = (nMark.trim() || name.slice(0, 1)).toUpperCase().slice(0, 2);
    if (!name) return;
    if (rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) { setErr(`“${name}” already exists.`); return; }
    setSavingKey("__new__"); setErr(null);
    try {
      await createEntityType(worldId, { name, mark, swatch: nSwatch });
      setNName(""); setNMark(""); setNSwatch("teal");
      await load();
    } catch (x) { setErr(String(x)); } finally { setSavingKey(null); }
  }

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      {loading ? (
        <div className="row" style={{ borderBottom: "none" }}><span className="muted">Loading types…</span></div>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.key} className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MentionPreview swatch={r.swatch} line_style={r.line_style} name={r.name} />
                  {r.is_builtin && <span className="chip" style={{ fontSize: 9.5 }}>built-in</span>}
                  {!r.row && <span className="chip" style={{ fontSize: 9.5 }}>auto</span>}
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {plural(r.name)}
                  {r.inUse ? ` · ${useCount.get(r.name.toLowerCase())} in use` : " · none yet"}
                </span>
              </div>

              {/* swatch picker */}
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 168 }}>
                {ENTITY_SWATCHES.map((s) => (
                  <button key={s} title={s} onClick={() => patchRow(r, { swatch: s })}
                    disabled={savingKey === r.key}
                    style={{
                      width: 18, height: 18, padding: 0, borderRadius: 5, cursor: "pointer",
                      background: `var(--k-entity-${s})`,
                      border: r.swatch === s ? "2px solid var(--k-text-primary, var(--ink))" : "1px solid rgba(0,0,0,.15)",
                      boxShadow: r.swatch === s ? "0 0 0 2px var(--k-bg-surface, var(--surface))" : "none",
                    }} />
                ))}
              </div>

              {/* mark + line style + delete */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input key={`${r.key}:${r.mark}`} defaultValue={r.mark} maxLength={2} title="Marker letter" aria-label={`${r.name} marker`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.mark) patchRow(r, { mark: v }); }}
                  style={{ width: 34, textAlign: "center", fontSize: 12 }} disabled={savingKey === r.key} />
                <select className="sel" value={r.line_style} title="Underline style" aria-label={`${r.name} underline`}
                  onChange={(e) => patchRow(r, { line_style: e.target.value as LineStyle })}
                  disabled={savingKey === r.key} style={{ padding: "3px 6px", fontSize: 11.5 }}>
                  {LINE_STYLES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {!r.is_builtin && r.row && !r.inUse && (
                  <button title="Delete type" onClick={() => removeRow(r)} disabled={savingKey === r.key}
                    style={{ color: "var(--hostile)", padding: "2px 7px", fontSize: 12 }}>✕</button>
                )}
              </div>
            </div>
          ))}

          {/* new type */}
          <div className="row" style={{ borderBottom: "none", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input value={nName} placeholder="New type (e.g. Deity)" style={{ flex: 1, minWidth: 140, fontSize: 13 }}
              onChange={(e) => setNName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addType(); }} />
            <input value={nMark} placeholder="D" maxLength={2} aria-label="New type marker"
              onChange={(e) => setNMark(e.target.value)} style={{ width: 34, textAlign: "center", fontSize: 12 }} />
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 168 }}>
              {ENTITY_SWATCHES.map((s) => (
                <button key={s} title={s} onClick={() => setNSwatch(s)}
                  style={{
                    width: 18, height: 18, padding: 0, borderRadius: 5, cursor: "pointer",
                    background: `var(--k-entity-${s})`,
                    border: nSwatch === s ? "2px solid var(--k-text-primary, var(--ink))" : "1px solid rgba(0,0,0,.15)",
                  }} />
              ))}
            </div>
            <button className="primary" onClick={addType} disabled={!nName.trim() || savingKey === "__new__"}>
              {savingKey === "__new__" ? "…" : "Add type"}
            </button>
          </div>
        </>
      )}
      {err && <p className="err" style={{ margin: "8px 12px 12px" }}>{err}</p>}
    </div>
  );
}
