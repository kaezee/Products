import { useEffect, useRef, useState } from "react";
import type { Entity } from "../lib/types";
import { scanMentions } from "../lib/mentions";

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
const CANON = new Set(["Character", "Place", "Faction", "Item", "Event", "Creature"]);

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
export function RichProse({ value, entities, onChange, onSelectText, onOpenEntity, placeholder }: {
  value: string;
  entities: Entity[];
  onChange: (v: string) => void;
  onSelectText: (t: string) => void;
  onOpenEntity?: (id: string) => void;
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

  function decorateHtml(text: string): string {
    const ents = entRef.current;
    const spans = scanMentions(text, ents);
    const typeById = new Map(ents.map((e) => [e.id, e.type]));
    let out = "", i = 0;
    for (const s of spans) {
      const t = typeById.get(s.entityId);
      const cls = t && CANON.has(t) ? `ment ment-${t}` : "ment";
      out += escapeHtml(text.slice(i, s.start));
      out += `<span class="${cls}" data-id="${s.entityId}">${escapeHtml(text.slice(s.start, s.end))}</span>`;
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

  // Re-highlight when the cast changes (entities finish loading, alias added…).
  useEffect(() => { decorate(); /* eslint-disable-next-line */ }, [entities]);

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
      {peek && (
        <div className="pop"
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={scheduleHide}
          style={{ position: "absolute", left: Math.max(8, peek.x), top: peek.y + 8, width: 240, zIndex: 6, background: "var(--surface)", border: "1px solid var(--lineStrong)", borderRadius: 12, padding: "12px 14px", boxShadow: "var(--pop)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span className="title-serif" style={{ fontSize: 15, flex: 1 }}>{peek.entity.title}</span>
            <span className="chip">{peek.entity.type}</span>
          </div>
          {peek.entity.aliases.length > 0 && <div className="note" style={{ marginBottom: 6 }}>"{peek.entity.aliases.join('", "')}"</div>}
          <div style={{ fontSize: 12.5, color: "var(--sub)", lineHeight: 1.5 }}>
            {peek.entity.body ? peek.entity.body.slice(0, 160) + (peek.entity.body.length > 160 ? "…" : "") : <span className="muted">No description yet.</span>}
          </div>
          {onOpenEntity && (
            <div style={{ marginTop: 10 }}>
              <button style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => { const id = peek.entity.id; setPeek(null); onOpenEntity(id); }}>Open page →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
