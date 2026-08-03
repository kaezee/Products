import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Entity, EntityType } from "../lib/types";
import { scanMentions } from "../lib/mentions";
import { scanEmphasis, toggleMarker } from "../lib/emphasis";
import { getEntityTypes } from "../lib/api";
import { buildTypeSwatches } from "../lib/entityTypes";
import { VALENCE_COLOR } from "../lib/valence";
import type { MentionState } from "../lib/mentionState";
import { Icon } from "../components/icons";

// Escape for injection into innerHTML. Quotes are escaped too because the same
// helper feeds attribute values (data-type, data-id) below — a user-authored
// custom type name with a stray quote must not be able to break out of the
// attribute and inject markup. Text content only strictly needs &<>, but
// over-escaping quotes there is harmless.
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"));

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
// A small imperative handle a parent can hold to select an anchor range in this
// prose (used to jump to a comment). Returns false if the quote can't be found.
export interface ProseApi {
  selectRange: (start: number, end: number, quote: string) => boolean;
  format: (marker: "**" | "*") => void;
  block: (kind: "h" | "quote" | "ul" | "ol" | "hr") => void;
}

export function RichProse({ value, entities, onChange, onSelectText, onOpenEntity, stateOf, onMarkEntity, onMarkMoment, onComment, apiRef, placeholder }: {
  value: string;
  entities: Entity[];
  onChange: (v: string) => void;
  onSelectText: (t: string) => void;
  onOpenEntity?: (id: string) => void;
  stateOf?: (entityId: string) => MentionState[];
  onMarkEntity?: () => void;
  onMarkMoment?: () => void;
  onComment?: (range: { start: number; end: number; quote: string }) => void;
  apiRef?: (api: ProseApi | null) => void;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const decorateTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const [peek, setPeek] = useState<{ x: number; y: number; entity: Entity } | null>(null);
  // The floating annotation control — anchored to the current text selection.
  const [sel, setSel] = useState<{ x: number; y: number; len: number; word: boolean } | null>(null);

  // Keep the latest entity set available to the decorate routine.
  const entRef = useRef(entities);
  entRef.current = entities;

  // The last non-empty selection, in plain-text offsets. Some browsers drop the
  // live contentEditable selection when a toolbar button takes the click, so
  // formatting falls back to this remembered range.
  const lastRange = useRef<{ start: number; end: number } | null>(null);

  // type name (lowercased) → curated swatch, so every mention gets its colour
  // from the world's type registry (built-ins + custom), never a hardcoded hex.
  const swatchRef = useRef<Map<string, string>>(new Map());

  // A run of plain text [from,to) with any mentions fully inside it decorated.
  // Mentions never straddle emphasis markers (the * chars are word boundaries),
  // so a mention is always wholly inside or wholly outside an emphasis token.
  function renderRun(text: string, from: number, to: number, mentions: ReturnType<typeof scanMentions>, typeById: Map<string, string>): string {
    const swatches = swatchRef.current;
    let out = "", i = from;
    for (const s of mentions) {
      if (s.start < i || s.end > to) continue;
      const t = typeById.get(s.entityId);
      const sw = t ? swatches.get(t.toLowerCase()) : undefined;
      const style = sw
        ? ` style="--k-ment-color:var(--k-entity-${sw});--k-ment-tint:var(--k-entity-${sw}-tint)"`
        : "";
      const typeAttr = t ? ` data-type="${escapeHtml(t.toLowerCase())}"` : "";
      out += escapeHtml(text.slice(i, s.start));
      out += `<span class="ment" data-id="${escapeHtml(s.entityId)}"${typeAttr}${style}>${escapeHtml(text.slice(s.start, s.end))}</span>`;
      i = s.end;
    }
    out += escapeHtml(text.slice(i, to));
    return out;
  }

  // Inline emphasis + mentions over a single [from,to) slice (one line's content).
  function renderInline(text: string, from: number, to: number, mentions: ReturnType<typeof scanMentions>, typeById: Map<string, string>): string {
    const emph = scanEmphasis(text.slice(from, to));
    let out = "", i = from;
    for (const t of emph) {
      const s = t.start + from, e = t.end + from, is = t.innerStart + from, ie = t.innerEnd + from;
      out += renderRun(text, i, s, mentions, typeById);
      const open = t.tag === "both" ? `<strong class="md-em"><em class="md-em">` : `<${t.tag} class="md-em">`;
      const close = t.tag === "both" ? `</em></strong>` : `</${t.tag}>`;
      out += open + `<span class="md-mark">${escapeHtml(text.slice(s, is))}</span>`;
      out += renderRun(text, is, ie, mentions, typeById);
      out += `<span class="md-mark">${escapeHtml(text.slice(ie, e))}</span>` + close;
      i = e;
    }
    out += renderRun(text, i, to, mentions, typeById);
    return out;
  }

  // Block-level line prefixes. Like emphasis, the marker chars stay in the plain
  // text but render invisibly (md-mark), so the stored body is portable markdown
  // and the caret math (pure text length) is untouched. Everything is INLINE —
  // the surrounding \n's do the line breaks — which is what keeps the editor safe.
  function renderLine(text: string, line: string, lineStart: number, mentions: ReturnType<typeof scanMentions>, typeById: Map<string, string>): string {
    const end = lineStart + line.length;
    if (/^(\* \* \*|\*\*\*)\s*$/.test(line)) return `<span class="md-block md-hr">${escapeHtml(line)}</span>`;
    let m = line.match(/^(#{1,3}) /);
    if (m) { const k = m[1].length; return `<span class="md-mark">${escapeHtml(line.slice(0, k + 1))}</span><span class="md-block md-h md-h${k}">${renderInline(text, lineStart + k + 1, end, mentions, typeById)}</span>`; }
    if (line.startsWith("> ")) return `<span class="md-mark">${escapeHtml(line.slice(0, 2))}</span><span class="md-block md-quote">${renderInline(text, lineStart + 2, end, mentions, typeById)}</span>`;
    if (line.startsWith("- ")) return `<span class="md-mark">${escapeHtml(line.slice(0, 2))}</span><span class="md-block md-li">${renderInline(text, lineStart + 2, end, mentions, typeById)}</span>`;
    m = line.match(/^(\d+)\. /);
    if (m) { const mk = m[1].length + 2; return `<span class="md-mark">${escapeHtml(line.slice(0, mk))}</span><span class="md-block md-oli" data-n="${escapeHtml(m[1])}">${renderInline(text, lineStart + mk, end, mentions, typeById)}</span>`; }
    return renderInline(text, lineStart, end, mentions, typeById);
  }

  function decorateHtml(text: string): string {
    const ents = entRef.current;
    const mentions = scanMentions(text, ents);
    const typeById = new Map(ents.map((e) => [e.id, e.type]));
    const lines = text.split("\n");
    let out = "", pos = 0;
    for (let idx = 0; idx < lines.length; idx++) {
      if (idx > 0) { out += "\n"; pos += 1; }        // the newline stays a real char
      out += renderLine(text, lines[idx], pos, mentions, typeById);
      pos += lines[idx].length;
    }
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

  // Plain-text [start,end) of the current selection within el (order-normalized).
  function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || !el.contains(s.anchorNode)) return null;
    const r = s.getRangeAt(0);
    const a = document.createRange(); a.selectNodeContents(el); a.setEnd(r.startContainer, r.startOffset);
    const b = document.createRange(); b.selectNodeContents(el); b.setEnd(r.endContainer, r.endOffset);
    let start = a.toString().length, end = b.toString().length;
    if (start > end) [start, end] = [end, start];
    return { start, end };
  }
  function locate(el: HTMLElement, off: number): { node: Node; off: number } | null {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null, rem = off;
    while ((n = walk.nextNode())) {
      const len = (n as Text).length;
      if (rem <= len) return { node: n, off: rem };
      rem -= len;
    }
    return null;
  }
  function setSelectionOffsets(el: HTMLElement, a: number, b: number) {
    const p1 = locate(el, a), p2 = locate(el, b);
    if (!p1 || !p2) return;
    const r = document.createRange();
    r.setStart(p1.node, p1.off); r.setEnd(p2.node, p2.off);
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  }

  // Select an anchor range so a parent can jump to a comment. If the stored
  // offsets no longer hold the quote (the prose was edited), re-find the quote;
  // return false only when it's truly gone (a detached comment).
  function selectRange(start: number, end: number, quote: string): boolean {
    const el = edRef.current;
    if (!el) return false;
    const text = el.textContent ?? "";
    let a = start, b = end;
    if (text.slice(a, b) !== quote) {
      const idx = quote ? text.indexOf(quote) : -1;
      if (idx < 0) return false;
      a = idx; b = idx + quote.length;
    }
    el.focus();
    setSelectionOffsets(el, a, b);
    const s = window.getSelection();
    if (s && s.rangeCount) {
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (r.top || r.bottom) el.scrollIntoView({ block: "nearest" });
    }
    reportSelection();
    return true;
  }
  useEffect(() => {
    apiRef?.({ selectRange, format: applyWrap, block: applyBlock });
    return () => apiRef?.(null);
    // eslint-disable-next-line
  }, [apiRef]);

  // Toggle a markdown marker around the selection. Purely a plain-text edit —
  // wrap if bare, unwrap if the markers already hug the selection (either just
  // outside it or just inside), then re-decorate and restore the selection.
  function applyWrap(marker: string) {
    const el = edRef.current;
    if (!el) return;
    let range = selectionOffsets(el);
    if (!range || range.start === range.end) range = lastRange.current;   // toolbar/shortcut lost the live selection
    if (!range || range.start === range.end) return;
    const text = el.textContent ?? "";
    const { next, start: na, end: nb } = toggleMarker(text, range.start, range.end, marker);
    el.textContent = next;
    onChange(next);
    decorate();
    el.focus();
    setSelectionOffsets(el, na, nb);
    lastRange.current = { start: na, end: nb };
    reportSelection();
  }

  // Toggle a block prefix on the caret's line (heading / quote / bullet / number),
  // or drop in a scene break. Plain-text edits; the caret is restored by offset.
  function applyBlock(kind: "h" | "quote" | "ul" | "ol" | "hr") {
    const el = edRef.current;
    if (!el) return;
    const off = caretOffset(el) ?? lastRange.current?.start ?? null;
    if (off == null) return;
    const text = el.textContent ?? "";
    let next: string, caret: number;
    if (kind === "hr") {
      let le = text.indexOf("\n", off); if (le < 0) le = text.length;
      const ins = (le > 0 && text[le - 1] !== "\n" ? "\n" : "") + "* * *\n";
      next = text.slice(0, le) + ins + text.slice(le);
      caret = le + ins.length;
    } else {
      const prefix: Record<string, string> = { h: "# ", quote: "> ", ul: "- ", ol: "1. " };
      const ls = text.lastIndexOf("\n", off - 1) + 1;
      let le = text.indexOf("\n", off); if (le < 0) le = text.length;
      const line = text.slice(ls, le);
      const bare = line.replace(/^(#{1,3} |> |- |\d+\. )/, "");
      const has = kind === "ol" ? /^\d+\. /.test(line) : kind === "h" ? /^#{1,3} /.test(line) : line.startsWith(prefix[kind]);
      const nl = has ? bare : prefix[kind] + bare;
      next = text.slice(0, ls) + nl + text.slice(le);
      caret = Math.max(ls, off + (nl.length - line.length));
    }
    el.textContent = next;
    onChange(next);
    decorate();
    el.focus();
    setCaret(el, caret);
    lastRange.current = { start: caret, end: caret };
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
    setSel(null);
    const text = edRef.current?.textContent ?? "";
    onChange(text);
    window.clearTimeout(decorateTimer.current);
    decorateTimer.current = window.setTimeout(decorate, 150);
  }

  // Firefox lacks plaintext-only: keep Enter as a real "\n" and paste plain.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && sel) { setSel(null); return; }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); applyWrap("**"); return; }
      if (k === "i") { e.preventDefault(); applyWrap("*"); return; }
    }
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
    const s = window.getSelection();
    const el = edRef.current;
    const wrap = wrapRef.current;
    const text = s && el && el.contains(s.anchorNode) ? s.toString() : "";
    onSelectText(text);
    if (text.trim() && el) { const r = selectionOffsets(el); if (r && r.start !== r.end) lastRange.current = r; }
    if (text.trim() && s && s.rangeCount && wrap) {
      // Viewport coordinates — the bar is portaled to <body> so it can't be
      // clipped by the prose column's overflow near the page edges.
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({ x: rect.left + rect.width / 2, y: rect.top, len: text.trim().length, word: !/\s/.test(text.trim()) });
    } else {
      setSel(null);
    }
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
      {sel && createPortal(
        <div className="annot-bar"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "fixed", zIndex: 300,
            left: Math.max(180, Math.min(sel.x, window.innerWidth - 180)),
            top: sel.y > 60 ? sel.y - 8 : sel.y + 24,
            transform: sel.y > 60 ? "translate(-50%, -100%)" : "translate(-50%, 0)",
          }}>
          <button className="annot-fmt" onClick={() => applyWrap("**")} title="Bold (⌘B)"><b>B</b></button>
          <button className="annot-fmt" onClick={() => applyWrap("*")} title="Italic (⌘I)"><i>I</i></button>
          {(onComment || onMarkEntity || onMarkMoment) && <span className="annot-sep" />}
          {onComment && (
            <button onClick={() => {
              const el = edRef.current;
              const range = el && selectionOffsets(el);
              if (el && range && range.start !== range.end) {
                onComment({ start: range.start, end: range.end, quote: (el.textContent ?? "").slice(range.start, range.end) });
              }
              setSel(null);
            }} title="Comment on the selection">💬 Comment</button>
          )}
          {/* Verb order follows selection size (§3.6): a word puts Mark entity
              first; a sentence puts Mark a moment first. */}
          {(() => {
            const markEntity = onMarkEntity && (
              <button key="me" onClick={() => { onMarkEntity(); setSel(null); }} title="Tag the selection as a character, place, item…">✦ Mark entity</button>
            );
            const markMoment = onMarkMoment && (
              <button key="mm" disabled={sel.len < 3} onClick={() => { onMarkMoment(); setSel(null); }} title="Record what happens between characters in the selection">✳ Mark a moment</button>
            );
            return sel.word ? [markEntity, markMoment] : [markMoment, markEntity];
          })()}
        </div>,
        document.body,
      )}
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
                      {s.concealed && <span title="hidden from someone at this point" style={{ marginLeft: 4, display: "inline-flex", color: "var(--obligation)" }}><Icon name="lock" size={11} /></span>}
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
