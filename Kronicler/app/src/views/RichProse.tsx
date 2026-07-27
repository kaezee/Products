import { useEffect, useRef, useState } from "react";
import type { Entity, EntityType } from "../lib/types";
import { scanMentions } from "../lib/mentions";
import { getEntityTypes } from "../lib/api";
import { buildTypeSwatches } from "../lib/entityTypes";
import { VALENCE_COLOR } from "../lib/valence";
import type { MentionState } from "../lib/mentionState";

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

const SUPPORTS_PO = (() => {
  try {
    const d = document.createElement("div");
    d.setAttribute("contenteditable", "plaintext-only");
    return d.contentEditable === "plaintext-only";
  } catch { return false; }
})();

// Level 2, full: a contentEditable prose surface where entity mentions are real
// inline elements (hover-preview + click-through), while the stored value stays
// PLAIN TEXT. plaintext-only gives native Enter→\n, plain paste, and undo; we
// only add the decoration spans and preserve the caret across re-highlights.
export function RichProse({ value, entities, onChange, onSelectText, onOpenEntity, stateOf, placeholder }: {
  value: string;
  entities: Entity[];
  onChange: (v: string) => void;
  onSelectText: (t: string) => void;
  onOpenEntity?: (id: string) => void;
  stateOf?: (entityId: string) => MentionState[];
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const decorateTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const [peek, setPeek] = useState<{ x: number; y: number; entity: Entity } | null>(null);

  // Keep the latest entity set available to the decorate routine.
  const entRef = useRef(entities);
  entRef.current = entities;

  // type name (lowercased) → curated swatch, so every mention gets its colour
  // from the world's type registry (built-ins + custom), never a hardcoded hex.
  const swatchRef = useRef<Map<string, string>>(new Map());

  function decorateHtml(text: string): string {
    const ents = entRef.current;
    const spans = scanMentions(text, ents);
    const typeById = new Map(ents.map((e) => [e.id, e.type]));
    const swatches = swatchRef.current;
    let out = "", i = 0;
    for (const s of spans) {
      const t = typeById.get(s.entityId);
      const sw = t ? swatches.get(t.toLowerCase()) : undefined;
      const style = sw
        ? ` style="--k-ment-color:var(--k-entity-${sw});--k-ment-tint:var(--k-entity-${sw}-tint)"`
        : "";
      const typeAttr = t ? ` data-type="${escapeHtml(t.toLowerCase())}"` : "";
      out += escapeHtml(text.slice(i, s.start));
      out += `<span class="ment" data-id="${s.entityId}"${typeAttr}${style}>${escapeHtml(text.slice(s.start, s.end))}</span>`;
      i = s.end;
    }
    out += escapeHtml(text.slice(i));
    return out;
  }

  function caretOffset(el: HTMLElement): number | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }
  function setCaret(el: HTMLElement, off: number | null) {
    if (off == null) return;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null, rem = off, node: Node | null = null;
    while ((n = walk.nextNode())) {
      const len = (n as Text).length;
      if (rem <= len) { node = n; break; }
      rem -= len;
    }
    const r = document.createRange();
    if (node) r.setStart(node, rem);
    else { r.selectNodeContents(el); r.collapse(false); }
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }

  function decorate() {
    const el = edRef.current;
    if (!el || composing.current) return;
    const text = el.textContent ?? "";
    const html = decorateHtml(text);
    if (el.innerHTML !== html) {
      const focused = document.activeElement === el;
      const off = focused ? caretOffset(el) : null;
      el.innerHTML = html;
      if (focused) setCaret(el, off);
    }
  }

  // Mount: configure the element and paint the initial value.
  useEffect(() => {
    const el = edRef.current;
    if (!el) return;
    el.contentEditable = SUPPORTS_PO ? "plaintext-only" : "true";
    el.innerHTML = decorateHtml(value);
    // eslint-disable-next-line
  }, []);

  // External value changes (version restore) while not actively editing.
  useEffect(() => {
    const el = edRef.current;
    if (!el || document.activeElement === el) return;
    if ((el.textContent ?? "") !== value) el.innerHTML = decorateHtml(value);
    // eslint-disable-next-line
  }, [value]);

  // Load the world's type registry so mentions colour from curated swatches.
  const worldId = entities[0]?.world_id;
  useEffect(() => {
    if (!worldId) return;
    let live = true;
    getEntityTypes(worldId).then((rows: EntityType[]) => {
      if (!live) return;
      const names = entRef.current.map((e) => e.type);
      swatchRef.current = buildTypeSwatches(rows, names);
      decorate();
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line
  }, [worldId]);

  // Re-highlight when the cast changes (entities finish loading, alias added…).
  useEffect(() => {
    // rebuild in case a new custom type appeared among the entities
    if (swatchRef.current.size) {
      swatchRef.current = buildTypeSwatches(
        [...swatchRef.current].map(([name, swatch]) => ({ name, swatch })),
        entities.map((e) => e.type),
      );
    }
    decorate();
    /* eslint-disable-next-line */
  }, [entities]);

  function onInput() {
    if (composing.current) return;
    const text = edRef.current?.textContent ?? "";
    onChange(text);
    window.clearTimeout(decorateTimer.current);
    decorateTimer.current = window.setTimeout(decorate, 150);
  }

  // Firefox lacks plaintext-only: keep Enter as a real "\n" and paste plain.
  function onKeyDown(e: React.KeyboardEvent) {
    if (SUPPORTS_PO) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const tn = document.createTextNode("\n");
      r.insertNode(tn);
      r.setStartAfter(tn); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      onInput();
    }
  }
  function onPaste(e: React.ClipboardEvent) {
    if (SUPPORTS_PO) return;
    e.preventDefault();
    const t = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const tn = document.createTextNode(t);
    r.insertNode(tn);
    r.setStartAfter(tn); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    onInput();
  }

  function reportSelection() {
    const sel = window.getSelection();
    const el = edRef.current;
    if (sel && el && el.contains(sel.anchorNode)) onSelectText(sel.toString());
  }

  function showCardFor(m: HTMLElement) {
    window.clearTimeout(hideTimer.current);
    const ent = entities.find((e) => e.id === m.dataset.id);
    const wrap = wrapRef.current;
    if (!ent || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    setPeek({ x: Math.min(mr.left - wr.left, wr.width - 250), y: mr.bottom - wr.top, entity: ent });
  }
  function scheduleHide() {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setPeek(null), 220);
  }

  return (
    <div className="prose-wrap" ref={wrapRef}>
      <div
        ref={edRef}
        className="rich"
        data-placeholder={placeholder}
        spellCheck
        suppressContentEditableWarning
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onMouseUp={reportSelection}
        onKeyUp={reportSelection}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; decorate(); }}
        onMouseOver={(e) => { const m = (e.target as HTMLElement).closest?.(".ment") as HTMLElement | null; if (m) showCardFor(m); }}
        onMouseOut={(e) => { const m = (e.target as HTMLElement).closest?.(".ment"); if (m) scheduleHide(); }}
      />
      {peek && (() => {
        const sw = swatchRef.current.get(peek.entity.type.toLowerCase());
        const states = stateOf ? stateOf(peek.entity.id).slice(0, 4) : [];
        return (
        <div className="pop"
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={scheduleHide}
          style={{ position: "absolute", left: Math.max(8, peek.x), top: peek.y + 8, width: 250, zIndex: 6, background: "var(--surface)", border: "1px solid var(--lineStrong)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--pop)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span className="title-serif" style={{ fontSize: 15, flex: 1 }}>{peek.entity.title}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--sub)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: sw ? `var(--k-entity-${sw})` : "var(--faint)" }} />
              {peek.entity.type}
            </span>
          </div>
          {peek.entity.aliases.length > 0 && <div className="note" style={{ marginBottom: 6 }}>"{peek.entity.aliases.join('", "')}"</div>}
          <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.5 }}>
            {peek.entity.body ? peek.entity.body.slice(0, 140) + (peek.entity.body.length > 140 ? "…" : "") : <span className="muted">No description yet.</span>}
          </div>
          {states.length > 0 && (
            <div style={{ marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
              <div className="label" style={{ margin: "0 0 5px", fontSize: 10 }}>As of here</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {states.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, lineHeight: 1.35 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 1, background: VALENCE_COLOR[s.valence] }} />
                    <span style={{ flex: 1 }}>
                      <span style={{ color: "var(--ink)" }}>{s.label}</span>
                      <span style={{ color: "var(--sub)" }}> · {s.other}</span>
                      {s.concealed && <span title="hidden from someone at this point" style={{ marginLeft: 4 }}>🔒</span>}
                      {s.isCorrection && <span className="faint" style={{ marginLeft: 4, fontSize: 10 }}>(revised)</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {onOpenEntity && (
            <div style={{ marginTop: 10 }}>
              <button style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => { const id = peek.entity.id; setPeek(null); onOpenEntity(id); }}>Open page →</button>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
